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
        return f"Assistant Error: Could not connect to Gemini API ({e})"
