from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from src.geocoding import geocode_city
from src.overpass import fetch_venues
from src.optimizer import optimize_trip_budget
from src.cache import get_cached_response
from src.router import cluster_attractions_by_location
def safe_float(val, default=0.0):
    try:
        if val is None:
            return default
        return float(val)
    except (ValueError, TypeError):
        return default

app = FastAPI(title="TripSplit - Group Trip Budget Optimizer")

@app.middleware("http")
async def disable_caching_middleware(request, call_next):
    response = await call_next(request)
    # Prevent caching of static assets during development
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Serve static files
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

from typing import Optional

class SearchRequest(BaseModel):
    city: str

class PlanRequest(BaseModel):
    city: str
    budget: float
    days: int
    people: int
    include_stay: bool = True
    include_transport: bool = True
    include_attractions: bool = True
    add_travel: bool = False
    origin_city: Optional[str] = None
    travel_mode: Optional[str] = "flight"
    budget_type: Optional[str] = "total"
    travel_month: Optional[str] = "August"
    pace: Optional[str] = "balanced"
    transport_pref: Optional[str] = "flexible"
    accommodation_pref: Optional[str] = "flexible"
    interests: Optional[str] = "no preference"

@app.get("/")
def read_root():
    # Fallback to serve index.html directly for the root url
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        # Create a placeholder if not present
        with open(index_file, "w") as f:
            f.write("<h1>TripSplit Web UI</h1>")
    return FileResponse(index_file)

@app.post("/api/search")
def search_city(req: SearchRequest):
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City name cannot be empty")
    
    geo_data = geocode_city(req.city)
    if not geo_data:
        raise HTTPException(status_code=404, detail=f"Could not geocode city '{req.city}'")
        
    # Fetch venues
    venues = fetch_venues(req.city, geo_data["bbox"], lat=geo_data["lat"], lon=geo_data["lon"])
    
    # If Overpass returns too few results, supplement with real, popular venues generated via Gemini
    if len(venues.get("hotels", [])) < 10 or len(venues.get("restaurants", [])) < 10 or len(venues.get("attractions", [])) < 12:
        from src.gemini import generate_venues_via_gemini
        gv_catalog = generate_venues_via_gemini(req.city)
        if gv_catalog:
            for cat in ["hotels", "restaurants", "attractions"]:
                existing_names = {v.get("name", "").lower().strip() for v in venues.get(cat, []) if v.get("name")}
                for gv in gv_catalog.get(cat, []):
                    if gv.get("name") and gv["name"].lower().strip() not in existing_names:
                        venues[cat].append(gv)
                        
    hotels = venues.get("hotels", [])
    restaurants = venues.get("restaurants", [])
    attractions = venues.get("attractions", [])
    
    return {
        "geocoding": {
            "display_name": geo_data["display_name"],
            "lat": geo_data["lat"],
            "lon": geo_data["lon"],
            "bbox": geo_data["bbox"]
        },
        "venue_counts": {
            "hotels": len(hotels),
            "restaurants": len(restaurants),
            "attractions": len(attractions)
        },
        "sample_venues": {
            "hotels": [h["name"] for h in hotels[:8]],
            "restaurants": [r["name"] for r in restaurants[:8]],
            "attractions": [a["name"] for a in attractions[:15]]
        },
        "all_venues": {
            "hotels": hotels,
            "restaurants": restaurants,
            "attractions": attractions
        }
    }


def calculate_budget_split_option(
    style_name: str,
    city_venues: dict,
    valid_cities: list,
    req: PlanRequest,
    total_budget: float,
    origin_geo: Optional[dict]
) -> dict:
    import math
    from src.optimizer import assign_heuristics
    
    people = req.people
    days = req.days
    nights = max(1, days - 1)
    
    # Calculate transit legs and distance
    # We go: Origin -> City 1 -> City 2 -> ... -> City N -> Origin
    legs = []
    if origin_geo:
        prev_lat, prev_lon = origin_geo["lat"], origin_geo["lon"]
    else:
        prev_lat, prev_lon = valid_cities[0]["geo"]["lat"], valid_cities[0]["geo"]["lon"]
        
    for item in valid_cities:
        clat = item["geo"]["lat"]
        clon = item["geo"]["lon"]
        from src.router import haversine_distance
        d_leg = haversine_distance(prev_lat, prev_lon, clat, clon)
        legs.append(d_leg)
        prev_lat, prev_lon = clat, clon
        
    if origin_geo:
        d_leg = haversine_distance(prev_lat, prev_lon, origin_geo["lat"], origin_geo["lon"])
        legs.append(d_leg)
        
    dist = sum(legs)
    
    # Select mode of transportation based on style & preferences
    mode = "bus"
    if style_name == "Cheapest Trip":
        mode = "train_sleeper" if dist > 200 else "bus"
    elif style_name == "Slow and Relaxed":
        mode = "flight" if dist > 500 else ("train_3ac" if dist > 200 else "bus")
    elif style_name == "Better Stay":
        mode = "train_sleeper" if dist > 200 else "bus"
    else:
        mode = req.travel_mode or "train_3ac"
        if mode == "flight" and dist < 300:
            mode = "train_3ac"
            
    # Calculate round-trip cost per person
    def get_leg_cost(d, m):
        if m == "flight":
            if d < 250: return 150.0 + 1.2 * d
            return 1500.0 + 3.0 * d
        elif m == "train_3ac":
            return 200.0 + 1.0 * d
        elif m == "train_sleeper":
            return 80.0 + 0.45 * d
        else: # bus
            return 60.0 + 1.3 * d

    rt_transport_cost_pp = sum(get_leg_cost(l, mode) for l in legs)
    total_transport_cost = rt_transport_cost_pp * people
    
    # Local travel cost per person per day
    if style_name == "Cheapest Trip":
        local_travel_pp_pd = 100.0
    elif style_name == "More Places":
        local_travel_pp_pd = 300.0
    else:
        local_travel_pp_pd = 200.0
    total_local_travel = local_travel_pp_pd * days * people

    # 2. Food allocation
    if style_name == "Cheapest Trip":
        food_pp_pd = 250.0
    elif style_name == "Slow and Relaxed":
        food_pp_pd = 600.0
    else:
        food_pp_pd = 400.0
    total_food_cost = food_pp_pd * days * people

    # 3. Accommodation cost (nights = days - 1, room based)
    rooms_needed = math.ceil(people / 2.0)
    
    # Distribute days and nights across cities
    n_cities = len(valid_cities)
    base_days = days // n_cities
    extra_days = days % n_cities
    
    city_days = []
    for i in range(n_cities):
        c_d = base_days + (1 if i < extra_days else 0)
        city_days.append(max(1, c_d))
        
    day_to_city = []
    for city_idx, c_days in enumerate(city_days):
        day_to_city.extend([city_idx] * c_days)
    day_to_city = day_to_city[:days]
    
    nights_in_city = [0] * n_cities
    for d in range(1, days):
        c_idx = day_to_city[d-1]
        nights_in_city[c_idx] += 1
        
    # We will choose a hotel for each city that has at least 1 night
    hotel_sel_city = {}
    total_stay_cost = 0.0
    
    # Accommodation budget per night
    if style_name == "Better Stay":
        avail = total_budget - total_transport_cost - total_food_cost - total_local_travel
        max_hotel_total = max(2000.0, avail * 0.7)
        max_nightly = max_hotel_total / nights
    else:
        avail = total_budget - total_transport_cost - total_food_cost - total_local_travel
        max_hotel_total = max(2000.0, avail * 0.45)
        max_nightly = max_hotel_total / nights
        
    for c_idx, item in enumerate(valid_cities):
        city_name = item["name"]
        city_hotels = list(city_venues[city_name].get("hotels", []))
        c_nights = nights_in_city[c_idx]
        
        hotel_sel = None
        if city_hotels and c_nights > 0:
            if style_name == "Cheapest Trip":
                hotels_sorted = sorted(city_hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])
                hotel_sel = hotels_sorted[0]
            elif style_name == "Better Stay":
                fitting = [h for h in city_hotels if assign_heuristics(h, "hotels", people)[0] <= max_nightly]
                if fitting:
                    hotel_sel = sorted(fitting, key=lambda x: safe_float(x.get("stars", 0)) or safe_float(assign_heuristics(x, "hotels", people)[1]), reverse=True)[0]
                else:
                    hotel_sel = sorted(city_hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])[0]
            else:
                fitting = [h for h in city_hotels if assign_heuristics(h, "hotels", people)[0] <= max_nightly]
                if fitting:
                    hotel_sel = sorted(fitting, key=lambda x: safe_float(assign_heuristics(x, "hotels", people)[1]), reverse=True)[0]
                else:
                    hotel_sel = sorted(city_hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])[0]
                    
        hotel_sel_city[city_name] = hotel_sel
        h_cost_per_night = assign_heuristics(hotel_sel, "hotels", people)[0] if hotel_sel else 1200.0 * rooms_needed
        total_stay_cost += h_cost_per_night * c_nights

    # 4. Emergency Buffer
    if style_name == "Cheapest Trip":
        buffer_pct = 0.05
    elif style_name == "Slow and Relaxed":
        buffer_pct = 0.10
    else:
        buffer_pct = 0.07
        
    flexible_budget = total_budget - total_transport_cost - total_stay_cost - total_food_cost - total_local_travel
    if flexible_budget < 0:
        flexible_budget = 0.0
        
    total_buffer = total_budget * buffer_pct
    available_activities_budget = max(0.0, flexible_budget - total_buffer)
    
    # Select activities across all cities
    all_city_attractions = []
    for city_name, venues_dict in city_venues.items():
        for a in venues_dict.get("attractions", []):
            a_copy = dict(a)
            a_copy["city_name"] = city_name
            all_city_attractions.append(a_copy)
            
    sorted_attrs = sorted(all_city_attractions, key=lambda x: assign_heuristics(x, "attractions", people)[1], reverse=True)
    
    selected_attrs = []
    activities_spend = 0.0
    limit_per_city = {item["name"]: max(3, city_days[idx] * 3) for idx, item in enumerate(valid_cities)}
    counts_per_city = {item["name"]: 0 for item in valid_cities}
    
    # All sightseeing attractions are budget-free (cost = 0) in TripSplit, so select top sights by utility
    for a in sorted_attrs:
        cname = a["city_name"]
        if counts_per_city[cname] < limit_per_city[cname]:
            selected_attrs.append(a)
            counts_per_city[cname] += 1

    estimated_total = total_transport_cost + total_stay_cost + total_food_cost + total_local_travel + activities_spend
    actual_buffer = max(0.0, total_budget - estimated_total)
    if actual_buffer > total_buffer * 1.5:
        actual_buffer = total_buffer
        
    estimated_total += actual_buffer
    remaining_balance = max(0.0, total_budget - estimated_total)

    ratio_used = estimated_total / total_budget
    if ratio_used > 0.98:
        confidence = "Tight Budget"
    elif ratio_used > 0.85:
        confidence = "Moderate Confidence"
    else:
        confidence = "Comfortable Budget"

    # Trade-offs and why fits based on choices
    why_fits = ""
    tradeoffs = []
    
    if style_name == "Cheapest Trip":
        why_fits = f"Prioritizes minimal costs. We chose hostels/dorms, public transit or walking, and budget street-food stalls across {n_cities} cities."
        tradeoffs = ["Shared bathroom facilities", "Slower public transit times", "Less luxury, more walking", "Highly active days"]
    elif style_name == "Cheapest with Sights":
        why_fits = f"Ensures you see the best landmarks in {n_cities} cities while keeping your lodging and food costs at rock-bottom levels."
        tradeoffs = ["No luxury hotels", "Public transit or walking between sights", "Active schedule, long days"]
    elif style_name == "Cheapest with Better Stay":
        why_fits = "Allows a comfortable private room/homestay while cutting transport and food costs to stay inside your budget."
        tradeoffs = ["Street food and local stalls", "Public transit instead of private cab", "Less shopping/activities budget"]
    elif style_name == "Cheapest with Private Cab":
        why_fits = "Upgrades your intercity and daily local transport to private cabs to make commuting seamless and fast."
        tradeoffs = ["Budget hotel stay", "Street food and cheap local meals", "Limited sightseeing tickets"]
    else: # Best Overall
        why_fits = f"Balances comfortable mid-range hotels, local private transport, and high-quality meals across {n_cities} cities."
        tradeoffs = ["No luxury resort stays included", "Some walking required for local sightseeing", "Moderate pace with scheduled stops"]

    # Day-by-day itinerary generation
    city_day_indices = {item["name"]: [] for item in valid_cities}
    for d in range(1, days + 1):
        cname = valid_cities[day_to_city[d-1]]["name"]
        city_day_indices[cname].append(d)
        
    city_attrs_distributed = {d: [] for d in range(1, days + 1)}
    for cname, d_list in city_day_indices.items():
        c_attrs = [a for a in selected_attrs if a.get("city_name") == cname]
        attrs_per_day = math.ceil(len(c_attrs) / len(d_list)) if d_list else 1
        for idx, d in enumerate(d_list):
            city_attrs_distributed[d] = c_attrs[idx*attrs_per_day : (idx+1)*attrs_per_day]

    itinerary = []
    for d in range(1, days + 1):
        c_idx = day_to_city[d-1]
        cname = valid_cities[c_idx]["name"]
        hotel_sel = hotel_sel_city[cname]
        day_attrs = city_attrs_distributed[d]
        attr_names = [a["name"] for a in day_attrs]
        
        is_city_start = (d == 1 or day_to_city[d-2] != c_idx)
        
        if d == 1:
            summary = f"Arrival in {cname}, check-in at hotel."
            details = f"Check in to your hotel: {hotel_sel['name'] if hotel_sel else 'Local Lodging'} in {cname}. Spend the afternoon exploring nearby attractions."
        elif is_city_start:
            summary = f"Transit to {cname} & Check-in."
            details = f"Travel from your previous location to {cname}. Check in to your hotel: {hotel_sel['name'] if hotel_sel else 'Local Lodging'}. Afternoon spent orienting yourself in the new city."
        elif d == days:
            summary = f"Departure from {cname}."
            details = f"Enjoy your final breakfast in {cname}, complete checkout, and head to the station for departure back home."
        else:
            if attr_names:
                summary = f"Explore {attr_names[0]} and sights in {cname}."
                details = f"Visit {', '.join(attr_names)} in {cname}. Enjoy local dining and sightseeing."
            else:
                summary = f"Leisurely day in {cname}."
                details = f"Spend a relaxed day exploring local markets, lanes, and tasting authentic street food in {cname}."

        itinerary.append({
            "day": d,
            "city": cname,
            "summary": summary,
            "details": details,
            "stay_name": hotel_sel["name"] if hotel_sel else "Local Stay",
            "stay_rating": hotel_sel.get("stars", 4.0) if hotel_sel else 4.0,
            "transport_mode": mode.replace("_", " ").title(),
            "transport_cost": rt_transport_cost_pp / (2.0 * len(legs)) if d in [1, days] or is_city_start else local_travel_pp_pd,
            "sights": day_attrs
        })

    # Prepare stops (one per city)
    stops = []
    for c_idx, item in enumerate(valid_cities):
        cname = item["name"]
        hotel_sel = hotel_sel_city[cname]
        c_nights = nights_in_city[c_idx]
        
        all_hotels = []
        for h in city_venues[cname].get("hotels", []):
            cost_val, util_val = assign_heuristics(h, "hotels", people)
            h_copy = dict(h)
            h_copy["cost"] = cost_val * max(1, c_nights)
            h_copy["utility"] = util_val
            h_copy["optimized"] = (hotel_sel is not None and h["name"] == hotel_sel.get("name"))
            all_hotels.append(h_copy)
        all_hotels.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
    
        all_restaurants = []
        for r in city_venues[cname].get("restaurants", []):
            cost_val, util_val = assign_heuristics(r, "restaurants", people)
            r_copy = dict(r)
            r_copy["cost"] = cost_val
            r_copy["utility"] = util_val
            r_copy["optimized"] = False
            all_restaurants.append(r_copy)
        all_restaurants.sort(key=lambda x: x.get("utility", 0.0), reverse=True)
    
        all_attractions = []
        for a in city_venues[cname].get("attractions", []):
            cost_val, util_val = assign_heuristics(a, "attractions", people)
            a_copy = dict(a)
            a_copy["cost"] = 0.0
            a_copy["original_cost"] = cost_val
            a_copy["utility"] = util_val
            a_copy["optimized"] = a["name"] in [x["name"] for x in selected_attrs if x.get("city_name") == cname]
            all_attractions.append(a_copy)
        all_attractions.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)

        stop_plan = {
            "city": cname,
            "days": city_days[c_idx],
            "hotel": hotel_sel,
            "restaurants": [],
            "bars": [],
            "zones": [],
            "all_hotels": all_hotels,
            "all_restaurants": all_restaurants,
            "all_bars": [a for a in all_attractions if a.get("sub_type") == "bar"],
            "all_sightseeing": [a for a in all_attractions if a.get("sub_type") != "bar"],
            "all_venues": {
                "hotels": list(city_venues[cname].get("hotels", [])),
                "restaurants": list(city_venues[cname].get("restaurants", [])),
                "attractions": list(city_venues[cname].get("attractions", []))
            }
        }
        stops.append(stop_plan)

    return {
        "style_name": style_name,
        "route_label": " ➔ ".join([origin_geo["display_name"].split(",")[0] if origin_geo else "Origin"] + [c["name"] for c in valid_cities] + [origin_geo["display_name"].split(",")[0] if origin_geo else "Origin"]),
        "total_cost": estimated_total,
        "cost_per_person": estimated_total / people,
        "remaining_budget": remaining_balance,
        "confidence": confidence,
        "why_fits": why_fits,
        "tradeoffs": tradeoffs,
        "budget_split": {
            "Transportation": total_transport_cost,
            "Stay": total_stay_cost,
            "Food": total_food_cost,
            "Local Travel": total_local_travel,
            "Activities": activities_spend,
            "Buffer": actual_buffer
        },
        "itinerary": itinerary,
        "trip": selected_attrs,
        "travel_cost": total_transport_cost,
        "travel_mode": mode,
        "distance_km": dist,
        "stops": stops
    }

def get_fallback_venues(city: str) -> dict:
    c_lower = city.lower().strip()
    c = city.title()
    
    # High-fidelity real-world offline database for popular Indian cities
    database = {
        "delhi": {
            "hotels": [
                {"id": "delhi_h1", "name": "Taj Palace New Delhi", "lat": 28.599, "lon": 77.169, "sub_type": "hotel", "stars": 5.0, "cost": 12000.0, "tags": {"tourism": "hotel"}},
                {"id": "delhi_h2", "name": "The Lodhi", "lat": 28.592, "lon": 77.234, "sub_type": "hotel", "stars": 5.0, "cost": 18000.0, "tags": {"tourism": "hotel"}},
                {"id": "delhi_h3", "name": "Bloomrooms @ Janpath", "lat": 28.621, "lon": 77.221, "sub_type": "hotel", "stars": 4.0, "cost": 4500.0, "tags": {"tourism": "hotel"}},
                {"id": "delhi_h4", "name": "Zostel Delhi", "lat": 28.642, "lon": 77.220, "sub_type": "hostel", "stars": 3.5, "cost": 650.0, "tags": {"tourism": "hotel"}},
                {"id": "delhi_h5", "name": "The Manor New Delhi", "lat": 28.564, "lon": 77.262, "sub_type": "hotel", "stars": 4.0, "cost": 7000.0, "tags": {"tourism": "hotel"}},
                {"id": "delhi_h6", "name": "Maidens Hotel Delhi", "lat": 28.676, "lon": 77.224, "sub_type": "hotel", "stars": 4.5, "cost": 8500.0, "tags": {"tourism": "hotel"}},
            ],
            "restaurants": [
                {"id": "delhi_r1", "name": "Bukhara Restaurant", "lat": 28.598, "lon": 77.169, "sub_type": "restaurant", "cuisine": "indian", "cost": 3000.0, "tags": {"amenity": "restaurant"}},
                {"id": "delhi_r2", "name": "Karim's Old Delhi", "lat": 28.649, "lon": 77.233, "sub_type": "restaurant", "cuisine": "mughlai", "cost": 600.0, "tags": {"amenity": "restaurant"}},
                {"id": "delhi_r3", "name": "Saravana Bhavan Janpath", "lat": 28.628, "lon": 77.219, "sub_type": "restaurant", "cuisine": "south_indian", "cost": 400.0, "tags": {"amenity": "restaurant"}},
                {"id": "delhi_r4", "name": "Indian Accent Restaurant", "lat": 28.591, "lon": 77.234, "sub_type": "restaurant", "cuisine": "fusion", "cost": 4500.0, "tags": {"amenity": "restaurant"}},
                {"id": "delhi_r5", "name": "Wenger's Pastry Connaught Place", "lat": 28.630, "lon": 77.218, "sub_type": "cafe", "cuisine": "bakery", "cost": 350.0, "tags": {"amenity": "cafe"}},
            ],
            "attractions": [
                {"id": "delhi_a1", "name": "Red Fort", "lat": 28.656, "lon": 77.241, "sub_type": "historic", "cost": 80.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a2", "name": "Qutub Minar", "lat": 28.524, "lon": 77.185, "sub_type": "historic", "cost": 40.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a3", "name": "India Gate", "lat": 28.612, "lon": 77.229, "sub_type": "viewpoint", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a4", "name": "Lotus Temple", "lat": 28.553, "lon": 77.258, "sub_type": "historic", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a5", "name": "Humayun's Tomb", "lat": 28.593, "lon": 77.250, "sub_type": "historic", "cost": 40.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a6", "name": "Chandni Chowk Market", "lat": 28.650, "lon": 77.230, "sub_type": "other", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a7", "name": "Lodhi Gardens Park", "lat": 28.590, "lon": 77.219, "sub_type": "park", "cost": 0.0, "tags": {"leisure": "park"}},
                {"id": "delhi_a8", "name": "Akshardham Temple", "lat": 28.612, "lon": 77.277, "sub_type": "historic", "cost": 250.0, "tags": {"tourism": "attraction"}},
                {"id": "delhi_a9", "name": "National Museum New Delhi", "lat": 28.611, "lon": 77.219, "sub_type": "museum", "cost": 20.0, "tags": {"tourism": "museum"}},
                {"id": "delhi_a10", "name": "Hauz Khas Social Club", "lat": 28.552, "lon": 77.194, "sub_type": "bar", "cost": 1200.0, "tags": {"amenity": "bar"}},
                {"id": "delhi_a11", "name": "Kitty Su Lounge Bar", "lat": 28.632, "lon": 77.223, "sub_type": "bar", "cost": 2000.0, "tags": {"amenity": "bar"}},
                {"id": "delhi_a12", "name": "PCO Cocktail Bar Delhi", "lat": 28.544, "lon": 77.241, "sub_type": "bar", "cost": 1500.0, "tags": {"amenity": "bar"}},
            ]
        },
        "mumbai": {
            "hotels": [
                {"id": "mumbai_h1", "name": "The Taj Mahal Palace Mumbai", "lat": 18.921, "lon": 72.833, "sub_type": "hotel", "stars": 5.0, "cost": 18000.0, "tags": {"tourism": "hotel"}},
                {"id": "mumbai_h2", "name": "Trident Nariman Point", "lat": 18.927, "lon": 72.820, "sub_type": "hotel", "stars": 5.0, "cost": 11000.0, "tags": {"tourism": "hotel"}},
                {"id": "mumbai_h3", "name": "Zostel Mumbai", "lat": 19.123, "lon": 72.880, "sub_type": "hostel", "stars": 3.5, "cost": 750.0, "tags": {"tourism": "hotel"}},
                {"id": "mumbai_h4", "name": "Le Sutra Hotel Bandra", "lat": 19.064, "lon": 72.825, "sub_type": "hotel", "stars": 4.0, "cost": 6500.0, "tags": {"tourism": "hotel"}},
            ],
            "restaurants": [
                {"id": "mumbai_r1", "name": "Leopold Cafe Colaba", "lat": 18.922, "lon": 72.832, "sub_type": "cafe", "cuisine": "multi", "cost": 800.0, "tags": {"amenity": "cafe"}},
                {"id": "mumbai_r2", "name": "Britannia & Co. Restaurant", "lat": 18.937, "lon": 72.839, "sub_type": "restaurant", "cuisine": "parsi", "cost": 1000.0, "tags": {"amenity": "restaurant"}},
                {"id": "mumbai_r3", "name": "Bademiya Colaba", "lat": 18.922, "lon": 72.833, "sub_type": "restaurant", "cuisine": "mughlai", "cost": 600.0, "tags": {"amenity": "restaurant"}},
            ],
            "attractions": [
                {"id": "mumbai_a1", "name": "Gateway of India", "lat": 18.921, "lon": 72.834, "sub_type": "historic", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a2", "name": "Marine Drive Promenade", "lat": 18.943, "lon": 72.823, "sub_type": "viewpoint", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a3", "name": "Chhatrapati Shivaji Terminus (CST)", "lat": 18.939, "lon": 72.835, "sub_type": "historic", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a4", "name": "Elephanta Caves", "lat": 18.963, "lon": 72.931, "sub_type": "historic", "cost": 250.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a5", "name": "Colaba Causeway Market", "lat": 18.913, "lon": 72.828, "sub_type": "other", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a6", "name": "Juhu Beach", "lat": 19.098, "lon": 72.826, "sub_type": "beach", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "mumbai_a7", "name": "Tryst Nightclub Mumbai", "lat": 18.995, "lon": 72.824, "sub_type": "bar", "cost": 2000.0, "tags": {"amenity": "bar"}},
                {"id": "mumbai_a8", "name": "Aer Lounge Rooftop Bar", "lat": 18.989, "lon": 72.820, "sub_type": "bar", "cost": 2500.0, "tags": {"amenity": "bar"}},
            ]
        },
        "goa": {
            "hotels": [
                {"id": "goa_h1", "name": "Taj Exotica Resort Goa", "lat": 15.267, "lon": 73.926, "sub_type": "resort", "stars": 5.0, "cost": 15000.0, "tags": {"tourism": "hotel"}},
                {"id": "goa_h2", "name": "Zostel Morjim Beach", "lat": 15.643, "lon": 73.738, "sub_type": "hostel", "stars": 3.5, "cost": 650.0, "tags": {"tourism": "hotel"}},
                {"id": "goa_h3", "name": "W Goa Vagator Resort", "lat": 15.602, "lon": 73.734, "sub_type": "resort", "stars": 5.0, "cost": 19000.0, "tags": {"tourism": "hotel"}},
                {"id": "goa_h4", "name": "Calangute Beach Association Hotel", "lat": 15.541, "lon": 73.759, "sub_type": "hotel", "stars": 3.5, "cost": 3200.0, "tags": {"tourism": "hotel"}},
            ],
            "restaurants": [
                {"id": "goa_r1", "name": "Gunpowder Restaurant Assagao", "lat": 15.597, "lon": 73.774, "sub_type": "restaurant", "cuisine": "south_indian", "cost": 900.0, "tags": {"amenity": "restaurant"}},
                {"id": "goa_r2", "name": "Curlies Beach Shack Anjuna", "lat": 15.572, "lon": 73.743, "sub_type": "restaurant", "cuisine": "seafood", "cost": 750.0, "tags": {"amenity": "restaurant"}},
                {"id": "goa_r3", "name": "Thalassa Greek Restaurant Vagator", "lat": 15.598, "lon": 73.737, "sub_type": "restaurant", "cuisine": "greek", "cost": 1600.0, "tags": {"amenity": "restaurant"}},
            ],
            "attractions": [
                {"id": "goa_a1", "name": "Baga Beach", "lat": 15.556, "lon": 73.751, "sub_type": "beach", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "goa_a2", "name": "Fort Aguada Landmark", "lat": 15.492, "lon": 73.773, "sub_type": "historic", "cost": 25.0, "tags": {"tourism": "attraction"}},
                {"id": "goa_a3", "name": "Basilica of Bom Jesus", "lat": 15.500, "lon": 73.911, "sub_type": "historic", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "goa_a4", "name": "Dudhsagar Waterfalls View", "lat": 15.318, "lon": 74.314, "sub_type": "viewpoint", "cost": 400.0, "tags": {"tourism": "attraction"}},
                {"id": "goa_a5", "name": "Anjuna Flea Market Walk", "lat": 15.576, "lon": 73.744, "sub_type": "other", "cost": 0.0, "tags": {"tourism": "attraction"}},
                {"id": "goa_a6", "name": "Club Cubana Arpora Goa", "lat": 15.579, "lon": 73.774, "sub_type": "bar", "cost": 2000.0, "tags": {"amenity": "bar"}},
                {"id": "goa_a7", "name": "Tito's Night Club Baga", "lat": 15.556, "lon": 73.752, "sub_type": "bar", "cost": 1800.0, "tags": {"amenity": "bar"}},
                {"id": "goa_a8", "name": "LPK Waterfront Club Nerul", "lat": 15.504, "lon": 73.785, "sub_type": "bar", "cost": 1500.0, "tags": {"amenity": "bar"}},
            ]
        },
        "jaipur": {
            "hotels": [
                {"id": "jaipur_h1", "name": "Rambagh Palace Jaipur", "lat": 26.898, "lon": 75.808, "sub_type": "resort", "stars": 5.0, "cost": 22000.0, "tags": {"tourism": "hotel"}},
                {"id": "jaipur_h2", "name": "Umaid Bhawan Hotel Jaipur", "lat": 26.932, "lon": 75.795, "sub_type": "hotel", "stars": 4.0, "cost": 4000.0, "tags": {"tourism": "hotel"}},
                {"id": "jaipur_h3", "name": "Zostel Jaipur Hostel", "lat": 26.920, "lon": 75.827, "sub_type": "hostel", "stars": 3.5, "cost": 550.0, "tags": {"tourism": "hotel"}},
                {"id": "jaipur_h4", "name": "Pearl Palace Heritage Boutique Hotel", "lat": 26.918, "lon": 75.789, "sub_type": "hotel", "stars": 4.0, "cost": 3200.0, "tags": {"tourism": "hotel"}},
            ],
            "restaurants": [
                {"id": "jaipur_r1", "name": "Chokhi Dhani Rajasthani Village", "lat": 26.766, "lon": 75.837, "sub_type": "restaurant", "cuisine": "rajasthani", "cost": 950.0, "tags": {"amenity": "restaurant"}},
                {"id": "jaipur_r2", "name": "LMB Restaurant Johri Bazar", "lat": 26.920, "lon": 75.825, "sub_type": "restaurant", "cuisine": "rajasthani", "cost": 500.0, "tags": {"amenity": "restaurant"}},
                {"id": "jaipur_r3", "name": "Tapri The Tea House Cafe", "lat": 26.907, "lon": 75.806, "sub_type": "cafe", "cuisine": "multi", "cost": 350.0, "tags": {"amenity": "cafe"}},
            ],
            "attractions": [
                {"id": "jaipur_a1", "name": "Hawa Mahal", "lat": 26.924, "lon": 75.827, "sub_type": "historic", "cost": 50.0, "tags": {"tourism": "attraction"}},
                {"id": "jaipur_a2", "name": "Amber Palace Fort", "lat": 26.985, "lon": 75.851, "sub_type": "historic", "cost": 100.0, "tags": {"tourism": "attraction"}},
                {"id": "jaipur_a3", "name": "City Palace Jaipur", "lat": 26.926, "lon": 75.824, "sub_type": "historic", "cost": 200.0, "tags": {"tourism": "attraction"}},
                {"id": "jaipur_a4", "name": "Jantar Mantar Observatory", "lat": 26.926, "lon": 75.825, "sub_type": "historic", "cost": 50.0, "tags": {"tourism": "attraction"}},
                {"id": "jaipur_a5", "name": "Nahargarh Fort Viewpoint", "lat": 26.937, "lon": 75.815, "sub_type": "viewpoint", "cost": 50.0, "tags": {"tourism": "attraction"}},
                {"id": "jaipur_a6", "name": "Bar Palladio Lounge Jaipur", "lat": 26.899, "lon": 75.812, "sub_type": "bar", "cost": 1500.0, "tags": {"amenity": "bar"}},
                {"id": "jaipur_a7", "name": "House of People Club Lounge", "lat": 26.908, "lon": 75.790, "sub_type": "bar", "cost": 1800.0, "tags": {"amenity": "bar"}},
            ]
        }
    }
    
    if c_lower in database:
        return database[c_lower]

    # Dynamic fallback generation for any other city
    hotels = [
        {"id": "fh1", "name": f"Taj {c} Palace", "lat": 0, "lon": 0, "sub_type": "hotel", "stars": 5.0, "cost": 12000.0, "tags": {"tourism": "hotel"}},
        {"id": "fh2", "name": f"The Oberoi {c}", "lat": 0, "lon": 0, "sub_type": "resort", "stars": 5.0, "cost": 15000.0, "tags": {"tourism": "hotel"}},
        {"id": "fh3", "name": f"Radisson Blu {c}", "lat": 0, "lon": 0, "sub_type": "hotel", "stars": 4.5, "cost": 7500.0, "tags": {"tourism": "hotel"}},
        {"id": "fh4", "name": f"Zostel {c}", "lat": 0, "lon": 0, "sub_type": "hostel", "stars": 3.5, "cost": 600.0, "tags": {"tourism": "hotel"}},
        {"id": "fh5", "name": f"Pearl Heritage Inn {c}", "lat": 0, "lon": 0, "sub_type": "guest_house", "stars": 4.0, "cost": 3000.0, "tags": {"tourism": "hotel"}},
        {"id": "fh6", "name": f"Hotel {c} Residency", "lat": 0, "lon": 0, "sub_type": "hotel", "stars": 3.0, "cost": 1800.0, "tags": {"tourism": "hotel"}},
    ]
    restaurants = [
        {"id": "fr1", "name": f"Royal {c} Dhaba", "lat": 0, "lon": 0, "sub_type": "restaurant", "cuisine": "indian", "cost": 500.0, "tags": {"amenity": "restaurant"}},
        {"id": "fr2", "name": f"Peacock Rooftop Cafe {c}", "lat": 0, "lon": 0, "sub_type": "cafe", "cuisine": "multi", "cost": 700.0, "tags": {"amenity": "cafe"}},
        {"id": "fr3", "name": f"Sher-E-Punjab {c}", "lat": 0, "lon": 0, "sub_type": "restaurant", "cuisine": "indian", "cost": 450.0, "tags": {"amenity": "restaurant"}},
        {"id": "fr4", "name": f"The Spice Route {c}", "lat": 0, "lon": 0, "sub_type": "restaurant", "cuisine": "indian", "cost": 900.0, "tags": {"amenity": "restaurant"}},
    ]
    attractions = [
        {"id": "fa1", "name": f"{c} Palace Heritage Walk", "lat": 0, "lon": 0, "sub_type": "historic", "cost": 200.0, "tags": {"tourism": "attraction"}},
        {"id": "fa2", "name": f"{c} Fort Panoramic Viewpoint", "lat": 0, "lon": 0, "sub_type": "viewpoint", "cost": 0.0, "tags": {"tourism": "attraction"}},
        {"id": "fa3", "name": f"Central Botanical Gardens of {c}", "lat": 0, "lon": 0, "sub_type": "park", "cost": 50.0, "tags": {"leisure": "park"}},
        {"id": "fa4", "name": f"Local Craft Bazaar & Market", "lat": 0, "lon": 0, "sub_type": "other", "cost": 0.0, "tags": {"tourism": "attraction"}},
        {"id": "fa5", "name": f"The Brew House Bar {c}", "lat": 0, "lon": 0, "sub_type": "bar", "cost": 1200.0, "tags": {"amenity": "bar"}},
        {"id": "fa6", "name": f"Club Mist {c}", "lat": 0, "lon": 0, "sub_type": "bar", "cost": 1500.0, "tags": {"amenity": "bar"}},
    ]
    
    from src.geocoding import geocode_city
    geo = geocode_city(city)
    if geo:
        lat, lon = geo["lat"], geo["lon"]
        for list_of_venues in [hotels, restaurants, attractions]:
            for idx, v in enumerate(list_of_venues):
                v["lat"] = lat + 0.005 * (idx - 2)
                v["lon"] = lon + 0.005 * (idx - 2)
                
    return {
        "hotels": hotels,
        "restaurants": restaurants,
        "attractions": attractions
    }

@app.post("/api/plan")
def plan_trip(req: PlanRequest):
    # Validate inputs
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City cannot be empty")
    if req.people < 1 or req.people > 50:
        raise HTTPException(status_code=400, detail="People must be between 1 and 50")
    if req.days < 1 or req.days > 30:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 30")
    if req.budget <= 0:
        raise HTTPException(status_code=400, detail="Budget must be greater than 0")
    if req.budget / req.people < 500:
        raise HTTPException(status_code=400, detail="Budget too low — minimum ₹500 per person")
        
    cities = [c.strip() for c in req.city.split(",") if c.strip()]
    
    # 1. Geocode destinations
    valid_cities = []
    for city in cities:
        geo = geocode_city(city)
        if geo:
            valid_cities.append({"name": city, "geo": geo})
            
    if not valid_cities:
        raise HTTPException(status_code=404, detail="Could not geocode any of the specified cities")
        
    # Limit number of cities to at most days
    if req.days < len(valid_cities):
        valid_cities = valid_cities[:req.days]
        
    # 2. Geocode origin if travel is included
    origin_geo = None
    if req.add_travel and req.origin_city:
        origin_geo = geocode_city(req.origin_city)
        if not origin_geo:
            raise HTTPException(status_code=400, detail=f"Could not geocode origin city '{req.origin_city}'")

    # 3. Fetch venues for all destinations
    city_venues = {}
    for item in valid_cities:
        cname = item["name"]
        geo = item["geo"]
        bbox = geo["bbox"]
        lat, lon = geo["lat"], geo["lon"]
        
        cache_key = f"overpass_{cname.lower().strip().replace(' ', '_')}"
        venues = get_cached_response(cache_key)
        if not venues:
            venues = fetch_venues(cname, bbox, lat=lat, lon=lon)
            
        # Supplement with Gemini venues if Overpass results are scarce
        if venues and (len(venues.get("hotels", [])) < 10 or len(venues.get("restaurants", [])) < 10 or len(venues.get("attractions", [])) < 12):
            try:
                from src.gemini import generate_venues_via_gemini
                gv_catalog = generate_venues_via_gemini(cname)
                if gv_catalog:
                    venues = {
                        "hotels": list(venues.get("hotels", [])),
                        "restaurants": list(venues.get("restaurants", [])),
                        "attractions": list(venues.get("attractions", []))
                    }
                    for cat in ["hotels", "restaurants", "attractions"]:
                        existing_names = {v.get("name", "").lower().strip() for v in venues[cat] if v.get("name")}
                        for gv in gv_catalog.get(cat, []):
                            if gv.get("name") and gv["name"].lower().strip() not in existing_names:
                                venues[cat].append(gv)
            except Exception as e:
                print(f"[Gemini Supplement Warning] Failed for {cname}: {e}")
                
        if not venues or (not venues.get("hotels") and not venues.get("restaurants")):
            print(f"[Fallback Warning] Using local fallback venues for {cname}")
            venues = get_fallback_venues(cname)
            
        city_venues[cname] = venues

    # 4. Resolve budget input (total group budget)
    total_budget = req.budget
    if req.budget_type == "per_person":
        total_budget = req.budget * req.people

    # 5. Build multiple split options
    options = []
    styles = ["Best Overall", "Cheapest Trip", "Slow and Relaxed", "More Places", "Better Stay"]
    for s in styles:
        opt = calculate_budget_split_option(s, city_venues, valid_cities, req, total_budget, origin_geo)
        options.append(opt)

    # 6. Run Gemini enrichment on recommended hotels/activities to get nice descriptions
    import time
    try:
        from src.gemini import enrich_trip_plan
        for opt in options:
            for stop in opt["stops"]:
                enrich_trip_plan(stop, stop["city"])
                time.sleep(0.1)
    except Exception as e:
        print(f"[Enrichment Warning] Failed to run option enrichment: {e}")

    return {
        "success": True,
        "options": options,
        "city": ", ".join([c["name"] for c in valid_cities])
    }

class AssistantRequest(BaseModel):
    query: str
    favorites: list

@app.post("/api/assistant")
def chat_assistant(req: AssistantRequest):
    from src.gemini import query_gemini_assistant
    response_text = query_gemini_assistant(req.query, req.favorites)
    return {
        "success": True,
        "response": response_text
    }

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
