import math
from typing import List, Dict, Any, Tuple

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) in kilometers.
    """
    # Convert decimal degrees to radians 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    # Haversine formula 
    dlat = lat2 - lat1 
    dlon = lon2 - lon1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers.
    return c * r


def simple_kmeans(points: List[Dict[str, Any]], k: int, max_iter: int = 20) -> List[List[Dict[str, Any]]]:
    """
    A simple pure-Python K-Means clustering algorithm for geographic coordinates.
    Returns:
        List of lists, where each sublist contains points assigned to that cluster index.
    """
    if not points:
        return [[] for _ in range(k)]
        
    if len(points) <= k:
        # If fewer points than clusters, assign each point to its own cluster
        clusters = [[] for _ in range(k)]
        for i, p in enumerate(points):
            clusters[i].append(p)
        return clusters

    # Initialize centroids: pick first k points as initial centroids
    centroids = [(p["lat"], p["lon"]) for p in points[:k]]

    for _ in range(max_iter):
        # Create empty clusters
        clusters = [[] for _ in range(k)]
        
        # Assign points to nearest centroid
        for p in points:
            min_dist = float('inf')
            cluster_idx = 0
            for i, cent in enumerate(centroids):
                dist = haversine_distance(p["lat"], p["lon"], cent[0], cent[1])
                if dist < min_dist:
                    min_dist = dist
                    cluster_idx = i
            clusters[cluster_idx].append(p)
            
        # Recompute centroids
        new_centroids = []
        for i in range(k):
            if not clusters[i]:
                # Keep old centroid if cluster is empty
                new_centroids.append(centroids[i])
                continue
            avg_lat = sum(p["lat"] for p in clusters[i]) / len(clusters[i])
            avg_lon = sum(p["lon"] for p in clusters[i]) / len(clusters[i])
            new_centroids.append((avg_lat, avg_lon))
            
        # Check if centroids changed (convergence check)
        if centroids == new_centroids:
            break
        centroids = new_centroids
        
    return clusters


def solve_greedy_tsp(hotel: Dict[str, Any], venues: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    """
    Solves the Traveling Salesperson Problem (TSP) using a greedy heuristic.
    Always starts and ends at the hotel.
    Returns:
        (ordered_route, total_distance_km)
    """
    if not venues:
        # Just hotel to hotel
        return [hotel, hotel], 0.0

    unvisited = list(venues)
    current = hotel
    route = [hotel]
    total_dist = 0.0

    while unvisited:
        # Find nearest unvisited venue
        nearest_idx = 0
        min_dist = float('inf')
        
        for i, v in enumerate(unvisited):
            dist = haversine_distance(current["lat"], current["lon"], v["lat"], v["lon"])
            if dist < min_dist:
                min_dist = dist
                nearest_idx = i
                
        nearest_venue = unvisited.pop(nearest_idx)
        total_dist += min_dist
        route.append(nearest_venue)
        current = nearest_venue

    # Return to hotel
    return_dist = haversine_distance(current["lat"], current["lon"], hotel["lat"], hotel["lon"])
    total_dist += return_dist
    route.append(hotel)

    return route, total_dist


def plan_day_wise_itinerary(
    hotel: Dict[str, Any],
    restaurants: List[Dict[str, Any]],
    attractions: List[Dict[str, Any]],
    days: int
) -> List[Dict[str, Any]]:
    """
    Partitions attractions and restaurants into days, then routes each day using Greedy TSP.
    """
    # 1. Cluster attractions into 'days' groups
    attraction_clusters = simple_kmeans(attractions, days)

    # 2. Assign restaurants to days based on spatial proximity
    # We need 2 unique restaurants per day.
    assigned_restaurants = [[] for _ in range(days)]
    available_rests = list(restaurants)

    for d in range(days):
        # Find centroid of this day's attractions, or use hotel if empty
        cluster = attraction_clusters[d]
        if cluster:
            c_lat = sum(a["lat"] for a in cluster) / len(cluster)
            c_lon = sum(a["lon"] for a in cluster) / len(cluster)
        else:
            c_lat = hotel["lat"]
            c_lon = hotel["lon"]

        # Sort remaining restaurants by distance to this centroid
        available_rests.sort(
            key=lambda r: haversine_distance(c_lat, c_lon, r["lat"], r["lon"])
        )

        # Take the top 2 closest available restaurants
        for _ in range(2):
            if available_rests:
                assigned_restaurants[d].append(available_rests.pop(0))

    # 3. Solve Greedy TSP for each day
    day_itineraries = []
    for d in range(days):
        day_venues = attraction_clusters[d] + assigned_restaurants[d]
        route, distance = solve_greedy_tsp(hotel, day_venues)
        
        day_itineraries.append({
            "day": d + 1,
            "route": route,
            "total_distance_km": round(distance, 2),
            "attractions_count": len(attraction_clusters[d]),
            "restaurants_count": len(assigned_restaurants[d])
        })

    return day_itineraries
