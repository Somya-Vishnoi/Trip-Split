from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from src.geocoding import geocode_city
from src.overpass import fetch_venues

app = FastAPI(title="TripSplit - Group Trip Budget Optimizer")

# Serve static files
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

class SearchRequest(BaseModel):
    city: str

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
    venues = fetch_venues(req.city, geo_data["bbox"])
    
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

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
