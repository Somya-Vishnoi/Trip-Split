// State Variables
let map = null;
let mapLayers = [];

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    setupForm();
});

// Tab Switch Logic
function initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetContent = document.getElementById(tabId);
            if (targetContent) {
                targetContent.classList.add("active");
            }

            // Invalidate Leaflet size if switching to map tab
            if (tabId === "map-tab" && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });
}

// Map Initialization
function initializeLeafletMap(lat, lon, bbox) {
    const mapContainer = document.getElementById("map");
    // Clear placeholder
    mapContainer.innerHTML = "";

    // Create Leaflet instance
    map = L.map("map").setView([lat, lon], 12);

    // Load CartoDB Dark Matter Tiles (Fits premium dark UI)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">CartoDB</a> contributors',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Draw the bounding box
    if (bbox && bbox.length === 4) {
        const [minLat, maxLat, minLon, maxLon] = bbox;
        const bounds = [[minLat, minLon], [maxLat, maxLon]];
        L.rectangle(bounds, {
            color: "#8b5cf6",
            weight: 2,
            fillColor: "#8b5cf6",
            fillOpacity: 0.05
        }).addTo(map);
        map.fitBounds(bounds);
    }
}

// Form Submission & Search
function setupForm() {
    const form = document.getElementById("search-form");
    const loader = document.getElementById("loader");
    const searchBtn = document.getElementById("search-btn");
    
    const venuesTab = document.getElementById("venues-tab");
    const venuesData = document.getElementById("venues-data");
    const placeholder = venuesTab.querySelector(".summary-placeholder");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const city = document.getElementById("destination").value.strip ? 
                     document.getElementById("destination").value.strip() : 
                     document.getElementById("destination").value.trim();
        
        if (!city) return;

        // UI Feedback
        loader.classList.remove("hidden");
        searchBtn.disabled = true;

        try {
            const response = await fetch("/api/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ city })
            });

            if (!response.ok) {
                throw new Error(await response.text() || "Failed to fetch data");
            }

            const data = await response.json();
            
            // 1. Initialize Map
            initializeLeafletMap(data.geocoding.lat, data.geocoding.lon, data.geocoding.bbox);

            // 2. Populate stats & sample venues
            document.getElementById("hotel-count").textContent = data.venue_counts.hotels;
            document.getElementById("rest-count").textContent = data.venue_counts.restaurants;
            document.getElementById("attr-count").textContent = data.venue_counts.attractions;

            populateList("sample-hotels", data.sample_venues.hotels, "No hotels found");
            populateList("sample-restaurants", data.sample_venues.restaurants, "No restaurants found");
            populateList("sample-attractions", data.sample_venues.attractions, "No attractions found");

            // Switch view
            placeholder.classList.add("hidden");
            venuesData.classList.remove("hidden");

            // Programmatically open Candidate Venues tab to show statistics
            const venuesTabBtn = document.querySelector('[data-tab="venues-tab"]');
            if (venuesTabBtn) {
                venuesTabBtn.click();
            }

        } catch (error) {
            alert(`Error: ${error.message}`);
            console.error(error);
        } finally {
            loader.classList.add("hidden");
            searchBtn.disabled = false;
        }
    });
}

function populateList(elementId, items, emptyMessage) {
    const list = document.getElementById(elementId);
    list.innerHTML = "";
    
    if (!items || items.length === 0) {
        const li = document.createElement("li");
        li.textContent = emptyMessage;
        li.style.fontStyle = "italic";
        list.appendChild(li);
        return;
    }

    items.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        li.title = name;
        list.appendChild(li);
    });
}
