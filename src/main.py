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
from src.gemini import enrich_trip_plan

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

@app.post("/api/plan")
def plan_trip(req: PlanRequest):
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City name cannot be empty")
        
    cities = [c.strip() for c in req.city.split(",") if c.strip()]
    N = len(cities)
    
    # 1. Geocode all destinations
    cities_geo = []
    for c in cities:
        geo = geocode_city(c)
        if not geo:
            raise HTTPException(status_code=404, detail=f"Could not geocode city '{c}'")
        cities_geo.append((c, geo["lat"], geo["lon"], geo["bbox"]))
        
    # 2. Geocode origin if travel is included
    origin_geo = None
    if req.add_travel and req.origin_city:
        origin_geo = geocode_city(req.origin_city)
        if not origin_geo:
            raise HTTPException(status_code=400, detail=f"Could not geocode origin city '{req.origin_city}'")

    # 3. Sort route using Greedy TSP to minimize travel distance
    from src.router import haversine_distance
    sorted_cities = []
    
    if origin_geo:
        current_lat, current_lon = origin_geo["lat"], origin_geo["lon"]
        unvisited = list(cities_geo)
        while unvisited:
            nearest_idx = 0
            nearest_dist = float('inf')
            for idx, (_, lat, lon, _) in enumerate(unvisited):
                d = haversine_distance(current_lat, current_lon, lat, lon)
                if d < nearest_dist:
                    nearest_dist = d
                    nearest_idx = idx
            visited = unvisited.pop(nearest_idx)
            sorted_cities.append(visited)
            current_lat, current_lon = visited[1], visited[2]
    else:
        start_city = cities_geo[0]
        sorted_cities = [start_city]
        current_lat, current_lon = start_city[1], start_city[2]
        unvisited = cities_geo[1:]
        while unvisited:
            nearest_idx = 0
            nearest_dist = float('inf')
            for idx, (_, lat, lon, _) in enumerate(unvisited):
                d = haversine_distance(current_lat, current_lon, lat, lon)
                if d < nearest_dist:
                    nearest_dist = d
                    nearest_idx = idx
            visited = unvisited.pop(nearest_idx)
            sorted_cities.append(visited)
            current_lat, current_lon = visited[1], visited[2]

    # 4. Compute Intercity legs and travel costs
    legs = []
    total_travel_cost = 0.0
    total_distance_km = 0.0
    
    mode = req.travel_mode or "flight"
    
    def get_leg_cost(dist, mode):
        if mode == "flight":
            if dist < 250:
                return 150.0 + 1.2 * dist
            return 1500.0 + 3.0 * dist
        elif mode == "train_3ac":
            return 200.0 + 1.0 * dist
        elif mode == "train_sleeper":
            return 80.0 + 0.45 * dist
        else: # bus
            return 60.0 + 1.3 * dist

    if origin_geo:
        # Leg 1: Origin -> Stop 1
        d1 = haversine_distance(origin_geo["lat"], origin_geo["lon"], sorted_cities[0][1], sorted_cities[0][2])
        c1 = get_leg_cost(d1, mode) * req.people
        legs.append({"from": req.origin_city, "to": sorted_cities[0][0], "distance": d1, "cost": c1})
        total_travel_cost += c1
        total_distance_km += d1
        
        # Intermediate Legs: Stop i -> Stop i+1
        for i in range(len(sorted_cities) - 1):
            d = haversine_distance(sorted_cities[i][1], sorted_cities[i][2], sorted_cities[i+1][1], sorted_cities[i+1][2])
            c = get_leg_cost(d, mode) * req.people
            legs.append({"from": sorted_cities[i][0], "to": sorted_cities[i+1][0], "distance": d, "cost": c})
            total_travel_cost += c
            total_distance_km += d
            
        # Last Leg: Stop N -> Origin
        dn = haversine_distance(sorted_cities[-1][1], sorted_cities[-1][2], origin_geo["lat"], origin_geo["lon"])
        cn = get_leg_cost(dn, mode) * req.people
        legs.append({"from": sorted_cities[-1][0], "to": req.origin_city, "distance": dn, "cost": cn})
        total_travel_cost += cn
        total_distance_km += dn
    else:
        for i in range(len(sorted_cities) - 1):
            d = haversine_distance(sorted_cities[i][1], sorted_cities[i][2], sorted_cities[i+1][1], sorted_cities[i+1][2])
            legs.append({"from": sorted_cities[i][0], "to": sorted_cities[i+1][0], "distance": d, "cost": 0.0})
            total_distance_km += d

    # 5. Deduct travel cost and check budget viability
    remaining_budget = req.budget - total_travel_cost
    if remaining_budget < 0:
        return {
            "success": False,
            "message": f"Roundtrip travel cost (₹{total_travel_cost:,.2f}) exceeds your total budget of ₹{req.budget:,.2f}. Try switching transport mode or increasing budget!"
        }

    # 6. Allocate days and budget per city stop
    days_per_city = req.days // N
    days_alloc = [days_per_city + (1 if i < (req.days % N) else 0) for i in range(N)]
    budget_per_city = remaining_budget / N

    # 7. Optimize each city stop
    stops_plans = []
    stops_backup_plans = []
    total_local_cost = 0.0
    total_local_backup_cost = 0.0
    total_utility = 0.0
    total_backup_utility = 0.0
    
    for i, (city_name, lat, lon, bbox) in enumerate(sorted_cities):
        cache_key = f"overpass_{city_name.lower().strip().replace(' ', '_')}"
        venues = get_cached_response(cache_key)
        if not venues:
            venues = fetch_venues(city_name, bbox, lat=lat, lon=lon)
            
        # Supplement with Gemini venues if Overpass results are scarce
        if venues and (len(venues.get("hotels", [])) < 10 or len(venues.get("restaurants", [])) < 10 or len(venues.get("attractions", [])) < 12):
            from src.gemini import generate_venues_via_gemini
            gv_catalog = generate_venues_via_gemini(city_name)
            if gv_catalog:
                # Copy lists to avoid mutating shared cache refs directly
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
            
        if not venues or (not venues["hotels"] and not venues["restaurants"]):
             return {
                 "success": False,
                 "message": f"No venues found in candidate search for '{city_name}'."
             }
             
        res = optimize_trip_budget(
            venues, days_alloc[i], req.people, budget_per_city,
            include_stay=req.include_stay,
            include_transport=req.include_transport,
            include_attractions=req.include_attractions,
            lat=lat, lon=lon
        )
        
        if res["status"] == "exceeded" or res["status"] == "failed":
            error_detail = res.get("message", "Insufficient budget.")
            return {
                "success": False,
                "message": f"Optimization failed for stop '{city_name}': {error_detail} (Try increasing your budget or reducing duration/stops!)"
            }
            
        s_attractions = res.get("attractions", [])
        s_bars = [a for a in s_attractions if a.get("sub_type") == "bar"]
        s_sightseeing = [a for a in s_attractions if a.get("sub_type") != "bar"]
        s_zones = cluster_attractions_by_location(s_sightseeing, k=days_alloc[i])

        # Extract all venues with cost/utility assigned
        from src.optimizer import assign_heuristics
        
        # 1. Hotels
        all_hotels = []
        for h in venues.get("hotels", []):
            cost_val, util_val = assign_heuristics(h, "hotels", req.people)
            h_copy = dict(h)
            h_copy["cost"] = cost_val * days_alloc[i] if req.include_stay else 0.0
            h_copy["utility"] = util_val if req.include_stay else 0.0
            h_copy["optimized"] = (res.get("hotel") is not None and h["name"] == res["hotel"].get("name"))
            all_hotels.append(h_copy)
        all_hotels.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
            
        # 2. Restaurants
        all_restaurants = []
        opt_rest_names = [x["name"] for x in res.get("restaurants", [])]
        for r in venues.get("restaurants", []):
            cost_val, util_val = assign_heuristics(r, "restaurants", req.people)
            r_copy = dict(r)
            r_copy["cost"] = cost_val
            r_copy["utility"] = util_val
            r_copy["optimized"] = r["name"] in opt_rest_names
            all_restaurants.append(r_copy)
        all_restaurants.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
            
        # 3. Bars
        all_bars = []
        opt_bar_names = [x["name"] for x in s_bars]
        for b in [a for a in venues.get("attractions", []) if a.get("sub_type") == "bar"]:
            cost_val, util_val = assign_heuristics(b, "attractions", req.people)
            b_copy = dict(b)
            b_copy["cost"] = cost_val
            b_copy["utility"] = util_val
            b_copy["optimized"] = b["name"] in opt_bar_names
            all_bars.append(b_copy)
        all_bars.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
            
        # 4. Attractions / Sightseeing
        all_sightseeing = []
        opt_sight_names = [x["name"] for x in s_sightseeing]
        for a in [a for a in venues.get("attractions", []) if a.get("sub_type") != "bar"]:
            cost_val, util_val = assign_heuristics(a, "attractions", req.people)
            a_copy = dict(a)
            a_copy["cost"] = 0.0
            a_copy["original_cost"] = cost_val
            a_copy["utility"] = util_val
            a_copy["optimized"] = a["name"] in opt_sight_names
            all_sightseeing.append(a_copy)
        all_sightseeing.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
        
        stop_plan = {
            "city": city_name,
            "days": days_alloc[i],
            "hotel": res["hotel"],
            "restaurants": res.get("restaurants", []),
            "bars": s_bars,
            "zones": s_zones,
            "all_hotels": all_hotels,
            "all_restaurants": all_restaurants,
            "all_bars": all_bars,
            "all_sightseeing": all_sightseeing,
            "budget_exceeded": res.get("budget_exceeded", False),
            "local_cost": res["total_cost"]
        }
        stops_plans.append(stop_plan)
        total_local_cost += res["total_cost"]
        total_utility += res["utility"]

        if res.get("backup"):
            b_res = res["backup"]
            b_attractions = b_res.get("attractions", [])
            b_bars = [a for a in b_attractions if a.get("sub_type") == "bar"]
            b_sightseeing = [a for a in b_attractions if a.get("sub_type") != "bar"]
            b_zones = cluster_attractions_by_location(b_sightseeing, k=days_alloc[i])
            
            # Map backups
            b_opt_rest_names = [x["name"] for x in b_res.get("restaurants", [])]
            b_opt_bar_names = [x["name"] for x in b_bars]
            b_opt_sight_names = [x["name"] for x in b_sightseeing]
            
            b_all_hotels = []
            for h in all_hotels:
                h_c = dict(h)
                h_c["optimized"] = (b_res.get("hotel") is not None and h["name"] == b_res["hotel"].get("name"))
                b_all_hotels.append(h_c)
            b_all_hotels.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
                
            b_all_restaurants = []
            for r in all_restaurants:
                r_c = dict(r)
                r_c["optimized"] = r["name"] in b_opt_rest_names
                b_all_restaurants.append(r_c)
            b_all_restaurants.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
                
            b_all_bars = []
            for b in all_bars:
                b_c = dict(b)
                b_c["optimized"] = b["name"] in b_opt_bar_names
                b_all_bars.append(b_c)
            b_all_bars.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
                
            b_all_sightseeing = []
            for a in all_sightseeing:
                a_c = dict(a)
                a_c["optimized"] = a["name"] in b_opt_sight_names
                b_all_sightseeing.append(a_c)
            b_all_sightseeing.sort(key=lambda x: (x.get("optimized", False), x.get("utility", 0.0)), reverse=True)
            
            b_stop_plan = {
                "city": city_name,
                "days": days_alloc[i],
                "hotel": b_res["hotel"],
                "restaurants": b_res.get("restaurants", []),
                "bars": b_bars,
                "zones": b_zones,
                "all_hotels": b_all_hotels,
                "all_restaurants": b_all_restaurants,
                "all_bars": b_all_bars,
                "all_sightseeing": b_all_sightseeing,
                "local_cost": b_res["total_cost"]
            }
            stops_backup_plans.append(b_stop_plan)
            total_local_backup_cost += b_res["total_cost"]
            total_backup_utility += b_res.get("utility", 0.0)

    # 8. Build full multi-city trip plan
    full_plan = {
        "multi_city": True,
        "stops": stops_plans,
        "legs": legs,
        "total_cost": total_local_cost + total_travel_cost,
        "local_trip_cost": total_local_cost,
        "travel_cost": total_travel_cost,
        "travel_mode": req.travel_mode if total_travel_cost > 0 else None,
        "origin_city": req.origin_city if total_travel_cost > 0 else None,
        "distance_km": total_distance_km,
        "utility": total_utility,
        "cost_per_person": (total_local_cost + total_travel_cost) / req.people,
        "backup": None
    }

    if len(stops_backup_plans) == N:
        full_plan["backup"] = {
            "multi_city": True,
            "stops": stops_backup_plans,
            "legs": legs,
            "total_cost": total_local_backup_cost + total_travel_cost,
            "local_trip_cost": total_local_backup_cost,
            "travel_cost": total_travel_cost,
            "travel_mode": req.travel_mode if total_travel_cost > 0 else None,
            "origin_city": req.origin_city if total_travel_cost > 0 else None,
            "distance_km": total_distance_km,
            "utility": total_backup_utility,
            "cost_per_person": (total_local_backup_cost + total_travel_cost) / req.people,
            "backup": None
        }

    # 9. Run Gemini enrichment on all stops sequentially (prevent concurrency-based 429 rate limits!)
    import time
    try:
        for stop in full_plan["stops"]:
            try:
                enrich_trip_plan(stop, stop["city"])
                time.sleep(0.5)  # Safe small delay between sequential stops
            except Exception as ex:
                print(f"[Gemini Enrichment Stop Error]: {ex}")

        if full_plan["backup"]:
            for stop in full_plan["backup"]["stops"]:
                try:
                    enrich_trip_plan(stop, stop["city"])
                    time.sleep(0.5)
                except Exception:
                    pass
    except Exception as e:
        print(f"[Enrichment Warning] Failed to run Gemini enrichment: {e}")

    return {
        "success": True,
        "plan": full_plan
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
