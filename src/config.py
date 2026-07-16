import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

if os.getenv("VERCEL"):
    DB_PATH = Path("/tmp/tripsplit_cache.db")
else:
    DB_PATH = DATA_DIR / "tripsplit_cache.db"

# API Settings
NOMINATIM_USER_AGENT = "TripSplit-Budget-Optimizer/1.0"
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
GEMINI_MODEL = "gemini-2.0-flash"

# Cache TTL (in seconds)
CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    import sys
    print("WARNING: GEMINI_API_KEY not set. Gemini fallback disabled.", file=sys.stderr)

# Optimization Heuristics
# Default assumed costs per person per visit/night (in INR - ₹)
DEFAULT_COSTS = {
    "hotel_budget": 600.0,
    "hotel_mid": 2000.0,
    "hotel_luxury": 7000.0,
    "restaurant_budget": 150.0,
    "restaurant_mid": 500.0,
    "restaurant_luxury": 1500.0,
    "attraction_museum": 200.0,
    "attraction_park": 0.0,
    "attraction_bar": 800.0,
    "attraction_other": 200.0,
}

# Default utility/value scores (out of 100)
DEFAULT_UTILITY = {
    "hotel_budget": 40.0,
    "hotel_mid": 75.0,
    "hotel_luxury": 95.0,
    "restaurant_budget": 40.0,
    "restaurant_mid": 70.0,
    "restaurant_luxury": 90.0,
    "attraction_museum": 65.0,
    "attraction_park": 50.0,
    "attraction_bar": 60.0,
    "attraction_other": 45.0,
}
