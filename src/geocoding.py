import requests
from typing import Dict, Any, Optional, Tuple
from src.config import NOMINATIM_USER_AGENT
from src.cache import get_cached_response, set_cached_response

KNOWN_INDIAN_CITIES_GEO = {
    "delhi": {"display_name": "Delhi, India", "lat": 28.6139, "lon": 77.2090, "bbox": (28.5639, 28.6639, 77.1590, 77.2590)},
    "new delhi": {"display_name": "New Delhi, India", "lat": 28.6139, "lon": 77.2090, "bbox": (28.5639, 28.6639, 77.1590, 77.2590)},
    "mumbai": {"display_name": "Mumbai, Maharashtra, India", "lat": 19.0760, "lon": 72.8777, "bbox": (19.0260, 19.1260, 72.8277, 72.9277)},
    "goa": {"display_name": "Goa, India", "lat": 15.2993, "lon": 74.1240, "bbox": (14.9993, 15.5993, 73.8240, 74.4240)},
    "jaipur": {"display_name": "Jaipur, Rajasthan, India", "lat": 26.9124, "lon": 75.7873, "bbox": (26.8624, 26.9624, 75.7373, 75.8373)},
    "manali": {"display_name": "Manali, Himachal Pradesh, India", "lat": 32.2432, "lon": 77.1892, "bbox": (32.1932, 32.2932, 77.1392, 77.2392)},
    "shimla": {"display_name": "Shimla, Himachal Pradesh, India", "lat": 31.1048, "lon": 77.1734, "bbox": (31.0548, 31.1548, 77.1234, 77.2234)},
    "kerala": {"display_name": "Kerala, India", "lat": 10.8505, "lon": 76.2711, "bbox": (10.5505, 11.1505, 75.9711, 76.5711)},
    "bengaluru": {"display_name": "Bengaluru, Karnataka, India", "lat": 12.9716, "lon": 77.5946, "bbox": (12.9216, 12.9716, 77.5446, 77.6446)},
    "bangalore": {"display_name": "Bangalore, Karnataka, India", "lat": 12.9716, "lon": 77.5946, "bbox": (12.9216, 12.9716, 77.5446, 77.6446)},
}

def geocode_city(city_name: str) -> Optional[Dict[str, Any]]:
    """
    Geocodes a city name to its latitude, longitude, and bounding box using Nominatim.
    Uses caching and instant fallback table for zero-latency lookups.
    """
    query_name = city_name.lower().strip()
    
    # Fast instant lookup for common destinations
    if query_name in KNOWN_INDIAN_CITIES_GEO:
        return KNOWN_INDIAN_CITIES_GEO[query_name]

    if query_name in ["puducherry", "pondicherry"]:
        query_name_processed = "puducherry city"
    elif query_name == "mumbai":
        query_name_processed = "mumbai city district"
    else:
        query_name_processed = city_name

    cache_key = f"geocode_{query_name_processed.replace(' ', '_')}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query_name_processed,
        "format": "json",
        "limit": 1
    }
    headers = {
        "User-Agent": NOMINATIM_USER_AGENT
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=3)
        response.raise_for_status()
        data = response.json()

        if not data:
            return KNOWN_INDIAN_CITIES_GEO.get(query_name)

        result = data[0]
        bbox_raw = result.get("boundingbox", [])
        if len(bbox_raw) == 4:
            bbox = (
                float(bbox_raw[0]),
                float(bbox_raw[1]),
                float(bbox_raw[2]),
                float(bbox_raw[3])
            )
        else:
            lat_val = float(result["lat"])
            lon_val = float(result["lon"])
            bbox = (lat_val - 0.05, lat_val + 0.05, lon_val - 0.05, lon_val + 0.05)

        geocode_data = {
            "display_name": result.get("display_name"),
            "lat": float(result["lat"]),
            "lon": float(result["lon"]),
            "bbox": bbox
        }
        
        set_cached_response(cache_key, geocode_data)
        return geocode_data

    except Exception as e:
        print(f"[Geocoding Error] Failed to geocode {city_name}: {e}")
        return KNOWN_INDIAN_CITIES_GEO.get(query_name)
