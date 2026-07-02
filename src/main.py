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
    origin_city: str = None
    travel_mode: str = "flight"

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
        
    # Always geocode to get city center coordinates (lat, lon)
    geo_data = geocode_city(req.city)
    if not geo_data:
        raise HTTPException(status_code=404, detail=f"Could not geocode city '{req.city}'")

    # Calculate intercity travel cost if requested
    travel_cost = 0.0
    distance_km = 0.0
    if req.add_travel and req.origin_city:
        origin_geo = geocode_city(req.origin_city)
        if not origin_geo:
            raise HTTPException(status_code=400, detail=f"Could not geocode origin city '{req.origin_city}'")
        
        # Calculate distance
        from src.router import haversine_distance
        distance_km = haversine_distance(
            origin_geo["lat"], origin_geo["lon"],
            geo_data["lat"], geo_data["lon"]
        )
        
        # Heuristic pricing per person (round-trip)
        mode = req.travel_mode or "flight"
        if mode == "flight":
            # Flights are generally for distances > 300km, otherwise baseline ₹5000 roundtrip
            rate = 3.5 if distance_km > 300 else 10.0
            per_person_roundtrip = (2500.0 + rate * distance_km) * 2
        elif mode == "train_3ac":
            per_person_roundtrip = (350.0 + 1.1 * distance_km) * 2
        elif mode == "train_sleeper":
            per_person_roundtrip = (150.0 + 0.45 * distance_km) * 2
        else: # bus
            per_person_roundtrip = (100.0 + 1.4 * distance_km) * 2
            
        travel_cost = per_person_roundtrip * req.people
        req.budget -= travel_cost
        
        if req.budget < 0:
            return {
                "success": False,
                "message": f"Roundtrip travel cost (₹{travel_cost:,.2f}) exceeds your total budget."
            }

    # Load cached venues
    cache_key = f"overpass_{req.city.lower().strip().replace(' ', '_')}"
    venues = get_cached_response(cache_key)
    
    if not venues:
        # If cache is missing, fetch from Overpass
        venues = fetch_venues(req.city, geo_data["bbox"], lat=geo_data["lat"], lon=geo_data["lon"])
        
    if not venues or (not venues["hotels"] and not venues["restaurants"]):
         raise HTTPException(status_code=404, detail="No venues found near the destination.")
         
    result = optimize_trip_budget(
        venues, req.days, req.people, req.budget,
        include_stay=req.include_stay,
        include_transport=req.include_transport,
        include_attractions=req.include_attractions,
        lat=geo_data["lat"],
        lon=geo_data["lon"]
    )
    
    if result["status"] == "exceeded" or result["status"] == "failed":
        return {
            "success": False,
            "message": result.get("message", "Budget is too low to create a valid itinerary.")
        }
        
    # Split attractions list to display nightlife (bars/pubs) separately from sightseeing
    selected_attractions = result.get("attractions", [])
    selected_bars = [a for a in selected_attractions if a.get("sub_type") == "bar"]
    selected_sightseeing = [a for a in selected_attractions if a.get("sub_type") != "bar"]
    
    # Cluster the sightseeing attractions geographically (k zones = duration of days)
    exploration_zones = cluster_attractions_by_location(selected_sightseeing, k=req.days)
    
    # Backup plan
    backup_plan = None
    if result.get("backup"):
        b_attractions = result["backup"].get("attractions", [])
        b_bars = [a for a in b_attractions if a.get("sub_type") == "bar"]
        b_sightseeing = [a for a in b_attractions if a.get("sub_type") != "bar"]
        b_zones = cluster_attractions_by_location(b_sightseeing, k=req.days)
        
        backup_plan = {
            "hotel": result["backup"]["hotel"],
            "total_cost": result["backup"]["total_cost"],
            "restaurants": result["backup"].get("restaurants", []),
            "bars": b_bars,
            "zones": b_zones
        }
        
    return {
        "success": True,
        "plan": {
            "hotel": result["hotel"],
            "total_cost": result["total_cost"] + travel_cost,
            "local_trip_cost": result["total_cost"],
            "travel_cost": travel_cost,
            "travel_mode": req.travel_mode if travel_cost > 0 else None,
            "origin_city": req.origin_city if travel_cost > 0 else None,
            "distance_km": distance_km if travel_cost > 0 else 0.0,
            "utility": result["utility"],
            "cost_per_person": (result["total_cost"] + travel_cost) / req.people,
            "restaurants": result.get("restaurants", []),
            "bars": selected_bars,
            "zones": exploration_zones,
            "backup": backup_plan
        }
    }

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
