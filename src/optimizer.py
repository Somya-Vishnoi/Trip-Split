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
    name_lower = tags.get("name", "").lower()
    
    # 1. Hotels / Stays
    if category == "hotels":
        stars = tags.get("stars")
        try:
            stars_val = int(stars) if stars else 3
        except ValueError:
            stars_val = 3

        rooms_needed = math.ceil(people / 2.0)
        
        # A. Luxury Classification (5 stars or explicitly luxury-branded)
        if stars_val >= 5 or "luxury" in name_lower or "5-star" in name_lower or "5 star" in name_lower:
            cost_per_night = DEFAULT_COSTS["hotel_luxury"] * rooms_needed
            utility = DEFAULT_UTILITY["hotel_luxury"]
        # B. Hostel / Dorm (Charge per person for shared beds)
        elif sub_type in ["hostel", "dormitory"] or "hostel" in name_lower or "zostel" in name_lower or "dorm" in name_lower or "backpack" in name_lower:
            cost_per_night = DEFAULT_COSTS["hotel_budget"] * people
            utility = DEFAULT_UTILITY["hotel_budget"]
        # C. Budget rooms (Homestays, guest houses, motels, apartments - charge per room)
        elif sub_type in ["guest_house", "motel", "apartment", "chalet", "camp_site", "alpine_hut"] or "guest house" in name_lower or "homestay" in name_lower or "inn" in name_lower or "cottage" in name_lower or "lodge" in name_lower or "camp" in name_lower:
            cost_per_night = (DEFAULT_COSTS["hotel_budget"] * 1.25) * rooms_needed
            utility = DEFAULT_UTILITY["hotel_budget"] + 15.0 # Higher utility than hostels due to privacy
        # D. Mid-range Hotel
        else:
            cost_per_night = DEFAULT_COSTS["hotel_mid"] * rooms_needed
            utility = DEFAULT_UTILITY["hotel_mid"]
            
        return cost_per_night, utility

    # 2. Restaurants
    elif category == "restaurants":
        price_level = tags.get("price_level")
        cuisine = tags.get("cuisine", "").lower()
        
        if price_level:
            try:
                pl = int(price_level)
            except ValueError:
                pl = 2
        else:
            pl = 2
            
        if pl >= 3 or "fine_dining" in cuisine or "luxury" in name_lower:
            cost_per_meal = DEFAULT_COSTS["restaurant_luxury"] * people
            utility = DEFAULT_UTILITY["restaurant_luxury"]
        elif pl == 1 or "fast_food" in name_lower or "street_food" in name_lower:
            cost_per_meal = DEFAULT_COSTS["restaurant_budget"] * people
            utility = DEFAULT_UTILITY["restaurant_budget"]
        else:
            cost_per_meal = DEFAULT_COSTS["restaurant_mid"] * people
            utility = DEFAULT_UTILITY["restaurant_mid"]
            
        return cost_per_meal, utility

    # 3. Attractions (Ghumi Ghumi)
    else:
        tags = venue.get("tags", {})
        has_web_presence = "wikipedia" in tags or "wikidata" in tags or "website" in tags or "contact:website" in tags
        
        # Check sub-types and properties to assign budget/student friendly cost
        religion = tags.get("amenity") == "place_of_worship" or "religion" in tags
        historic_ruin = tags.get("historic") in ["ruins", "monument", "tomb", "city_gate", "arch", "memorial"]
        
        if sub_type == "museum":
            # Student-friendly museum entry pricing
            cost_per_visit = 50.0 * people
            utility = DEFAULT_UTILITY["attraction_museum"]
        elif sub_type == "beach":
            cost_per_visit = 0.0
            utility = 85.0
        elif sub_type == "viewpoint":
            cost_per_visit = 0.0
            utility = 80.0
        elif sub_type == "park":
            cost_per_visit = 0.0 # Public parks/gardens are generally free in India
            utility = DEFAULT_UTILITY["attraction_park"] if has_web_presence else 20.0
        elif sub_type == "bar":
            cost_per_visit = DEFAULT_COSTS["attraction_bar"] * people
            utility = DEFAULT_UTILITY["attraction_bar"]
        elif religion or historic_ruin:
            # Temples, churches, ruins are free & high utility
            cost_per_visit = 0.0
            utility = 75.0
        else:
            # Budget friendly default attraction fee (₹100 instead of ₹200)
            cost_per_visit = 100.0 * people
            utility = DEFAULT_UTILITY["attraction_other"]

        # Boost major landmarks globally (wikipedia/website presence or explicitly tagged historic/attraction landmarks)
        is_landmark = tags.get("tourism") == "attraction" or tags.get("historic") is not None
        if has_web_presence or is_landmark:
            utility += 20.0
            
        utility = min(utility, 100.0)
        return cost_per_visit, utility


def run_budget_knapsack(
    hotels: List[Dict[str, Any]],
    restaurants: List[Dict[str, Any]],
    attractions: List[Dict[str, Any]],
    days: int,
    people: int,
    total_budget: float,
    include_stay: bool = True,
    include_transport: bool = True,
    include_attractions: bool = True,
    lat: float = None,
    lon: float = None
) -> Dict[str, Any]:
    """
    Optimizes trip itinerary within budget using a multi-stage constrained Knapsack DP.
    Supports stay, transport, and attraction toggles.
    """
    # 1. Transport cost deduction
    transport_cost = 0.0
    if include_transport:
        transport_cost = 150.0 * people * days  # Heuristic for group-size-aware local transit
        total_budget -= transport_cost
        if total_budget < 0:
            return {"status": "exceeded", "message": "Budget is too low to afford local transport."}

    N_r = 2 * days
    N_a = 2 * days if include_attractions else 0

    # 2. Filter out utility/administrative/public infrastructure names (no police stations, hospital gardens, divisional offices, etc.)
    def is_valid_venue(venue):
        name_lower = venue.get("name", "").lower()
        exclude_words = [
            "police", "hospital", "clinic", "post office", "toilet", "restroom", "atm", "bank", 
            "trash", "dustbin", "waste bin", "garbage", "office of", "department of", "ministry of", 
            "fire station", "court", "station house", "police post", "distillery", "commissioner",
            "divisional office", "forest officer", "sbi", "hdfc", "icici", "state bank", "axis bank",
            "corporate office", "office", "business park", "headquarters"
        ]
        return not any(word in name_lower for word in exclude_words)

    hotels = [h for h in hotels if is_valid_venue(h)]
    restaurants = [r for r in restaurants if is_valid_venue(r)]
    attractions = [a for a in attractions if is_valid_venue(a)]

    # 3. Assign costs and utilities
    for h in hotels:
        c_night, u = assign_heuristics(h, "hotels", people)
        h["cost"] = c_night * days if include_stay else 0.0
        h["utility"] = u if include_stay else 0.0
        
    for r in restaurants:
        c_meal, u = assign_heuristics(r, "restaurants", people)
        r["cost"] = c_meal
        r["utility"] = u

    for a in attractions:
        c_visit, u = assign_heuristics(a, "attractions", people)
        a["cost"] = c_visit
        a["original_cost"] = c_visit
        a["utility"] = u

    # Balanced filtering helper
    def get_balanced_subset(items, key_ratio, key_cost, limit=35):
        if not items:
            return []
        by_cost = sorted(items, key=key_cost)
        by_ratio = sorted(items, key=key_ratio, reverse=True)
        selected = {}
        for item in by_cost[:limit // 2]:
            selected[item["id"]] = item
        for item in by_ratio:
            if len(selected) >= limit:
                break
            selected[item["id"]] = item
        return list(selected.values())

    # Filter candidates
    hotels_filtered = get_balanced_subset(hotels, lambda x: x["utility"], lambda x: x["cost"], 25)
    restaurants_filtered = get_balanced_subset(restaurants, lambda x: x["utility"] / max(x["cost"], 1.0), lambda x: x["cost"], 35)
    
    # Show popular attractions (up to 40) sorted by utility descending
    attractions_filtered = sorted(attractions, key=lambda x: x["utility"], reverse=True)[:40] if include_attractions else []

    # 3. Handle NO STAY
    if not include_stay:
        # Create a virtual depot at the city center
        h_lat = lat if lat else (sum(r["lat"] for r in restaurants[:10]) / len(restaurants[:10]) if restaurants else 0.0)
        h_lon = lon if lon else (sum(r["lon"] for r in restaurants[:10]) / len(restaurants[:10]) if restaurants else 0.0)
        virtual_depot = {
            "id": "virtual_depot",
            "name": "No Accommodation (Day-Trip / Local)",
            "lat": h_lat,
            "lon": h_lon,
            "cost": 0.0,
            "utility": 0.0,
            "sub_type": "depot",
            "stars": None
        }
        hotels_filtered = [virtual_depot]

    if not hotels_filtered:
        return {"status": "failed", "message": "No hotels or accommodations found in the area."}

    # 4. Handle Restaurant Scarcity (Cycle/duplicate if count < N_r)
    if len(restaurants_filtered) < N_r:
        if len(restaurants_filtered) == 0:
            h_lat = lat if lat else 0.0
            h_lon = lon if lon else 0.0
            dummy_rest = {
                "id": "dummy_restaurant_1",
                "name": "Local Restaurant / Food Stall",
                "lat": h_lat,
                "lon": h_lon,
                "cost": DEFAULT_COSTS["restaurant_budget"] * people,
                "utility": DEFAULT_UTILITY["restaurant_budget"],
                "sub_type": "restaurant"
            }
            restaurants_filtered = [dummy_rest]

        original_rests = list(restaurants_filtered)
        for idx, r in enumerate(original_rests):
            r["base_id"] = r.get("base_id", r["id"])
            r["meal_slot"] = idx
            r["is_duplicate"] = False
            
        while len(restaurants_filtered) < N_r:
            for r in original_rests:
                if len(restaurants_filtered) >= N_r:
                    break
                clone = r.copy()
                clone["id"] = f"{r['id']}_dup_{len(restaurants_filtered)}"
                clone["base_id"] = r["base_id"]
                clone["meal_slot"] = len(restaurants_filtered)
                clone["is_duplicate"] = True
                restaurants_filtered.append(clone)

    budget_int = int(total_budget)
    
    # -----------------------------
    # Stage 1: Hotel/Depot Selection (exactly 1)
    # -----------------------------
    dp_hotels: Dict[int, Tuple[float, Dict[str, Any]]] = {}
    for h in hotels_filtered:
        c_int = int(h["cost"])
        if c_int <= budget_int:
            if c_int not in dp_hotels or h["utility"] > dp_hotels[c_int][0]:
                dp_hotels[c_int] = (h["utility"], h)

    if not dp_hotels:
        return {"status": "exceeded", "message": "Budget is too low to afford accommodation."}

    # -----------------------------
    # Stage 2: Restaurant Selection (exactly N_r)
    # -----------------------------
    dp_rest: List[Dict[int, Tuple[float, List[Dict[str, Any]]]]] = [{} for _ in range(N_r + 1)]
    for b_h, (util, hotel) in dp_hotels.items():
        dp_rest[0][b_h] = (util, [hotel])

    for r in restaurants_filtered:
        c_int = int(r["cost"])
        for k in range(N_r - 1, -1, -1):
            next_k = k + 1
            for b_prev, (util_prev, items_prev) in dp_rest[k].items():
                b_next = b_prev + c_int
                if b_next <= budget_int:
                    # Check if this restaurant or any duplicate of the same base restaurant is already in items_prev
                    # Allow duplicates only if they have different meal slots
                    is_dup_same_slot = False
                    r_base_id = r.get("base_id", r["id"])
                    r_meal_slot = r.get("meal_slot")
                    
                    for item in items_prev[1:]: # Skip hotel
                        item_base_id = item.get("base_id", item["id"])
                        item_meal_slot = item.get("meal_slot")
                        if item_base_id == r_base_id:
                            if item_meal_slot == r_meal_slot or item_meal_slot is None or r_meal_slot is None:
                                is_dup_same_slot = True
                                break
                                
                    if is_dup_same_slot:
                        continue
                    new_util = util_prev + r["utility"]
                    if b_next not in dp_rest[next_k] or new_util > dp_rest[next_k][b_next][0]:
                        dp_rest[next_k][b_next] = (new_util, items_prev + [r])

    if not dp_rest[N_r]:
        return {"status": "exceeded", "message": "Budget is too low to afford meals."}

    # -----------------------------
    # Stage 3: Attraction Selection (at most N_a)
    # -----------------------------
    dp_attr: List[Dict[int, Tuple[float, List[Dict[str, Any]]]]] = [{} for _ in range(N_a + 1)]
    for b_r, (util_r, items_r) in dp_rest[N_r].items():
        dp_attr[0][b_r] = (util_r, items_r)

    if N_a > 0:
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
                            dp_attr[next_k][b_next] = (new_util, items_prev + [a])

    # Find best plan
    best_utility = -1.0
    best_budget_cost = 0
    best_items_list = None
    
    for k in range(N_a + 1):
        for b_curr, (util_curr, items_curr) in dp_attr[k].items():
            if util_curr > best_utility:
                best_utility = util_curr
                best_budget_cost = b_curr
                best_items_list = items_curr

    if not best_items_list:
        return {"status": "exceeded", "message": "Could not find a feasible budget allocation."}

    hotel_sel = best_items_list[0]
    rests_sel = best_items_list[1 : 1 + N_r]
    attrs_sel = best_items_list[1 + N_r :]
    
    return {
        "status": "success",
        "hotel": hotel_sel,
        "restaurants": rests_sel,
        "attractions": attrs_sel,
        "total_cost": float(best_budget_cost) + transport_cost,
        "utility": best_utility
    }


def optimize_trip_budget(
    venues: Dict[str, List[Dict[str, Any]]],
    days: int,
    people: int,
    total_budget: float,
    include_stay: bool = True,
    include_transport: bool = True,
    include_attractions: bool = True,
    lat: float = None,
    lon: float = None
) -> Dict[str, Any]:
    """
    Main entry point for trip budget optimization with filter toggles.
    """
    hotels = venues.get("hotels", [])
    restaurants = venues.get("restaurants", [])
    attractions = venues.get("attractions", [])

    primary_res = run_budget_knapsack(
        hotels, restaurants, attractions, days, people, total_budget,
        include_stay, include_transport, include_attractions, lat, lon
    )
    
    if primary_res["status"] == "success":
        # Create a backup economy plan at 70% of the budget
        backup_budget = total_budget * 0.7
        backup_res = run_budget_knapsack(
            hotels, restaurants, attractions, days, people, backup_budget,
            include_stay, include_transport, include_attractions, lat, lon
        )
        
        if backup_res["status"] == "success":
            primary_res["backup"] = {
                "hotel": backup_res["hotel"],
                "restaurants": backup_res["restaurants"],
                "attractions": backup_res["attractions"],
                "total_cost": backup_res["total_cost"],
                "utility": backup_res["utility"]
            }
        else:
            primary_res["backup"] = None
        return primary_res
    else:
        # Fallback to unlimited budget to ensure a plan is ALWAYS generated
        fallback_res = run_budget_knapsack(
            hotels, restaurants, attractions, days, people, 9999999.0,
            include_stay, include_transport, include_attractions, lat, lon
        )
        if fallback_res["status"] == "success":
            fallback_res["budget_exceeded"] = True
            fallback_res["backup"] = None
            return fallback_res
        
    return primary_res
