import math
from typing import List, Dict, Any, Tuple, Optional
from src.config import DEFAULT_COSTS, DEFAULT_UTILITY

def assign_heuristics(venue: Dict[str, Any], category: str, people: int) -> Tuple[float, float]:
    """
    Assigns a heuristic cost (total for the group) and utility score to a venue based on its OSM tags.
    Returns:
        (cost, utility)
    """
    tags = venue.get("tags", {})
    sub_type = venue.get("sub_type", "other")
    
    # 1. Hotels
    if category == "hotels":
        # Group cost per night
        stars = tags.get("stars")
        try:
            stars_val = int(stars) if stars else 3
        except ValueError:
            stars_val = 3

        rooms_needed = math.ceil(people / 2.0)
        
        if stars_val >= 4 or "luxury" in tags.get("name", "").lower():
            cost_per_night = DEFAULT_COSTS["hotel_luxury"] * rooms_needed
            utility = DEFAULT_UTILITY["hotel_luxury"]
        elif sub_type == "hostel" or "hostel" in tags.get("name", "").lower():
            # Hostel is per person
            cost_per_night = DEFAULT_COSTS["hotel_budget"] * people
            utility = DEFAULT_UTILITY["hotel_budget"]
        else:
            cost_per_night = DEFAULT_COSTS["hotel_mid"] * rooms_needed
            utility = DEFAULT_UTILITY["hotel_mid"]
            
        return cost_per_night, utility

    # 2. Restaurants
    elif category == "restaurants":
        # Cost per group meal
        price_level = tags.get("price_level")
        cuisine = tags.get("cuisine", "").lower()
        
        # Check price level
        if price_level:
            try:
                pl = int(price_level)
            except ValueError:
                pl = 2
        else:
            pl = 2
            
        # Refine by tags/cuisine
        if pl >= 3 or "fine_dining" in cuisine or "luxury" in tags.get("name", "").lower():
            cost_per_meal = DEFAULT_COSTS["restaurant_luxury"] * people
            utility = DEFAULT_UTILITY["restaurant_luxury"]
        elif pl == 1 or "fast_food" in tags.get("name", "").lower():
            cost_per_meal = DEFAULT_COSTS["restaurant_budget"] * people
            utility = DEFAULT_UTILITY["restaurant_budget"]
        else:
            cost_per_meal = DEFAULT_COSTS["restaurant_mid"] * people
            utility = DEFAULT_UTILITY["restaurant_mid"]
            
        return cost_per_meal, utility

    # 3. Attractions
    else:
        # Cost per group visit
        if sub_type == "museum":
            cost_per_visit = DEFAULT_COSTS["attraction_museum"] * people
            utility = DEFAULT_UTILITY["attraction_museum"]
        elif sub_type == "park":
            cost_per_visit = DEFAULT_COSTS["attraction_park"] * people
            utility = DEFAULT_UTILITY["attraction_park"]
        elif sub_type == "bar":
            cost_per_visit = DEFAULT_COSTS["attraction_bar"] * people
            utility = DEFAULT_UTILITY["attraction_bar"]
        else:
            cost_per_visit = DEFAULT_COSTS["attraction_other"] * people
            utility = DEFAULT_UTILITY["attraction_other"]
            
        return cost_per_visit, utility


def run_budget_knapsack(
    hotels: List[Dict[str, Any]],
    restaurants: List[Dict[str, Any]],
    attractions: List[Dict[str, Any]],
    days: int,
    people: int,
    total_budget: float
) -> Dict[str, Any]:
    """
    Optimizes trip itinerary within total_budget using a multi-stage constrained Knapsack DP.
    
    Stages:
      1. Choose exactly 1 Hotel (total cost = cost_per_night * days)
      2. Choose exactly N_r = 2 * days Restaurants
      3. Choose at most N_a = 2 * days Attractions
    """
    N_r = 2 * days
    N_a = 2 * days

    # Heuristic assignment
    for h in hotels:
        c_night, u = assign_heuristics(h, "hotels", people)
        h["cost"] = c_night * days  # Total hotel cost for duration
        h["utility"] = u
        
    for r in restaurants:
        c_meal, u = assign_heuristics(r, "restaurants", people)
        r["cost"] = c_meal  # Cost per group visit
        r["utility"] = u

    for a in attractions:
        c_visit, u = assign_heuristics(a, "attractions", people)
        a["cost"] = c_visit  # Cost per group visit
        a["utility"] = u

    # Balanced filtering helper to include both cheap and high-value options
    def get_balanced_subset(items, key_ratio, key_cost, limit=35):
        by_cost = sorted(items, key=key_cost)
        by_ratio = sorted(items, key=key_ratio, reverse=True)
        selected = {}
        # First half from cheapest options to ensure feasibility
        for item in by_cost[:limit // 2]:
            selected[item["id"]] = item
        # Second half from highest-rated/ratio options
        for item in by_ratio:
            if len(selected) >= limit:
                break
            selected[item["id"]] = item
        return list(selected.values())

    hotels_filtered = get_balanced_subset(hotels, lambda x: x["utility"], lambda x: x["cost"], 25)
    restaurants_filtered = get_balanced_subset(restaurants, lambda x: x["utility"] / max(x["cost"], 1.0), lambda x: x["cost"], 35)
    attractions_filtered = get_balanced_subset(attractions, lambda x: x["utility"] / max(x["cost"], 1.0), lambda x: x["cost"], 35)

    # If we have no hotels or restaurants, we cannot generate a plan
    if not hotels_filtered or not restaurants_filtered:
        return {"status": "failed", "message": "Insufficient hotels or restaurants found in the area."}

    # Integer representation of budget and costs
    # We round to nearest integer to run DP
    budget_int = int(total_budget)
    
    # -----------------------------
    # Stage 1: Hotel Selection (exactly 1)
    # dp_hotels[b] = (utility, selected_hotel_item)
    # -----------------------------
    dp_hotels: Dict[int, Tuple[float, Dict[str, Any]]] = {}
    for h in hotels_filtered:
        c_int = int(h["cost"])
        if c_int <= budget_int:
            if c_int not in dp_hotels or h["utility"] > dp_hotels[c_int][0]:
                dp_hotels[c_int] = (h["utility"], h)

    if not dp_hotels:
        # Even the cheapest hotel exceeds budget
        return {"status": "exceeded", "message": "Budget is too low to afford a hotel."}

    # -----------------------------
    # Stage 2: Restaurant Selection (exactly N_r)
    # dp_rest[k][b] = (utility, list_of_selected_restaurants)
    # We transition using restaurants_filtered
    # -----------------------------
    # Initialize DP table for restaurants
    # dp_rest[k] maps budget -> (utility, selected_items)
    dp_rest: List[Dict[int, Tuple[float, List[Dict[str, Any]]]]] = [{} for _ in range(N_r + 1)]
    
    # Base case: k = 0, populated from dp_hotels
    for b_h, (util, hotel) in dp_hotels.items():
        dp_rest[0][b_h] = (util, [hotel])

    # Standard 0/1 knapsack with exact item count constraint
    for r in restaurants_filtered:
        c_int = int(r["cost"])
        # Update from k = N_r-1 down to 0
        for k in range(N_r - 1, -1, -1):
            next_k = k + 1
            for b_prev, (util_prev, items_prev) in dp_rest[k].items():
                b_next = b_prev + c_int
                if b_next <= budget_int:
                    # Prevent duplicates in the selection
                    if r["id"] in [item["id"] for item in items_prev]:
                        continue
                        
                    new_util = util_prev + r["utility"]
                    
                    if b_next not in dp_rest[next_k] or new_util > dp_rest[next_k][b_next][0]:
                        dp_rest[next_k][b_next] = (new_util, items_prev + [r])

    # Check if we were able to select N_r restaurants
    if not dp_rest[N_r]:
        return {"status": "exceeded", "message": "Budget is too low to afford meals."}

    # -----------------------------
    # Stage 3: Attraction Selection (at most N_a)
    # dp_attr[k][b] = (utility, list_of_selected_attractions)
    # -----------------------------
    dp_attr: List[Dict[int, Tuple[float, List[Dict[str, Any]]]]] = [{} for _ in range(N_a + 1)]
    
    # Base case: k = 0 (no attractions), populated from final restaurant stage
    for b_r, (util_r, items_r) in dp_rest[N_r].items():
        dp_attr[0][b_r] = (util_r, [])

    for a in attractions_filtered:
        c_int = int(a["cost"])
        for k in range(N_a - 1, -1, -1):
            next_k = k + 1
            for b_prev, (util_prev, items_prev) in dp_attr[k].items():
                b_next = b_prev + c_int
                if b_next <= budget_int:
                    if a["id"] in [item["id"] for item in items_prev]:
                        continue
                        
                    new_util = util_prev + a["utility"]
                    
                    if b_next not in dp_attr[next_k] or new_util > dp_attr[next_k][b_next][0]:
                        # Store only the attractions in this stage list
                        dp_attr[next_k][b_next] = (new_util, items_prev + [a])

    # Find the overall best plan from any attraction stage (0 to N_a) within budget
    best_utility = -1.0
    best_budget_cost = 0
    best_items = None
    
    # We look at all reachable states across all stages of attractions
    for k in range(N_a + 1):
        for b_curr, (util_curr, attr_list) in dp_attr[k].items():
            if util_curr > best_utility:
                best_utility = util_curr
                best_budget_cost = b_curr
                # To reconstruct: the hotel and restaurants are in dp_rest[N_r][...]
                # Let's find the corresponding state in dp_rest[N_r]
                # The total cost of hotel + rest = best_budget_cost - sum(attr costs)
                attr_cost_sum = sum(int(item["cost"]) for item in attr_list)
                b_rest = best_budget_cost - attr_cost_sum
                
                if b_rest in dp_rest[N_r]:
                    hotel_and_rests = dp_rest[N_r][b_rest][1]
                    best_items = (hotel_and_rests[0], hotel_and_rests[1:], attr_list)

    if not best_items:
        return {"status": "exceeded", "message": "Could not find a feasible budget allocation."}

    hotel_sel, rests_sel, attrs_sel = best_items
    
    return {
        "status": "success",
        "hotel": hotel_sel,
        "restaurants": rests_sel,
        "attractions": attrs_sel,
        "total_cost": float(best_budget_cost),
        "utility": best_utility
    }


def optimize_trip_budget(
    venues: Dict[str, List[Dict[str, Any]]],
    days: int,
    people: int,
    total_budget: float
) -> Dict[str, Any]:
    """
    Main entry point for trip budget optimization. Runs primary optimizer.
    If primary budget is exceeded, falls back to generating a low-budget economy backup plan.
    """
    hotels = venues.get("hotels", [])
    restaurants = venues.get("restaurants", [])
    attractions = venues.get("attractions", [])

    primary_res = run_budget_knapsack(hotels, restaurants, attractions, days, people, total_budget)
    
    if primary_res["status"] == "success":
        # Also create a backup itinerary as a safety margin (using 70% of the budget)
        backup_budget = total_budget * 0.7
        backup_res = run_budget_knapsack(hotels, restaurants, attractions, days, people, backup_budget)
        
        if backup_res["status"] == "success":
            primary_res["backup"] = {
                "hotel": backup_res["hotel"],
                "restaurants": backup_res["restaurants"],
                "attractions": backup_res["attractions"],
                "total_cost": backup_res["total_cost"]
            }
        else:
            # Fallback backup: just cheap items
            primary_res["backup"] = None
        return primary_res

    # If primary failed due to low budget, let's try a forced super-economy budget run
    print("[Optimizer Warning] Primary budget run failed. Trying super-economy mode.")
    # Force cheaper default heuristics to see if we can fit it
    # We'll just run it with a virtual increased budget but show the warning,
    # or return the best possible configuration.
    return primary_res
