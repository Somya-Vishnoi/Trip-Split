import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "tripsplit_cache.db"

# API Settings
NOMINATIM_USER_AGENT = "TripSplit-Budget-Optimizer/1.0"
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
GEMINI_MODEL = "gemini-2.0-flash"

# Cache TTL (in seconds)
CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours

# Load .env file manually from project root if it exists
dotenv_path = BASE_DIR / ".env"
if dotenv_path.exists():
    with open(dotenv_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Optimization Heuristics
# Default assumed costs per person per visit/night (in INR - ₹)
DEFAULT_COSTS = {
    "hotel_budget": 1200.0,
    "hotel_mid": 3500.0,
    "hotel_luxury": 10000.0,
    "restaurant_budget": 250.0,
    "restaurant_mid": 750.0,
    "restaurant_luxury": 2000.0,
    "attraction_museum": 400.0,
    "attraction_park": 0.0,
    "attraction_bar": 1000.0,
    "attraction_other": 300.0,
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
