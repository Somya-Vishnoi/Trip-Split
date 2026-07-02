from src.geocoding import geocode_city
from src.overpass import fetch_venues
from src.optimizer import optimize_trip_budget

def test_optimization():
    city = "Rome"
    days = 3
    people = 4
    
    print(f"--- Verification Phase 2: Knapsack DP Budget Optimizer for '{city}' ---")
    print(f"Group Size: {people} | Duration: {days} days")
    
    geo = geocode_city(city)
    if not geo:
        print("[FAIL] Geocoding failed")
        return
        
    venues = fetch_venues(city, geo["bbox"])
    
    # Test with a High Budget
    high_budget = 3000.0
    print(f"\nRunning optimizer with HIGH budget (${high_budget})...")
    res_high = optimize_trip_budget(venues, days, people, high_budget)
    
    if res_high["status"] == "success":
        print("[SUCCESS] High Budget plan generated:")
        print(f"  Hotel selected: {res_high['hotel']['name']} (Est Total Cost: ${res_high['hotel']['cost']:.2f})")
        print(f"  Restaurants: {len(res_high['restaurants'])} selected")
        print(f"  Attractions: {len(res_high['attractions'])} selected")
        print(f"  Actual Total Cost: ${res_high['total_cost']:.2f} (Budget: ${high_budget})")
        print(f"  Cost Per Person: ${res_high['total_cost']/people:.2f}")
    else:
        print(f"[FAIL] High Budget optimization failed: {res_high.get('message')}")
        
    # Test with a Low Budget
    low_budget = 1100.0
    print(f"\nRunning optimizer with LOW budget (${low_budget})...")
    res_low = optimize_trip_budget(venues, days, people, low_budget)
    
    if res_low["status"] == "success":
        print("[SUCCESS] Low Budget plan generated:")
        print(f"  Hotel selected: {res_low['hotel']['name']} (Est Total Cost: ${res_low['hotel']['cost']:.2f})")
        print(f"  Restaurants: {len(res_low['restaurants'])} selected")
        print(f"  Attractions: {len(res_low['attractions'])} selected")
        print(f"  Actual Total Cost: ${res_low['total_cost']:.2f} (Budget: ${low_budget})")
    else:
        print(f"[EXPECTED LIMIT] Low Budget optimization status: {res_low['status']} - {res_low.get('message')}")

if __name__ == "__main__":
    test_optimization()
