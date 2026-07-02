import requests
from typing import Dict, Any, Optional, Tuple
from src.config import NOMINATIM_USER_AGENT
from src.cache import get_cached_response, set_cached_response

def geocode_city(city_name: str) -> Optional[Dict[str, Any]]:
    """
    Geocodes a city name to its latitude, longitude, and bounding box using Nominatim.
    Uses caching to avoid duplicate web requests.
    Returns:
        Dict with keys: 'lat', 'lon', 'bbox' (minlat, maxlat, minlon, maxlon) or None if not found.
    """
    cache_key = f"geocode_{city_name.lower().strip().replace(' ', '_')}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": city_name,
        "format": "json",
        "limit": 1
    }
    headers = {
        "User-Agent": NOMINATIM_USER_AGENT
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data:
            return None

        result = data[0]
        # Nominatim bbox is [southLatitude, northLatitude, westLongitude, eastLongitude]
        # We will parse it to float values
        bbox_raw = result.get("boundingbox", [])
        if len(bbox_raw) == 4:
            # bbox layout: [min_lat, max_lat, min_lon, max_lon]
            bbox = (
                float(bbox_raw[0]),
                float(bbox_raw[1]),
                float(bbox_raw[2]),
                float(bbox_raw[3])
            )
        else:
            # Fallback if no bbox is returned: create a small box around the point
            lat_val = float(result["lat"])
            lon_val = float(result["lon"])
            bbox = (lat_val - 0.05, lat_val + 0.05, lon_val - 0.05, lon_val + 0.05)

        geocode_data = {
            "display_name": result.get("display_name"),
            "lat": float(result["lat"]),
            "lon": float(result["lon"]),
            "bbox": bbox  # (min_lat, max_lat, min_lon, max_lon)
        }
        
        set_cached_response(cache_key, geocode_data)
        return geocode_data

    except Exception as e:
        print(f"[Geocoding Error] Failed to geocode {city_name}: {e}")
        return None
