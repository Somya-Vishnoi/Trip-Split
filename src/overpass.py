import requests
from typing import Dict, List, Any, Tuple
from src.config import OVERPASS_API_URL
from src.cache import get_cached_response, set_cached_response

def fetch_venues(
    city_name: str, 
    bbox: Tuple[float, float, float, float], 
    lat: float = None, 
    lon: float = None
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetches hotels, restaurants, and attractions from Overpass API.
    Centers the search around the actual city coordinate (lat, lon) with a capped radius to prevent timeouts.
    Returns:
        Dict containing categories: 'hotels', 'restaurants', 'attractions'
    """
    cache_key = f"overpass_{city_name.lower().strip().replace(' ', '_')}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    if lat is not None and lon is not None:
        # Center around the actual geocoded city point (approx 22km x 22km area)
        min_lat = lat - 0.10
        max_lat = lat + 0.10
        min_lon = lon - 0.10
        max_lon = lon + 0.10
    else:
        # Fallback to bounding box center
        min_lat, max_lat, min_lon, max_lon = bbox
        lat_center = (min_lat + max_lat) / 2
        lon_center = (min_lon + max_lon) / 2
        
        if (max_lat - min_lat) > 0.08:
            min_lat = lat_center - 0.04
            max_lat = lat_center + 0.04
        if (max_lon - min_lon) > 0.08:
            min_lon = lon_center - 0.04
            max_lon = lon_center + 0.04

    query = f"""
    [out:json][timeout:30];
    (
      // Stays: Hotels, Hostels, Guest Houses, Motels, Apartments, Chalets, Campsites, Alpine Huts
      node["tourism"~"hotel|hostel|guest_house|motel|apartment|chalet|camp_site|alpine_hut"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["tourism"~"hotel|hostel|guest_house|motel|apartment|chalet|camp_site|alpine_hut"]({min_lat},{min_lon},{max_lat},{max_lon});
      
      // Restaurants & Cafes
      node["amenity"~"restaurant|cafe|fast_food"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"~"restaurant|cafe|fast_food"]({min_lat},{min_lon},{max_lat},{max_lon});
      
      // Attractions: Museums, Monuments, Parks, Bars, Beaches, Viewpoints, and general attractions
      node["tourism"~"museum|gallery|zoo|attraction|viewpoint"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["tourism"~"museum|gallery|zoo|attraction|viewpoint"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["natural"~"beach"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["natural"~"beach"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["historic"~"monument|castle"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["historic"~"monument|castle"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["leisure"~"park|garden"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["leisure"~"park|garden"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"~"bar|pub|nightclub"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"~"bar|pub|nightclub"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out center;
    """

    response_data = {"hotels": [], "restaurants": [], "attractions": []}

    headers = {
        "User-Agent": "TripSplit-Budget-Optimizer/1.0"
    }

    try:
        response = requests.post(OVERPASS_API_URL, data={"data": query}, headers=headers, timeout=35)
        response.raise_for_status()
        elements = response.json().get("elements", [])

        for el in elements:
            tags = el.get("tags", {})
            name = tags.get("name")
            if not name:
                continue

            # Exclude utility/administrative/public infrastructure names
            name_lower = name.lower()
            exclude_words = ["police", "hospital", "clinic", "post office", "toilet", "restroom", "atm", "bank", "trash", "dustbin", "waste bin", "garbage"]
            if any(word in name_lower for word in exclude_words):
                continue

            # Determine coordinates (center if way/relation, lat/lon if node)
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat is None or lon is None:
                continue

            venue_info = {
                "id": f"{el['type']}_{el['id']}",
                "name": name,
                "lat": float(lat),
                "lon": float(lon),
                "tags": tags
            }

            # Classify based on OSM tags
            is_hotel = "tourism" in tags and tags["tourism"] in ["hotel", "hostel", "guest_house", "motel", "apartment", "chalet", "camp_site", "alpine_hut"]
            is_food = "amenity" in tags and tags["amenity"] in ["restaurant", "cafe", "fast_food"]
            
            if is_hotel:
                # Add sub-type and stars if available
                venue_info["sub_type"] = tags.get("tourism")
                venue_info["stars"] = tags.get("stars")
                response_data["hotels"].append(venue_info)
            elif is_food:
                venue_info["sub_type"] = tags.get("amenity")
                venue_info["cuisine"] = tags.get("cuisine")
                venue_info["price_level"] = tags.get("price_level")
                response_data["restaurants"].append(venue_info)
            else:
                # Attractions: determine sub-category
                sub_type = "other"
                if "tourism" in tags and tags["tourism"] in ["museum", "gallery"]:
                    sub_type = "museum"
                elif "historic" in tags:
                    sub_type = "museum" # Group historic landmarks as museum-like
                elif "natural" in tags and tags["natural"] == "beach":
                    sub_type = "beach"
                elif "tourism" in tags and tags["tourism"] == "viewpoint":
                    sub_type = "viewpoint"
                elif "leisure" in tags and tags["leisure"] in ["park", "garden"]:
                    sub_type = "park"
                elif "amenity" in tags and tags["amenity"] in ["bar", "pub", "nightclub"]:
                    sub_type = "bar"

                venue_info["sub_type"] = sub_type
                response_data["attractions"].append(venue_info)

        # Remove duplicate names in each category to clean up data
        for cat in response_data:
            seen = set()
            unique_list = []
            for item in response_data[cat]:
                if item["name"].lower() not in seen:
                    seen.add(item["name"].lower())
                    unique_list.append(item)
            response_data[cat] = unique_list

        # Only cache if we actually found venues
        if len(response_data["hotels"]) > 0 or len(response_data["restaurants"]) > 0:
            set_cached_response(cache_key, response_data)
        return response_data

    except Exception as e:
        print(f"[Overpass Error] Failed to fetch venues for {city_name}: {e}")
        return response_data
