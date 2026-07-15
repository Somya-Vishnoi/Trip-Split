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
                        
    # Assign heuristics
    from src.optimizer import assign_heuristics
    
    processed_hotels = []
    for h in venues.get("hotels", []):
        cost, utility = assign_heuristics(h, "hotels", people=4)
        h_copy = dict(h)
        h_copy["cost"] = cost
        h_copy["utility"] = utility
        processed_hotels.append(h_copy)
        
    processed_restaurants = []
    for r in venues.get("restaurants", []):
        cost, utility = assign_heuristics(r, "restaurants", people=4)
        r_copy = dict(r)
        r_copy["cost"] = cost
        r_copy["utility"] = utility
        processed_restaurants.append(r_copy)
        
    processed_attractions = []
    for a in venues.get("attractions", []):
        cost, utility = assign_heuristics(a, "attractions", people=4)
        a_copy = dict(a)
        a_copy["cost"] = 0.0
        a_copy["original_cost"] = cost
        a_copy["utility"] = utility
        processed_attractions.append(a_copy)
        
    processed_hotels.sort(key=lambda x: x.get("utility", 0.0), reverse=True)
    processed_restaurants.sort(key=lambda x: x.get("utility", 0.0), reverse=True)
    processed_attractions.sort(key=lambda x: x.get("utility", 0.0), reverse=True)
    
    return {
        "geocoding": {
            "display_name": geo_data["display_name"],
            "lat": geo_data["lat"],
            "lon": geo_data["lon"],
            "bbox": geo_data["bbox"]
        },
        "venue_counts": {
            "hotels": len(venues["hotels"]),
            "restaurants": len(venues["restaurants"]),
            "attractions": len(venues["attractions"])
        },
        "sample_venues": {
            "hotels": [h["name"] for h in processed_hotels[:8]],
            "restaurants": [r["name"] for r in processed_restaurants[:8]],
            "attractions": [a["name"] for a in processed_attractions[:15]]
        },
        "all_venues": {
            "hotels": processed_hotels,
            "restaurants": processed_restaurants,
            "attractions": processed_attractions
        }
    }

def calculate_budget_split_option(
    style_name: str,
    venues: dict,
    req: PlanRequest,
    total_budget: float,
    dest_lat: float,
    dest_lon: float,
    origin_geo: Optional[dict]
) -> dict:
    import math
    from src.optimizer import assign_heuristics
    
    people = req.people
    days = req.days
    nights = max(1, days - 1)
    
    # 1. Transportation cost calculation (round-trip for all people)
    dist = 0.0
    if origin_geo:
        from src.router import haversine_distance
        dist = haversine_distance(origin_geo["lat"], origin_geo["lon"], dest_lat, dest_lon)
    
    # Select mode of transportation based on style & preferences
    mode = "bus"
    if style_name == "Cheapest Trip":
        mode = "train_sleeper" if dist > 200 else "bus"
    elif style_name == "Slow and Relaxed":
        mode = "flight" if dist > 500 else ("train_3ac" if dist > 200 else "bus")
    elif style_name == "Better Stay":
        mode = "train_sleeper" if dist > 200 else "bus" # Cheaper mode to save budget for stay
    else: # Best Overall, More Places
        # Default or flexible
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

    rt_transport_cost_pp = get_leg_cost(dist, mode) * 2.0 if dist > 0 else 0.0
    total_transport_cost = rt_transport_cost_pp * people
    
    # Local travel cost per person per day
    if style_name == "Cheapest Trip":
        local_travel_pp_pd = 100.0 # public transport / shared auto
    elif style_name == "More Places":
        local_travel_pp_pd = 300.0 # private taxi sharing / active routing
    else:
        local_travel_pp_pd = 200.0 # standard
    total_local_travel = local_travel_pp_pd * days * people

    # 2. Food allocation
    if style_name == "Cheapest Trip":
        food_pp_pd = 250.0 # local dhabas / street food
    elif style_name == "Slow and Relaxed":
        food_pp_pd = 600.0 # nice cafes / restaurants
    else:
        food_pp_pd = 400.0 # standard
    total_food_cost = food_pp_pd * days * people

    # 3. Accommodation cost (nights = days - 1, room based)
    rooms_needed = math.ceil(people / 2.0)
    
    # Filter hotels
    hotels = list(venues.get("hotels", []))
    hotel_sel = None
    if hotels:
        if style_name == "Cheapest Trip":
            hotels_sorted = sorted(hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])
            hotel_sel = hotels_sorted[0]
        elif style_name == "Better Stay":
            avail = total_budget - total_transport_cost - total_food_cost - total_local_travel
            max_hotel_total = max(2000.0, avail * 0.7)
            max_nightly = max_hotel_total / nights
            
            fitting = [h for h in hotels if assign_heuristics(h, "hotels", people)[0] <= max_nightly]
            if fitting:
                hotel_sel = sorted(fitting, key=lambda x: safe_float(x.get("stars", 0)) or safe_float(assign_heuristics(x, "hotels", people)[1]), reverse=True)[0]
            else:
                hotel_sel = sorted(hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])[0]
        else: # Best Overall, Slow and Relaxed, More Places
            avail = total_budget - total_transport_cost - total_food_cost - total_local_travel
            max_hotel_total = max(2000.0, avail * 0.45)
            max_nightly = max_hotel_total / nights
            
            fitting = [h for h in hotels if assign_heuristics(h, "hotels", people)[0] <= max_nightly]
            if fitting:
                hotel_sel = sorted(fitting, key=lambda x: safe_float(assign_heuristics(x, "hotels", people)[1]), reverse=True)[0]
            else:
                hotel_sel = sorted(hotels, key=lambda x: assign_heuristics(x, "hotels", people)[0])[0]

    h_cost_per_night = assign_heuristics(hotel_sel, "hotels", people)[0] if hotel_sel else 1200.0 * rooms_needed
    total_stay_cost = h_cost_per_night * nights

    # 4. Emergency Buffer
    if style_name == "Cheapest Trip":
        buffer_pct = 0.05
    elif style_name == "Slow and Relaxed":
        buffer_pct = 0.10
    else:
        buffer_pct = 0.07
    
    # Calculate available activity budget
    flexible_budget = total_budget - total_transport_cost - total_stay_cost - total_food_cost - total_local_travel
    
    if flexible_budget < 0:
        flexible_budget = 0.0
        
    total_buffer = total_budget * buffer_pct
    available_activities_budget = max(0.0, flexible_budget - total_buffer)
    
    # Select activities
    attractions = list(venues.get("attractions", []))
    selected_attrs = []
    activities_spend = 0.0
    
    if style_name == "Cheapest Trip":
        free_attrs = [a for a in attractions if assign_heuristics(a, "attractions", people)[0] == 0]
        selected_attrs = free_attrs[:4]
    else:
        sorted_attrs = sorted(attractions, key=lambda x: assign_heuristics(x, "attractions", people)[1], reverse=True)
        for a in sorted_attrs:
            cost_a = assign_heuristics(a, "attractions", people)[0]
            if activities_spend + cost_a <= available_activities_budget:
                selected_attrs.append(a)
                activities_spend += cost_a
                if len(selected_attrs) >= 4:
                    break
        if not selected_attrs:
            free_attrs = [a for a in attractions if assign_heuristics(a, "attractions", people)[0] == 0]
            selected_attrs = free_attrs[:3]

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
        confidence = "High Confidence"

    # Trade-offs and why fits based on choices
    why_fits = ""
    tradeoffs = []
    
    if style_name == "Cheapest Trip":
        why_fits = f"This route utilizes shared public transport (like {mode.replace('_',' ')}) and budget accommodations to minimize costs. This leaves a safe cash buffer for group emergencies."
        tradeoffs = ["Assumes budget stays/hostels", "No private cab/taxi included", "Limited dining at high-end restaurants"]
    elif style_name == "Better Stay":
        why_fits = f"By choosing affordable train transport and dining at budget-friendly spots, this split redirects the maximum amount of money (₹{total_stay_cost:,.0f}) to stay in a premium hotel."
        tradeoffs = ["Reduced budget for paid excursions", "Longer travel time via sleeper transport", "Standard meals instead of fine dining"]
    elif style_name == "Slow and Relaxed":
        why_fits = "Focuses on a single overnight base to eliminate mid-trip hotel change costs, allocating a higher daily food allowance and a larger 10% emergency buffer."
        tradeoffs = ["Fewer places visited", "Higher stay cost per night", "Fewer fast-paced paid activities"]
    elif style_name == "More Places":
        why_fits = "Includes multiple sightseeing stops and active travel movement. It saves budget by using hostel dorms and eating at local street stalls."
        tradeoffs = ["Significant travel time between stops", "Shared dorm rooms/backpack hostels", "Zero luxury hotel amenities"]
    else: # Best Overall
        why_fits = "Balances comfortable mid-range hotels, local private transport, and high-quality meals. It provides the optimal value for your money."
        tradeoffs = ["No luxury resort stays included", "Some walking required for local sightseeing", "Moderate pace with scheduled stops"]

    # Day-by-day itinerary generation
    itinerary = []
    
    attrs_per_day = math.ceil(len(selected_attrs) / days) if selected_attrs else 1
    for day in range(1, days + 1):
        day_attrs = selected_attrs[(day-1)*attrs_per_day : day*attrs_per_day] if selected_attrs else []
        attr_names = [a["name"] for a in day_attrs]
        
        if day == 1:
            summary = f"Arrival in {req.city}, check-in at hotel, and local orientation."
            details = f"Check in to your hotel: {hotel_sel['name'] if hotel_sel else 'Local Lodging'}. Afternoon spent wandering near the hotel and dining locally."
        elif day == days:
            summary = f"Last-minute souvenir shopping and departure."
            details = "Enjoy a relaxed breakfast, pack up, and head to the transport station for the return journey."
        else:
            if attr_names:
                summary = f"Explore {attr_names[0]} and surrounding sights."
                details = f"Visit {', '.join(attr_names)}. Lunch at a popular local eatery, followed by an evening stroll."
            else:
                summary = "Leisurely sightseeing and local food trail."
                details = "Wander through local markets, sample authentic street foods, and interact with residents."
                
        itinerary.append({
            "day": day,
            "summary": summary,
            "details": details,
            "stay_name": hotel_sel["name"] if hotel_sel else "Local Stay",
            "stay_rating": hotel_sel.get("stars", 4.0) if hotel_sel else 4.0,
            "transport_mode": mode.replace("_", " ").title(),
            "transport_cost": rt_transport_cost_pp / 2.0 if day in [1, days] else local_travel_pp_pd
        })

    # Prepare candidates for swapping
    all_hotels = []
    for h in venues.get("hotels", []):
        cost_val, util_val = assign_heuristics(h, "hotels", people)
        h_copy = dict(h)
        h_copy["cost"] = cost_val * nights
        h_copy["utility"] = util_val
        h_copy["optimized"] = (hotel_sel is not None and h["name"] == hotel_sel.get("name"))
        all_hotels.append(h_copy)
    all_hotels.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)

    all_restaurants = []
    for r in venues.get("restaurants", []):
        cost_val, util_val = assign_heuristics(r, "restaurants", people)
        r_copy = dict(r)
        r_copy["cost"] = cost_val
        r_copy["utility"] = util_val
        r_copy["optimized"] = False
        all_restaurants.append(r_copy)
    all_restaurants.sort(key=lambda x: x.get("utility", 0.0), reverse=True)

    all_attractions = []
    for a in venues.get("attractions", []):
        cost_val, util_val = assign_heuristics(a, "attractions", people)
        a_copy = dict(a)
        a_copy["cost"] = 0.0
        a_copy["original_cost"] = cost_val
        a_copy["utility"] = util_val
        a_copy["optimized"] = a["name"] in [x["name"] for x in selected_attrs]
        all_attractions.append(a_copy)
    all_attractions.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)

    stop_plan = {
        "city": req.city,
        "days": days,
        "hotel": hotel_sel,
        "restaurants": [],
        "bars": [],
        "zones": [],
        "all_hotels": all_hotels,
        "all_restaurants": all_restaurants,
        "all_bars": [a for a in all_attractions if a.get("sub_type") == "bar"],
        "all_sightseeing": [a for a in all_attractions if a.get("sub_type") != "bar"],
        "budget_exceeded": ratio_used > 1.0,
        "local_cost": total_stay_cost + total_food_cost + total_local_travel + activities_spend + actual_buffer
    }

    return {
        "style_name": style_name,
        "route_label": f"{req.origin_city or 'Origin'} ➔ {req.city} ➔ {req.origin_city or 'Origin'}",
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
        "travel_cost": total_transport_cost,
        "travel_mode": mode,
        "distance_km": dist,
        "stops": [stop_plan]
    }

@app.post("/api/plan")
def plan_trip(req: PlanRequest):
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City name cannot be empty")
        
    cities = [c.strip() for c in req.city.split(",") if c.strip()]
    primary_city = cities[0]
    
    # 1. Geocode primary destination
    geo = geocode_city(primary_city)
    if not geo:
        raise HTTPException(status_code=404, detail=f"Could not geocode city '{primary_city}'")
    lat, lon, bbox = geo["lat"], geo["lon"], geo["bbox"]
        
    # 2. Geocode origin if travel is included
    origin_geo = None
    if req.add_travel and req.origin_city:
        origin_geo = geocode_city(req.origin_city)
        if not origin_geo:
            raise HTTPException(status_code=400, detail=f"Could not geocode origin city '{req.origin_city}'")

    # 3. Fetch venues for primary destination
    cache_key = f"overpass_{primary_city.lower().strip().replace(' ', '_')}"
    venues = get_cached_response(cache_key)
    if not venues:
        venues = fetch_venues(primary_city, bbox, lat=lat, lon=lon)
        
    # Supplement with Gemini venues if Overpass results are scarce
    if venues and (len(venues.get("hotels", [])) < 10 or len(venues.get("restaurants", [])) < 10 or len(venues.get("attractions", [])) < 12):
        from src.gemini import generate_venues_via_gemini
        gv_catalog = generate_venues_via_gemini(primary_city)
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
        
    if not venues or (not venues.get("hotels") and not venues.get("restaurants")):
         raise HTTPException(status_code=404, detail=f"No venues found in candidate search for '{primary_city}'.")

    # 4. Resolve budget input (total group budget)
    total_budget = req.budget
    if req.budget_type == "per_person":
        total_budget = req.budget * req.people

    # 5. Build multiple split options
    options = []
    styles = ["Best Overall", "Cheapest Trip", "Slow and Relaxed", "More Places", "Better Stay"]
    for s in styles:
        opt = calculate_budget_split_option(s, venues, req, total_budget, lat, lon, origin_geo)
        options.append(opt)

    # 6. Run Gemini enrichment on recommended hotels/activities to get nice descriptions
    import time
    try:
        from src.gemini import enrich_trip_plan
        for opt in options:
            for stop in opt["stops"]:
                enrich_trip_plan(stop, primary_city)
                time.sleep(0.1)
    except Exception as e:
        print(f"[Enrichment Warning] Failed to run option enrichment: {e}")

    return {
        "success": True,
        "options": options,
        "city": primary_city
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
