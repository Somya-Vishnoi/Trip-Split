// State Variables
let map = null;
let mapLayers = [];

// Currency Exchange Rates to INR (₹)
const EXCHANGE_RATES = {
    USD: 83.5,
    EUR: 90.0,
    GBP: 106.0,
    AED: 22.7,
    SGD: 61.8
};

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    setupForm();
    initCurrencyConverter();
    
    // Toggle Intercity Travel Fields
    const travelCheckbox = document.getElementById("add-intercity-travel");
    const travelFields = document.getElementById("intercity-fields");
    if (travelCheckbox && travelFields) {
        travelCheckbox.addEventListener("change", () => {
            if (travelCheckbox.checked) {
                travelFields.classList.remove("hidden");
            } else {
                travelFields.classList.add("hidden");
            }
        });
    }
});

// Helper for formatting numeric cost values safely
function formatCost(val) {
    if (val === undefined || val === null) return "0.00";
    if (typeof val === "number") return val.toFixed(2);
    const num = parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
}

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
                setTimeout(() => {
                    if (map) {
                        map.invalidateSize();
                    }
                }, 200);
            }
        });
    });
}

// Currency Converter Logic
function initCurrencyConverter() {
    const amountInput = document.getElementById("conv-amount");
    const currencySelect = document.getElementById("conv-from");
    const resultDiv = document.getElementById("conv-result");
    const applyBtn = document.getElementById("apply-budget-btn");

    if (!amountInput || !currencySelect || !resultDiv || !applyBtn) return;

    function updateConversion() {
        const amt = parseFloat(amountInput.value);
        const cur = currencySelect.value;
        if (isNaN(amt) || amt <= 0) {
            resultDiv.textContent = "₹0.00";
            return;
        }
        const rate = EXCHANGE_RATES[cur] || 1.0;
        const inr = amt * rate;
        resultDiv.textContent = `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    amountInput.addEventListener("input", updateConversion);
    currencySelect.addEventListener("change", updateConversion);

    applyBtn.addEventListener("click", () => {
        const amt = parseFloat(amountInput.value);
        const cur = currencySelect.value;
        if (!isNaN(amt) && amt > 0) {
            const rate = EXCHANGE_RATES[cur] || 1.0;
            const inr = Math.round(amt * rate);
            const budgetInput = document.getElementById("budget");
            if (budgetInput) {
                budgetInput.value = inr;
                alert(`Applied ₹${inr.toLocaleString("en-IN")} to your budget!`);
            }
        }
    });

    updateConversion(); // Initial run
}

// Map Initialization (Strictly Light Mode Map)
function initializeLeafletMap(lat, lon, bbox) {
    if (map) {
        try {
            map.remove();
        } catch (e) {
            console.error("Error removing map instance:", e);
        }
        map = null;
    }
    const mapContainer = document.getElementById("map");
    if (!mapContainer) return;
    mapContainer.innerHTML = "";

    // Create Leaflet instance
    map = L.map("map").setView([lat, lon], 12);

    // Load CartoDB Positron Light Tiles (Fits premium light UI)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">CartoDB</a> contributors',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Force Leaflet to recalculate bounds immediately
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 150);

    // Draw the bounding box
    if (bbox && bbox.length === 4) {
        const [minLat, maxLat, minLon, maxLon] = bbox;
        const bounds = [[minLat, minLon], [maxLat, maxLon]];
        L.rectangle(bounds, {
            color: "#7C3AED",
            weight: 2,
            fillColor: "#7C3AED",
            fillOpacity: 0.03
        }).addTo(map);
        map.fitBounds(bounds);
    }
}

// Form Submission & Orchestration
function setupForm() {
    const form = document.getElementById("search-form");
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");
    const searchBtn = document.getElementById("search-btn");
    
    // Elements to show/hide
    const venuesTab = document.getElementById("venues-tab");
    const venuesData = document.getElementById("venues-data");
    const placeholder = venuesTab ? venuesTab.querySelector(".summary-placeholder") : null;

    const planTab = document.getElementById("plan-tab");
    const planData = document.getElementById("plan-data");
    const planPlaceholder = planTab ? planTab.querySelector(".plan-placeholder") : null;

    if (!form || !loader || !searchBtn) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const city = document.getElementById("destination").value.trim();
        const people = parseInt(document.getElementById("people").value);
        const days = parseInt(document.getElementById("days").value);
        const budget = parseFloat(document.getElementById("budget").value);
        
        const includeStay = document.getElementById("filter-stay").checked;
        const includeAttractions = document.getElementById("filter-attractions").checked;
        const includeTransport = document.getElementById("filter-transport").checked;

        const addTravel = document.getElementById("add-intercity-travel").checked;
        const originCity = document.getElementById("origin-city").value.trim();
        const travelMode = document.getElementById("intercity-mode").value;
        
        if (!city || !people || !days || !budget) return;

        // UI Feedback
        loader.classList.remove("hidden");
        loaderText.textContent = "Geocoding & fetching venues from OpenStreetMap...";
        searchBtn.disabled = true;

        try {
            // STEP 1: Search & Fetch Candidates
            const searchResponse = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ city })
            });

            if (!searchResponse.ok) {
                throw new Error(await searchResponse.text() || "Failed to search city.");
            }

            const searchData = await searchResponse.json();
            
            // Render Map
            initializeLeafletMap(searchData.geocoding.lat, searchData.geocoding.lon, searchData.geocoding.bbox);

            // Populate Candidates stats
            const hotelCountEl = document.getElementById("hotel-count");
            if (hotelCountEl) hotelCountEl.textContent = searchData.venue_counts.hotels;
            const restCountEl = document.getElementById("rest-count");
            if (restCountEl) restCountEl.textContent = searchData.venue_counts.restaurants;
            const attrCountEl = document.getElementById("attr-count");
            if (attrCountEl) attrCountEl.textContent = searchData.venue_counts.attractions;

            populateList("sample-hotels", searchData.sample_venues.hotels, "No hotels found");
            populateList("sample-restaurants", searchData.sample_venues.restaurants, "No restaurants found");
            populateList("sample-attractions", searchData.sample_venues.attractions, "No attractions found");

            if (placeholder) placeholder.classList.add("hidden");
            if (venuesData) venuesData.classList.remove("hidden");

            // STEP 2: Optimize Budget Plan
            loaderText.textContent = "Running multi-stage Knapsack DP Optimizer...";
            
            const planResponse = await fetch("/api/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    city, budget, days, people,
                    include_stay: includeStay,
                    include_transport: includeTransport,
                    include_attractions: includeAttractions,
                    add_travel: addTravel,
                    origin_city: addTravel ? originCity : null,
                    travel_mode: addTravel ? travelMode : null
                })
            });

            if (!planResponse.ok) {
                throw new Error(await planResponse.text() || "Failed to optimize budget plan.");
            }

            const planResult = await planResponse.json();

            if (!planResult.success) {
                // Show budget exceeded warning
                if (planPlaceholder) {
                    planPlaceholder.innerHTML = `<p style="color: var(--accent); font-weight: bold;">⚠️ Optimization Failed: ${planResult.message}</p>`;
                    planPlaceholder.classList.remove("hidden");
                }
                if (planData) planData.classList.add("hidden");
            } else {
                const plan = planResult.plan;
                
                // Populate Plan Summary
                const totalCostEl = document.getElementById("plan-total-cost");
                if (totalCostEl) totalCostEl.textContent = `₹${formatCost(plan.total_cost)}`;
                const personCostEl = document.getElementById("plan-person-cost");
                if (personCostEl) personCostEl.textContent = `₹${formatCost(plan.cost_per_person)}`;
                
                const statusBadge = document.getElementById("plan-status");
                if (statusBadge) {
                    statusBadge.textContent = "Within Budget";
                    statusBadge.className = "plan-status-badge";
                }

                // Render Travel Breakdown details if active
                const travelContainer = document.getElementById("travel-breakdown-container");
                const travelDetails = document.getElementById("travel-breakdown-details");
                if (plan.travel_cost && plan.travel_cost > 0) {
                    if (travelContainer) travelContainer.classList.remove("hidden");
                    if (travelDetails) {
                        const modeName = plan.travel_mode === "flight" ? "Flight" : 
                                         plan.travel_mode === "train_3ac" ? "Train (3AC)" : 
                                         plan.travel_mode === "train_sleeper" ? "Train (Sleeper)" : "Bus";
                        const destName = plan.hotel && plan.hotel.id !== "virtual_depot" ? plan.hotel.name : "City Center";
                        travelDetails.innerHTML = `
                            <div style="margin-bottom: 0.25rem;"><strong>Roundtrip Travel:</strong> ${plan.origin_city} ➔ ${destName}</div>
                            <div>Distance: ${plan.distance_km.toFixed(1)} km | Mode: ${modeName}</div>
                            <div style="margin-top: 0.35rem; font-size: 0.85rem; border-top: 1.5px dashed var(--border); padding-top: 0.35rem;">
                                Travel: <strong>₹${formatCost(plan.travel_cost)}</strong> | 
                                Local Trip: <strong>₹${formatCost(plan.local_trip_cost)}</strong>
                            </div>
                        `;
                    }
                } else {
                    if (travelContainer) travelContainer.classList.add("hidden");
                }
                
                // Populate Hotel / Stay
                const hotelCardContainer = document.getElementById("opt-hotel-card-container");
                const hotelDetail = document.getElementById("opt-hotel-detail");
                if (plan.hotel && plan.hotel.id !== "virtual_depot") {
                    if (hotelCardContainer) hotelCardContainer.classList.remove("hidden");
                    if (hotelDetail) {
                        const starsText = plan.hotel.stars ? ` (${plan.hotel.stars} Star)` : "";
                        const hotelType = plan.hotel.sub_type ? plan.hotel.sub_type.toUpperCase() : "HOTEL";
                        hotelDetail.innerHTML = `
                            <div class="hotel-details-block">
                                <div class="hotel-name">${plan.hotel.name}</div>
                                <div class="hotel-meta">${hotelType} ${starsText}</div>
                                <div class="hotel-cost">Est. Total: ₹${formatCost(plan.hotel.cost)}</div>
                            </div>
                        `;
                    }
                } else {
                    if (hotelCardContainer) hotelCardContainer.classList.add("hidden");
                }

                // Render Food & Nightlife Recommendations
                renderFoodAndNightlife(plan.restaurants, plan.bars);

                // Render Clustered Exploration Zones timeline
                renderExplorationZones(plan.zones);

                // Draw zones, pins and connection lines on Leaflet map
                plotZonesOnMap(plan.zones, plan.hotel, plan.restaurants, plan.bars);

                // Populate Backup Plan
                const backupSection = document.getElementById("backup-plan-section");
                if (backupSection) {
                    if (plan.backup) {
                        const backupCostBadge = document.getElementById("backup-cost-badge");
                        if (backupCostBadge) backupCostBadge.textContent = `₹${formatCost(plan.backup.total_cost)}`;
                        const backupHotelName = document.getElementById("backup-hotel-name");
                        if (backupHotelName) {
                            backupHotelName.textContent = plan.backup.hotel && plan.backup.hotel.id !== "virtual_depot" 
                                ? plan.backup.hotel.name 
                                : "No accommodation (local trip)";
                        }
                        backupSection.classList.remove("hidden");
                    } else {
                        backupSection.classList.add("hidden");
                    }
                }

                if (planPlaceholder) planPlaceholder.classList.add("hidden");
                if (planData) planData.classList.remove("hidden");
            }

            // Automatically focus the "Budget Plan" tab
            const planTabBtn = document.querySelector('[data-tab="plan-tab"]');
            if (planTabBtn) {
                planTabBtn.click();
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
    if (!list) return;
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

// Render Food and Nightlife lists (Restaurants & Bars)
function renderFoodAndNightlife(restaurants, bars) {
    const restList = document.getElementById("opt-restaurants-list");
    if (restList) {
        restList.innerHTML = "";
        if (!restaurants || restaurants.length === 0) {
            restList.innerHTML = "<li style='font-style: italic;'>None selected</li>";
        } else {
            // Group duplicate counts (since we cycle/duplicate due to scarcity)
            const counts = {};
            restaurants.forEach(r => {
                const name = r.name;
                counts[name] = counts[name] ? { ...r, qty: counts[name].qty + 1 } : { ...r, qty: 1 };
            });
            
            Object.values(counts).forEach(r => {
                const li = document.createElement("li");
                const qtyText = r.qty > 1 ? ` <span class="badge-qty" style="color: var(--accent); font-weight: bold; margin-left: 4px;">x${r.qty}</span>` : "";
                li.innerHTML = `
                    <span class="opt-item-name">${r.name}${qtyText}</span>
                    <span class="opt-item-cost">₹${formatCost(r.cost * r.qty)}</span>
                `;
                restList.appendChild(li);
            });
        }
    }

    const barsContainer = document.getElementById("opt-bars-container");
    const barsList = document.getElementById("opt-bars-list");
    if (barsList) {
        barsList.innerHTML = "";
        if (!bars || bars.length === 0) {
            if (barsContainer) barsContainer.classList.add("hidden");
        } else {
            if (barsContainer) barsContainer.classList.remove("hidden");
            bars.forEach(b => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span class="opt-item-name">${b.name}</span>
                    <span class="opt-item-cost">${b.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(b.cost)}</span>
                `;
                barsList.appendChild(li);
            });
        }
    }
}

// Render Exploration Zones timeline HTML
function renderExplorationZones(zones) {
    const container = document.getElementById("opt-zones-container");
    if (!container) return;
    container.innerHTML = "";

    const zonesSection = document.getElementById("opt-zones-section");
    if (!zones || zones.length === 0) {
        if (zonesSection) zonesSection.classList.add("hidden");
        return;
    }
    if (zonesSection) zonesSection.classList.remove("hidden");

    zones.forEach(zone => {
        const zoneBlock = document.createElement("div");
        zoneBlock.className = "zone-block";

        // Zone Header
        const header = document.createElement("div");
        header.className = "zone-header";
        header.innerHTML = `
            <h4>${zone.name}</h4>
            <span class="zone-count-badge">${zone.attractions_count} Attractions</span>
        `;
        zoneBlock.appendChild(header);

        // Zone Content
        const content = document.createElement("div");
        content.className = "zone-content";

        // Popular Places Group
        if (zone.popular_places && zone.popular_places.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group popular";
            group.innerHTML = `
                <h5>Popular Sights</h5>
                <ul class="zone-list">
                    ${zone.popular_places.map(item => `
                        <li class="zone-item">
                            <span class="zone-item-name">${item.name}</span>
                            <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
            content.appendChild(group);
        }

        // Underrated Gems Group
        if (zone.underrated_gems && zone.underrated_gems.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group underrated";
            group.innerHTML = `
                <h5>Underrated Gems</h5>
                <ul class="zone-list">
                    ${zone.underrated_gems.map(item => `
                        <li class="zone-item">
                            <span class="zone-item-name">${item.name}</span>
                            <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
            content.appendChild(group);
        }

        zoneBlock.appendChild(content);
        container.appendChild(zoneBlock);
    });
}

// Plot Zones, Restaurants, and Pins on the Leaflet Map
function plotZonesOnMap(zones, hotel, restaurants, bars) {
    mapLayers.forEach(layer => {
        try {
            map.removeLayer(layer);
        } catch (e) {
            console.error(e);
        }
    });
    mapLayers = [];

    if (!map) return;

    const allLatLngs = [];

    // 1. Plot hotel/depot if stay is included
    if (hotel && hotel.id !== "virtual_depot") {
        const hotelMarker = L.marker([hotel.lat, hotel.lon]).addTo(map);
        hotelMarker.bindPopup(`
            <div style="text-align: center;">
                <span style="font-size: 1.2rem;">🏨</span><br>
                <b style="color: var(--accent);">${hotel.name}</b><br>
                <i>Stay Location</i>
            </div>
        `);
        mapLayers.push(hotelMarker);
        allLatLngs.push([hotel.lat, hotel.lon]);
    }

    // 2. Plot Restaurants (Orange Pins)
    if (restaurants) {
        restaurants.forEach(r => {
            const marker = L.circleMarker([r.lat, r.lon], {
                radius: 7,
                fillColor: "#EA580C", // Orange
                color: "#FFFFFF",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.85
            }).addTo(map);
            marker.bindPopup(`<b>🍽️ Restaurant: ${r.name}</b><br>Est. Cost: ₹${formatCost(r.cost)}`);
            mapLayers.push(marker);
            allLatLngs.push([r.lat, r.lon]);
        });
    }

    // 3. Plot Nightlife Bars (Purple Pins)
    if (bars) {
        bars.forEach(b => {
            const marker = L.circleMarker([b.lat, b.lon], {
                radius: 7,
                fillColor: "#9333EA", // Purple
                color: "#FFFFFF",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.85
            }).addTo(map);
            marker.bindPopup(`<b>🍻 Nightlife: ${b.name}</b><br>Cost: ${b.cost === 0 ? 'Free' : '₹' + formatCost(b.cost)}`);
            mapLayers.push(marker);
            allLatLngs.push([b.lat, b.lon]);
        });
    }

    // 4. Plot Zones with different colors and connection lines
    const ZONE_COLORS = ["#2563EB", "#059669", "#DC2626", "#D97706", "#DB2777"];
    
    if (zones) {
        zones.forEach((zone, zoneIdx) => {
            const color = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
            const zoneCoords = [];

            // Plot Popular places (Red dots)
            if (zone.popular_places) {
                zone.popular_places.forEach(item => {
                    const marker = L.circleMarker([item.lat, item.lon], {
                        radius: 8,
                        fillColor: "#DC2626", // Red for Popular
                        color: "#FFFFFF",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    }).addTo(map);
                    
                    const costText = item.cost === 0 ? "Free" : `₹${formatCost(item.cost)}`;
                    marker.bindPopup(`
                        <b>🏛️ ${item.name}</b><br>
                        <span style="color: #DC2626; font-weight: bold;">POPULAR SIGHT</span><br>
                        <span>Zone: ${zone.name}</span><br>
                        <span>Cost: ${costText}</span>
                    `);
                    mapLayers.push(marker);
                    zoneCoords.push([item.lat, item.lon]);
                    allLatLngs.push([item.lat, item.lon]);
                });
            }

            // Plot Underrated gems (Green dots)
            if (zone.underrated_gems) {
                zone.underrated_gems.forEach(item => {
                    const marker = L.circleMarker([item.lat, item.lon], {
                        radius: 8,
                        fillColor: "#059669", // Green for Underrated Gem
                        color: "#FFFFFF",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    }).addTo(map);
                    
                    const costText = item.cost === 0 ? "Free" : `₹${formatCost(item.cost)}`;
                    marker.bindPopup(`
                        <b>💎 ${item.name}</b><br>
                        <span style="color: #059669; font-weight: bold;">UNDERRATED GEM</span><br>
                        <span>Zone: ${zone.name}</span><br>
                        <span>Cost: ${costText}</span>
                    `);
                    mapLayers.push(marker);
                    zoneCoords.push([item.lat, item.lon]);
                    allLatLngs.push([item.lat, item.lon]);
                });
            }

            // Draw zone boundary connecting lines to show proximity grouping
            if (zoneCoords.length > 1) {
                const polyline = L.polyline(zoneCoords, {
                    color: color,
                    weight: 2,
                    opacity: 0.5,
                    dashArray: "4, 4"
                }).addTo(map);
                mapLayers.push(polyline);
            }
        });
    }

    if (allLatLngs.length > 0) {
        map.fitBounds(allLatLngs, { padding: [50, 50] });
    }
}
