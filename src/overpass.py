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
    lat_str = f"{lat:.3f}" if lat is not None else ""
    lon_str = f"{lon:.3f}" if lon is not None else ""
    cache_key = f"overpass_{city_name.lower().strip().replace(' ', '_')}_{lat_str}_{lon_str}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    is_large_region = False
    if bbox:
        # bbox layout: (min_lat, max_lat, min_lon, max_lon)
        lat_diff = abs(bbox[1] - bbox[0])
        lon_diff = abs(bbox[3] - bbox[2])
        if lat_diff > 0.15 or lon_diff > 0.15:
            is_large_region = True

    # If it is a known state/region, or geocoding suggests a large bounding box
    region_names = ["goa", "kerala", "himachal pradesh", "shimla", "manali", "uttarakhand", "rajasthan"]
    if city_name.lower().strip() in region_names:
        is_large_region = True

    radius = 0.35 if is_large_region else 0.16

    if lat is not None and lon is not None:
        # Center around the actual geocoded city point
        min_lat = lat - radius
        max_lat = lat + radius
        min_lon = lon - radius
        max_lon = lon + radius
    else:
        # Fallback to bounding box center
        min_lat, max_lat, min_lon, max_lon = bbox
        lat_center = (min_lat + max_lat) / 2
        lon_center = (min_lon + max_lon) / 2
        
        radius_fallback = 0.30 if is_large_region else 0.12
        min_lat = lat_center - radius_fallback
        max_lat = lat_center + radius_fallback
        min_lon = lon_center - radius_fallback
        max_lon = lon_center + radius_fallback

    # Define a wider bounding box for beaches to ensure they are captured along coastlines (Goa/Mumbai)
    w_radius = 0.50 if is_large_region else 0.32
    if lat is not None and lon is not None:
        w_min_lat = lat - w_radius
        w_max_lat = lat + w_radius
        w_min_lon = lon - w_radius
        w_max_lon = lon + w_radius
    else:
        min_lat, max_lat, min_lon, max_lon = bbox
        lat_center = (min_lat + max_lat) / 2
        lon_center = (min_lon + max_lon) / 2
        w_min_lat = lat_center - w_radius
        w_max_lat = lat_center + w_radius
        w_min_lon = lon_center - w_radius
        w_max_lon = lon_center + w_radius

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
      
      // Beaches (wider box search to capture coastlines)
      node["natural"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      way["natural"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      node["tourism"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      way["tourism"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      node["leisure"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      way["leisure"~"beach"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      
      node["historic"~"monument|castle|fort|palace|city_gate|ruins"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      way["historic"~"monument|castle|fort|palace|city_gate|ruins"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      node["leisure"~"park|garden"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["leisure"~"park|garden"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"~"bar|pub|nightclub"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
      way["amenity"~"bar|pub|nightclub"]({w_min_lat},{w_min_lon},{w_max_lat},{w_max_lon});
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
                elif ("natural" in tags and tags["natural"] == "beach") or \
                     ("tourism" in tags and tags["tourism"] == "beach") or \
                     ("leisure" in tags and tags["leisure"] == "beach") or \
                     ("beach" in tags) or \
                     ("beach" in name_lower or "chowpatty" in name_lower or "sea shore" in name_lower):
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
