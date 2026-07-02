from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from src.geocoding import geocode_city
from src.overpass import fetch_venues
from src.optimizer import optimize_trip_budget
from src.cache import get_cached_response
from src.router import plan_day_wise_itinerary

app = FastAPI(title="TripSplit - Group Trip Budget Optimizer")

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
        
    # Load cached venues
    cache_key = f"overpass_{req.city.lower().strip().replace(' ', '_')}"
    venues = get_cached_response(cache_key)
    
    if not venues:
        # If cache is missing, geocode and fetch again
        geo_data = geocode_city(req.city)
        if not geo_data:
            raise HTTPException(status_code=404, detail=f"Could not geocode city '{req.city}'")
        venues = fetch_venues(req.city, geo_data["bbox"], lat=geo_data["lat"], lon=geo_data["lon"])
        
    if not venues or (not venues["hotels"] and not venues["restaurants"]):
         raise HTTPException(status_code=404, detail="No venues found near the destination.")
         
    result = optimize_trip_budget(venues, req.days, req.people, req.budget)
    
    if result["status"] == "exceeded" or result["status"] == "failed":
        return {
            "success": False,
            "message": result.get("message", "Budget is too low to create a valid itinerary.")
        }
        
    # Generate day-wise TSP routing for the selected items
    day_itinerary = plan_day_wise_itinerary(
        result["hotel"],
        result["restaurants"],
        result["attractions"],
        req.days
    )

    # Do the same for the backup plan if it exists
    backup_plan = None
    if result.get("backup"):
        backup_itinerary = plan_day_wise_itinerary(
            result["backup"]["hotel"],
            result["backup"]["restaurants"],
            result["backup"]["attractions"],
            req.days
        )
        backup_plan = {
            "hotel": result["backup"]["hotel"],
            "total_cost": result["backup"]["total_cost"],
            "itinerary": backup_itinerary
        }
        
    return {
        "success": True,
        "plan": {
            "hotel": result["hotel"],
            "total_cost": result["total_cost"],
            "utility": result["utility"],
            "cost_per_person": result["total_cost"] / req.people,
            "itinerary": day_itinerary,
            "backup": backup_plan
        }
    }

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
