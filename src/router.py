import math
from typing import List, Dict, Any, Tuple

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points in kilometers.
    """
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1 
    dlon = lon2 - lon1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    return c * 6371


def simple_kmeans(points: List[Dict[str, Any]], k: int, max_iter: int = 20) -> List[List[Dict[str, Any]]]:
    """
    Pure-Python K-Means clustering for geographic coordinates.
    """
    if not points:
        return [[] for _ in range(k)]
        
    if len(points) <= k:
        clusters = [[] for _ in range(k)]
        for i, p in enumerate(points):
            clusters[i].append(p)
        return clusters

    centroids = [(p["lat"], p["lon"]) for p in points[:k]]

    for _ in range(max_iter):
        clusters = [[] for _ in range(k)]
        
        for p in points:
            min_dist = float('inf')
            cluster_idx = 0
            for i, cent in enumerate(centroids):
                dist = haversine_distance(p["lat"], p["lon"], cent[0], cent[1])
                if dist < min_dist:
                    min_dist = dist
                    cluster_idx = i
            clusters[cluster_idx].append(p)
            
        new_centroids = []
        for i in range(k):
            if not clusters[i]:
                new_centroids.append(centroids[i])
                continue
            avg_lat = sum(p["lat"] for p in clusters[i]) / len(clusters[i])
            avg_lon = sum(p["lon"] for p in clusters[i]) / len(clusters[i])
            new_centroids.append((avg_lat, avg_lon))
            
        if centroids == new_centroids:
            break
        centroids = new_centroids
        
    return clusters


def get_geographic_name(lat: float, lon: float, center_lat: float, center_lon: float, idx: int) -> str:
    """
    Dynamically names a location cluster based on its geographic direction relative to the city center.
    """
    d_lat = lat - center_lat
    d_lon = lon - center_lon
    
    # Threshold for central zone (approx 1.5km)
    if abs(d_lat) < 0.015 and abs(d_lon) < 0.015:
        return "Central Exploration Zone"
        
    if abs(d_lat) > abs(d_lon):
        direction = "North" if d_lat > 0 else "South"
    else:
        direction = "East" if d_lon > 0 else "West"
        
    return f"{direction} Exploration Zone"


def cluster_attractions_by_location(
    attractions: List[Dict[str, Any]],
    k: int
) -> List[Dict[str, Any]]:
    """
    Clusters selected attractions geographically and names the zones.
    """
    if not attractions:
        return []

    # Filter out any bars/pubs from attractions (we list them separately as nightlife)
    sightseeing_attractions = [a for a in attractions if a.get("sub_type") != "bar"]
    
    if not sightseeing_attractions:
        return []

    k = max(1, min(k, len(sightseeing_attractions)))
    clusters = simple_kmeans(sightseeing_attractions, k)
    
    # Calculate overall center
    overall_lat = sum(a["lat"] for a in sightseeing_attractions) / len(sightseeing_attractions)
    overall_lon = sum(a["lon"] for a in sightseeing_attractions) / len(sightseeing_attractions)

    clustered_data = []
    zone_names_used = set()

    for idx, cluster in enumerate(clusters):
        if not cluster:
            continue
            
        avg_lat = sum(a["lat"] for a in cluster) / len(cluster)
        avg_lon = sum(a["lon"] for a in cluster) / len(cluster)
        
        zone_name = get_geographic_name(avg_lat, avg_lon, overall_lat, overall_lon, idx)
        
        # Ensure name uniqueness
        if zone_name in zone_names_used:
            zone_name = f"{zone_name} {idx + 1}"
        zone_names_used.add(zone_name)
        
        # Split attractions in this cluster into "Popular Places" vs "Underrated Gems"
        # Since we will enrich them with Gemini later, we can assign a temporary tag
        # We classify them based on utility or type for now
        popular_places = []
        underrated_gems = []
        
        for item in cluster:
            # Mainstream: museums, monuments, and historic landmarks
            # Underrated: scenic viewpoints, quiet parks, and generic attractions
            is_mainstream = item.get("sub_type") in ["museum", "gallery"] or "fort" in item["name"].lower() or "temple" in item["name"].lower() or "church" in item["name"].lower()
            if is_mainstream:
                popular_places.append(item)
            else:
                underrated_gems.append(item)
                
        clustered_data.append({
            "zone_id": idx + 1,
            "name": zone_name,
            "lat": avg_lat,
            "lon": avg_lon,
            "popular_places": popular_places,
            "underrated_gems": underrated_gems,
            "attractions_count": len(cluster)
        })
        
    return clustered_data
