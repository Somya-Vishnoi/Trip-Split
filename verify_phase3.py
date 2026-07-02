from src.geocoding import geocode_city
from src.overpass import fetch_venues
from src.optimizer import optimize_trip_budget
from src.router import plan_day_wise_itinerary

def test_routing():
    city = "Rome"
    days = 3
    people = 4
    budget = 150000.0
    
    print(f"--- Verification Phase 3: TSP Day Clustering and Routing for '{city}' ---")
    print(f"Group Size: {people} | Duration: {days} days | Budget: ₹{budget}")
    
    geo = geocode_city(city)
    if not geo:
        print("[FAIL] Geocoding failed")
        return
        
    venues = fetch_venues(city, geo["bbox"])
    res = optimize_trip_budget(venues, days, people, budget)
    
    if res["status"] != "success":
        print(f"[FAIL] Optimization failed: {res.get('message')}")
        return
        
    print("[SUCCESS] Knapsack DP completed successfully. Running router...")
    
    day_itinerary = plan_day_wise_itinerary(
        res["hotel"],
        res["restaurants"],
        res["attractions"],
        days
    )
    
    print(f"\nGenerated Day-wise Itinerary ({len(day_itinerary)} days):")
    for item in day_itinerary:
        print(f"\n--- Day {item['day']} (Travel Distance: {item['total_distance_km']} km) ---")
        print(f"  Attractions on this day: {item['attractions_count']}")
        print(f"  Restaurants on this day: {item['restaurants_count']}")
        print("  Route Sequence:")
        for idx, step in enumerate(item['route']):
            # Print type identifier
            t = "Hotel" if idx in [0, len(item['route']) - 1] else step.get("sub_type", "venue")
            print(f"    {idx + 1}. {step['name']} ({t.upper()})")

if __name__ == "__main__":
    test_routing()
