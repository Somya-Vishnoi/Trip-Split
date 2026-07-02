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
            "hotels": [h["name"] for h in venues["hotels"][:5]],
            "restaurants": [r["name"] for r in venues["restaurants"][:5]],
            "attractions": [a["name"] for a in venues["attractions"][:5]]
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
    total_local_cost = 0.0
    total_utility = 0.0
    
    for i, (city_name, lat, lon, bbox) in enumerate(sorted_cities):
        cache_key = f"overpass_{city_name.lower().strip().replace(' ', '_')}"
        venues = get_cached_response(cache_key)
        if not venues:
            venues = fetch_venues(city_name, bbox, lat=lat, lon=lon)
            
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
        
        stop_plan = {
            "city": city_name,
            "days": days_alloc[i],
            "hotel": res["hotel"],
            "restaurants": res.get("restaurants", []),
            "bars": s_bars,
            "zones": s_zones,
            "local_cost": res["total_cost"]
        }
        stops_plans.append(stop_plan)
        total_local_cost += res["total_cost"]
        total_utility += res["utility"]

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

    # 9. Run Gemini enrichment on all stops
    try:
        for stop in full_plan["stops"]:
            enrich_trip_plan(stop, stop["city"])
    except Exception as e:
        print(f"[Enrichment Warning] Failed to run Gemini enrichment on multi-city plan: {e}")

    return {
        "success": True,
        "plan": full_plan
    }

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
