import sqlite3
import json
import os
import requests
from typing import Dict, List, Any
from src.config import GEMINI_API_KEY, GEMINI_MODEL
from src.cache import get_cached_response, set_cached_response

def get_venue_cache_key(name: str, city: str) -> str:
    """
    Generate a standardized cache key for a venue in a specific city.
    """
    cleaned = name.lower().strip().replace(" ", "_")
    cleaned_city = city.lower().strip().replace(" ", "_")
    return f"enrich_{cleaned_city}_{cleaned}"

def enrich_trip_plan(plan: Dict[str, Any], city: str) -> Dict[str, Any]:
    """
    Enriches selected hotels, restaurants, bars, and sightseeing attractions with Gemini 2.0.
    Checks the local cache database first to avoid duplicate API calls.
    """
    if not GEMINI_API_KEY:
        print("[Gemini Warning] No API key found. Skipping enrichment.")
        return plan

    # 1. Gather all items in the plan
    hotel = plan.get("hotel")
    restaurants = plan.get("restaurants", [])
    bars = plan.get("bars", [])
    
    # Extract sightseeing attractions from zones
    attractions = []
    for zone in plan.get("zones", []):
        attractions.extend(zone.get("popular_places", []))
        attractions.extend(zone.get("underrated_gems", []))

    # 2. Check local database cache for each venue
    enriched_data = {}
    missing_venues = []  # List of tuples (category, name)
    
    # A. Hotel
    if hotel and hotel.get("id") != "virtual_depot":
        h_key = get_venue_cache_key(hotel["name"], city)
        h_cached = get_cached_response(h_key)
        if h_cached:
            enriched_data[hotel["name"]] = h_cached
        else:
            missing_venues.append(("hotel", hotel["name"]))

    # B. Restaurants
    for r in restaurants:
        r_key = get_venue_cache_key(r["name"], city)
        r_cached = get_cached_response(r_key)
        if r_cached:
            enriched_data[r["name"]] = r_cached
        else:
            missing_venues.append(("restaurant", r["name"]))

    # C. Bars
    for b in bars:
        b_key = get_venue_cache_key(b["name"], city)
        b_cached = get_cached_response(b_key)
        if b_cached:
            enriched_data[b["name"]] = b_cached
        else:
            missing_venues.append(("bar", b["name"]))

    # D. Attractions
    for a in attractions:
        a_key = get_venue_cache_key(a["name"], city)
        a_cached = get_cached_response(a_key)
        if a_cached:
            enriched_data[a["name"]] = a_cached
        else:
            missing_venues.append(("attraction", a["name"]))

    # 3. If there are missing items, fetch from Gemini in a single batched call
    if missing_venues:
        prompt = f"You are a local travel guide for {city}. Provide concise descriptions, vibes, cost info, and local tips for these places. Return a structured JSON response matching the schema below.\n\n"
        prompt += "Venues to enrich:\n"
        for cat, name in missing_venues:
            prompt += f"- [{cat.upper()}] {name}\n"

        prompt += """
Return a JSON object with this exact structure:
{
  "venues": [
    {
      "name": "Exact venue name matching the requested list",
      "category": "hotel" | "restaurant" | "bar" | "attraction",
      "description": "Short engaging 1-2 sentence description of what the place is.",
      "vibe": "Brief vibe (e.g. cozy, lively, spiritual, peaceful, luxury)",
      "cost_info": "Estimated pricing info (e.g. '₹300/person', 'Free', '₹1500/night')",
      "extra_tips": "A local tip (e.g. recommended dish, dress code, best view spot)",
      "is_gem": true/false // (only for attractions: true if it is an underrated/hidden gem, false if it is a major popular mainstream sight)
    }
  ]
}
Do not return any markdown codeblocks or text outside the JSON. Return only the raw JSON.
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        
        import time
        max_retries = 3
        backoff = 2.0
        parsed = {}
        
        try:
            for attempt in range(max_retries):
                try:
                    res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=25)
                    if res.status_code == 429:
                        if attempt < max_retries - 1:
                            print(f"[Gemini 429] Rate limit hit. Retrying in {backoff}s...")
                            time.sleep(backoff)
                            backoff *= 2.0
                            continue
                    res.raise_for_status()
                    res_json = res.json()
                    text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text)
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise e
                    print(f"[Gemini Retry] Attempt {attempt + 1} failed: {e}. Retrying in {backoff}s...")
                    time.sleep(backoff)
                    backoff *= 2.0
                
            # Cache the newly fetched enrichments
            for item in parsed.get("venues", []):
                name = item["name"]
                cache_key = get_venue_cache_key(name, city)
                set_cached_response(cache_key, item)
                enriched_data[name] = item
                
        except Exception as e:
            print(f"[Gemini Error] Batch enrichment failed: {e}")

    # 4. Apply enrichments back to the plan
    # A. Hotel
    if hotel and hotel.get("id") != "virtual_depot" and hotel["name"] in enriched_data:
        hotel["enrichment"] = enriched_data[hotel["name"]]

    # B. Restaurants
    for r in restaurants:
        if r["name"] in enriched_data:
            r["enrichment"] = enriched_data[r["name"]]

    # C. Bars
    for b in bars:
        if b["name"] in enriched_data:
            b["enrichment"] = enriched_data[b["name"]]

    # D. Sightseeing Attractions
    for zone in plan.get("zones", []):
        new_popular = []
        new_underrated = []
        
        all_zone_attrs = zone.get("popular_places", []) + zone.get("underrated_gems", [])
        
        for a in all_zone_attrs:
            if a["name"] in enriched_data:
                a["enrichment"] = enriched_data[a["name"]]
                is_gem = enriched_data[a["name"]].get("is_gem", False)
                if is_gem:
                    new_underrated.append(a)
                else:
                    new_popular.append(a)
            else:
                if a in zone.get("popular_places", []):
                    new_popular.append(a)
                else:
                    new_underrated.append(a)
                    
        zone["popular_places"] = new_popular
        zone["underrated_gems"] = new_underrated

    return plan

def query_gemini_assistant(query: str, favorites: List[Dict[str, Any]]) -> str:
    """
    Queries Gemini as a travel assistant. Can answer general travel queries and utilize saved venues context.
    """
    if not GEMINI_API_KEY:
        return "Assistant: Please add your Gemini API Key in the config or .env to enable the AI travel assistant."

    prompt = f"""
    You are the TripSplit Travel AI Assistant, a world-class travel guide, local experience expert, and travel planner. 
    
    The user can ask you any question about travel, destinations, itineraries, cultural tips, packing lists, general travel experiences, local cuisines, or anything they need.
    
    Additionally, for context, here is the user's Saved/Hearted Venues Board (hotels, restaurants, attractions they saved):
    {json.dumps(favorites, indent=2)}
    
    User Query: "{query}"
    
    Instructions:
    1. Answer the user's question comprehensively and helpfully.
    2. Draw from your extensive global travel knowledge to give detailed tips, advice, and cultural suggestions that aren't just dry facts.
    3. If the user's query relates to their saved venues or if you see a relevant match in their Saved Board, reference those venues naturally.
    4. Keep your tone enthusiastic, professional, and friendly.
    5. Use markdown formatting. Keep the answer concise (under 250 words) yet high-value and satisfying.
    6. Never refer to yourself as TripAdvisor; you are the TripSplit Travel Assistant.
    """

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        response = requests.post(url, json=payload, timeout=15)
        response.raise_for_status()
        res_json = response.json()
        text = res_json["candidates"][0]["content"]["parts"][0]["text"]
        return text.strip()
    except Exception as e:
        # Fallback Local Rule-Based Travel Assistant in case of 429 rate limits
        q_l = query.lower()
        
        # Build list of saved names
        saved_names = [f["name"] for f in favorites]
        saved_str = ", ".join(saved_names) if saved_names else "None"
        
        if "hotel" in q_l or "stay" in q_l or "accommodation" in q_l:
            response_text = "🏢 **Accommodation Advisor:** Based on your saved spots (" + saved_str + "), I recommend selecting a hotel with close proximity to your sightseeing clusters to avoid travel times. Stays with 4.0+ ratings generally offer the best value-to-budget ratio!\n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
        elif "food" in q_l or "eat" in q_l or "restaurant" in q_l or "cuisine" in q_l or "dish" in q_l:
            response_text = "🍽️ **Local Culinary Tips:** If you are visiting Mumbai, do not miss **Vada Pav** near chowpatty or local butter garlic crab! For Jaipur, **Dal Baati Churma** at Chokhi Dhani is a must-try. Always ask for spice levels to be adjusted to your liking when exploring local eateries!\n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
        elif "sunset" in q_l or "view" in q_l or "beach" in q_l:
            response_text = "🌅 **Scenic Views & Sunset:** Marine Drive in Mumbai and Baga/Calangute beach in Goa offer spectacular sunset views. Make sure to arrive by 5:15 PM to secure a good spot and beat the evening peak crowds!\n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
        elif "pack" in q_l or "dress" in q_l or "carry" in q_l:
            response_text = "🎒 **Packing Checklist:** For warm coastal regions, carry light cotton clothing, sunscreen, and polarized sunglasses. If visiting religious temples or historical palaces, ensure dress code compliance (shoulders and knees covered).\n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
        elif "budget" in q_l or "cost" in q_l or "price" in q_l:
            response_text = "💰 **Budget Planning:** Remember that all tourist sightseeing entry tickets are calculated as **budget-free** in TripSplit, so you can explore freely! Focus your main budget on quality hotel rooms and dining experiences.\n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
        else:
            response_text = "🤖 **TripSplit Offline Travel Guide:** That sounds like a wonderful travel query! To make the most of your trip, I highly recommend scheduling sightseeing stops during early mornings to avoid peak crowds, and booking travel tickets in advance. \n\n*(Note: Gemini API is currently rate-limited; displaying local offline guidelines)*"
            
        return response_text


def generate_venues_via_gemini(city_name: str) -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """
    Uses Gemini to generate a highly realistic catalog of 15 hotels, 15 restaurants, and 15 attractions
    for any destination in the world when Overpass returns insufficient data.
    Uses database caching to avoid duplicate API calls.
    """
    if not GEMINI_API_KEY:
        print("[Gemini Warning] No API key found for venue generation.")
        return None

    cache_key = f"gemini_venues_{city_name.lower().strip().replace(' ', '_')}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    prompt = f"""You are a world-class travel expert. Generate a detailed, highly accurate, and popular travel catalog of real places for: '{city_name}'.
Return exactly 15 famous and real hotels/stays, exactly 15 famous and real restaurants/cafes, and exactly 15 famous and real attractions/beaches/bars.

Requirements:
1. All venues must be REAL, famous, and located in or near '{city_name}'.
2. Estimate coordinates (lat, lon) accurately for the destination.
3. For hotels: stars should be 1-5, cost is average nightly rate in INR (₹).
4. For restaurants: price_level should be 1-3, cost is average meal cost for a group in INR (₹).
5. For attractions: cost is average group entry fee (0 for free viewpoints/beaches/parks, etc.). Include at least 3 bars/nightclubs and 2 beaches (if coastal, otherwise scenic parks/viewpoints).
6. Return a JSON object with this exact schema:
{{
  "hotels": [
    {{
      "id": "gemini_h1",
      "name": "Hotel Name",
      "lat": float,
      "lon": float,
      "sub_type": "hotel" | "hostel" | "resort" | "apartment",
      "stars": float,
      "cost": float,
      "tags": {{"name": "Hotel Name", "tourism": "hotel"}}
    }}
  ],
  "restaurants": [
    {{
      "id": "gemini_r1",
      "name": "Restaurant Name",
      "lat": float,
      "lon": float,
      "sub_type": "restaurant" | "cafe" | "fast_food",
      "stars": float,
      "cost": float,
      "tags": {{"name": "Restaurant Name", "amenity": "restaurant"}}
    }}
  ],
  "attractions": [
    {{
      "id": "gemini_e1",
      "name": "Attraction Name",
      "lat": float,
      "lon": float,
      "sub_type": "museum" | "viewpoint" | "park" | "bar" | "beach" | "historic",
      "stars": float,
      "cost": float,
      "tags": {{"name": "Attraction Name", "tourism": "attraction"}}
    }}
  ]
}}
Do not return any markdown codeblocks or text outside the JSON. Return only the raw JSON.
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=25)
        res.raise_for_status()
        res_json = res.json()
        text = res_json["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        
        # Validate structure
        if "hotels" in parsed and "restaurants" in parsed and "attractions" in parsed:
            set_cached_response(cache_key, parsed)
            return parsed
    except Exception as e:
        print(f"[Gemini Error] Venue generation failed: {e}")
        
    return None

