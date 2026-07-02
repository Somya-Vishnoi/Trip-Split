import time
from src.geocoding import geocode_city
from src.overpass import fetch_venues

def run_verification():
    test_city = "Rome"
    print(f"--- Verification Phase 1: Geocoding & Overpass Fetch for '{test_city}' ---")
    
    # Test Geocoding (uncached or cached)
    start_time = time.time()
    geo_data = geocode_city(test_city)
    elapsed_geo = time.time() - start_time
    
    if not geo_data:
        print("[FAIL] Geocoding returned no result.")
        return
        
    print(f"[SUCCESS] Geocoded '{test_city}':")
    print(f"  Display Name: {geo_data['display_name']}")
    print(f"  Location: {geo_data['lat']}, {geo_data['lon']}")
    print(f"  Bbox: {geo_data['bbox']}")
    print(f"  Time taken: {elapsed_geo:.2f} seconds")
    
    # Test Overpass Fetch
    print(f"\nFetching venues near '{test_city}' from Overpass...")
    start_time = time.time()
    venues = fetch_venues(test_city, geo_data['bbox'])
    elapsed_fetch = time.time() - start_time
    
    print("[SUCCESS] Fetched venues:")
    print(f"  Hotels found: {len(venues['hotels'])}")
    print(f"  Restaurants found: {len(venues['restaurants'])}")
    print(f"  Attractions found: {len(venues['attractions'])}")
    print(f"  Time taken: {elapsed_fetch:.2f} seconds")
    
    # Test Caching
    print("\n--- Verifying Caching ---")
    print("Running geocoding and fetching again to test cache...")
    start_time = time.time()
    
    cached_geo = geocode_city(test_city)
    cached_venues = fetch_venues(test_city, cached_geo['bbox'])
    
    elapsed_cache = time.time() - start_time
    print(f"  Cache check time: {elapsed_cache:.4f} seconds")
    if elapsed_cache < 0.1:
        print("[SUCCESS] Caching works! The data was loaded in under 0.1 seconds.")
    else:
        print("[WARNING] Cache did not respond as fast as expected. Check cache implementation.")

if __name__ == "__main__":
    run_verification()
