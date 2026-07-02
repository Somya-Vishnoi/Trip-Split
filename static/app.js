// State Variables
let map = null;
let mapLayers = [];
let currentSearchData = null; // Store last searched candidate venues globally

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
            currentSearchData = searchData; // Save global reference for alternative suggestions
            
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
                        
                        let routeLabels = "";
                        if (plan.multi_city && plan.legs) {
                            routeLabels = plan.legs.map(l => l.from).join(" ➔ ") + " ➔ " + plan.legs[plan.legs.length - 1].to;
                        } else {
                            const destName = plan.hotel && plan.hotel.id !== "virtual_depot" ? plan.hotel.name : "City Center";
                            routeLabels = `${plan.origin_city} ➔ ${destName}`;
                        }

                        travelDetails.innerHTML = `
                            <div style="margin-bottom: 0.25rem;"><strong>Roundtrip Route:</strong> ${routeLabels}</div>
                            <div>Distance: ${plan.distance_km.toFixed(1)} km | Mode: ${modeName}</div>
                            <div style="margin-top: 0.35rem; font-size: 0.85rem; border-top: 1.5px dashed var(--border); padding-top: 0.35rem;">
                                Travel Cost: <strong>₹${formatCost(plan.travel_cost)}</strong> | 
                                Local Stops Budget: <strong>₹${formatCost(plan.local_trip_cost)}</strong>
                            </div>
                        `;
                    }
                } else {
                    if (travelContainer) travelContainer.classList.add("hidden");
                }

                // STEP 3: Render Itinerary Details Card Layout
                const wrapper = document.getElementById("plan-details-wrapper");
                if (wrapper) {
                    wrapper.innerHTML = ""; // Clear for fresh draw

                    if (plan.multi_city) {
                        // RENDER MULTI-STOP TRIP
                        plan.stops.forEach((stop, i) => {
                            const stopSection = document.createElement("div");
                            stopSection.className = "multi-stop-section";
                            stopSection.style.marginTop = "2rem";
                            stopSection.style.borderTop = "2.5px solid var(--border)";
                            stopSection.style.paddingTop = "1.5rem";
                            
                            stopSection.innerHTML = `
                                <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--accent); margin-bottom: 1rem;">
                                    Stop ${i + 1}: ${stop.city.toUpperCase()} (${stop.days} Days) — Est. Cost: ₹${formatCost(stop.local_cost)}
                                </h2>
                                <div class="optimized-layout-grid">
                                    <!-- Left: Accommodation Card -->
                                    <div class="opt-card opt-hotel-card stop-hotel-card-${i}">
                                        <h3>Accommodation</h3>
                                        <div class="stop-hotel-detail-${i} opt-detail"></div>
                                    </div>
                                    
                                    <!-- Right: Food, Nightlife & Zones -->
                                    <div class="opt-card opt-itinerary-card">
                                        <!-- Food & Nightlife Section -->
                                        <div class="plan-sub-section">
                                            <div class="food-nightlife-container">
                                                <div class="food-block">
                                                    <h4>Selected Restaurants</h4>
                                                    <ul class="stop-restaurants-list-${i} opt-list"></ul>
                                                </div>
                                                <div class="nightlife-block stop-bars-container-${i}">
                                                    <h4>Selected Bars & Clubs</h4>
                                                    <ul class="stop-bars-list-${i} opt-list"></ul>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Exploration Zones -->
                                        <div class="plan-sub-section stop-zones-section-${i}" style="margin-top: 1.75rem;">
                                            <h3>Exploration Zones (Clustered by Location)</h3>
                                            <div class="stop-zones-container-${i} zones-timeline"></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            wrapper.appendChild(stopSection);

                            // Populate Accommodation details & alternative stays
                            const hotelCardContainer = stopSection.querySelector(`.stop-hotel-card-${i}`);
                            const hotelDetail = stopSection.querySelector(`.stop-hotel-detail-${i}`);
                            if (stop.hotel && stop.hotel.id !== "virtual_depot") {
                                const starsText = stop.hotel.stars ? ` (${stop.hotel.stars} Star)` : "";
                                const hotelType = stop.hotel.sub_type ? stop.hotel.sub_type.toUpperCase() : "HOTEL";
                                
                                let enrichHtml = "";
                                if (stop.hotel.enrichment) {
                                    enrichHtml = `
                                        <div class="enrich-desc" style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.5rem; line-height: 1.4;">${stop.hotel.enrichment.description}</div>
                                        <div class="enrich-meta" style="font-size: 0.78rem; margin-top: 0.35rem;">
                                            <span style="background: #F3E8FF; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 700; color: #7E22CE;">Vibe: ${stop.hotel.enrichment.vibe}</span>
                                        </div>
                                        <div class="enrich-tip" style="font-size: 0.78rem; color: #4B5563; font-style: italic; margin-top: 0.35rem;">Tip: ${stop.hotel.enrichment.extra_tips}</div>
                                    `;
                                }

                                // Alternative accommodation list to respect user choices
                                let altHtml = "";
                                if (currentSearchData && currentSearchData.sample_venues && currentSearchData.sample_venues.hotels) {
                                    const alts = currentSearchData.sample_venues.hotels.filter(name => name !== stop.hotel.name).slice(0, 3);
                                    if (alts.length > 0) {
                                        altHtml = `
                                            <div class="alt-hotels" style="margin-top: 0.75rem; border-top: 1px dashed var(--border); padding-top: 0.5rem;">
                                                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">Alternative Accommodations:</div>
                                                <ul style="margin: 0; padding-left: 1rem; font-size: 0.75rem; color: #4B5563; line-height: 1.4; list-style-type: disc;">
                                                    ${alts.map(a => `<li>${a}</li>`).join("")}
                                                </ul>
                                            </div>
                                        `;
                                    }
                                }

                                hotelDetail.innerHTML = `
                                    <div class="hotel-details-block">
                                        <div class="hotel-name" style="font-weight: 700;">${stop.hotel.name}</div>
                                        <div class="hotel-meta">${hotelType} ${starsText}</div>
                                        <div class="hotel-cost">Est. Total: ₹${formatCost(stop.hotel.cost)}</div>
                                        ${enrichHtml}
                                        ${altHtml}
                                    </div>
                                `;
                            } else {
                                if (hotelCardContainer) hotelCardContainer.classList.add("hidden");
                            }

                            // Render local food/bars
                            const rList = stopSection.querySelector(`.stop-restaurants-list-${i}`);
                            const bList = stopSection.querySelector(`.stop-bars-list-${i}`);
                            const bCont = stopSection.querySelector(`.stop-bars-container-${i}`);
                            renderFoodAndNightlifeElements(stop.restaurants, stop.bars, rList, bList, bCont);

                            // Render local zones
                            const zList = stopSection.querySelector(`.stop-zones-container-${i}`);
                            const zSect = stopSection.querySelector(`.stop-zones-section-${i}`);
                            renderExplorationZonesElements(stop.zones, zList, zSect);
                        });

                        // Draw stops and intercity route lines on Leaflet Map
                        plotMultiCityOnMap(plan.stops, plan.legs);

                    } else {
                        // RENDER SINGLE CITY (Standard original block layout)
                        wrapper.innerHTML = `
                            <div class="optimized-layout-grid">
                                <!-- Left: Accommodation Card -->
                                <div class="opt-card opt-hotel-card" id="opt-hotel-card-container">
                                    <h3>Accommodation</h3>
                                    <div id="opt-hotel-detail" class="opt-detail"></div>
                                </div>
                                
                                <!-- Right: Food, Nightlife & Zones -->
                                <div class="opt-card opt-itinerary-card">
                                    <div class="plan-sub-section">
                                        <div class="food-nightlife-container">
                                            <div class="food-block">
                                                <h4>Selected Restaurants</h4>
                                                <ul id="opt-restaurants-list" class="opt-list"></ul>
                                            </div>
                                            <div class="nightlife-block" id="opt-bars-container">
                                                <h4>Selected Bars & Clubs</h4>
                                                <ul id="opt-bars-list" class="opt-list"></ul>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="plan-sub-section" id="opt-zones-section" style="margin-top: 1.75rem;">
                                        <h3>Exploration Zones (Clustered by Location)</h3>
                                        <div id="opt-zones-container" class="zones-timeline"></div>
                                    </div>
                                </div>
                            </div>
                        `;

                        const hotelCardContainer = document.getElementById("opt-hotel-card-container");
                        const hotelDetail = document.getElementById("opt-hotel-detail");
                        
                        if (plan.hotel && plan.hotel.id !== "virtual_depot") {
                            const starsText = plan.hotel.stars ? ` (${plan.hotel.stars} Star)` : "";
                            const hotelType = plan.hotel.sub_type ? plan.hotel.sub_type.toUpperCase() : "HOTEL";
                            
                            let enrichHtml = "";
                            if (plan.hotel.enrichment) {
                                enrichHtml = `
                                    <div class="enrich-desc" style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.5rem; line-height: 1.4;">${plan.hotel.enrichment.description}</div>
                                    <div class="enrich-meta" style="font-size: 0.78rem; margin-top: 0.35rem;">
                                        <span style="background: #F3E8FF; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 700; color: #7E22CE;">Vibe: ${plan.hotel.enrichment.vibe}</span>
                                    </div>
                                    <div class="enrich-tip" style="font-size: 0.78rem; color: #4B5563; font-style: italic; margin-top: 0.35rem;">Tip: ${plan.hotel.enrichment.extra_tips}</div>
                                `;
                            }

                            // Suggest alternative stays under accommodation card
                            let altHtml = "";
                            if (currentSearchData && currentSearchData.sample_venues && currentSearchData.sample_venues.hotels) {
                                const alts = currentSearchData.sample_venues.hotels.filter(name => name !== plan.hotel.name).slice(0, 3);
                                if (alts.length > 0) {
                                    altHtml = `
                                        <div class="alt-hotels" style="margin-top: 0.75rem; border-top: 1px dashed var(--border); padding-top: 0.5rem;">
                                            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">Alternative Accommodations:</div>
                                            <ul style="margin: 0; padding-left: 1rem; font-size: 0.75rem; color: #4B5563; line-height: 1.4; list-style-type: disc;">
                                                ${alts.map(a => `<li>${a}</li>`).join("")}
                                            </ul>
                                        </div>
                                    `;
                                }
                            }

                            hotelDetail.innerHTML = `
                                <div class="hotel-details-block">
                                    <div class="hotel-name" style="font-weight: 700;">${plan.hotel.name}</div>
                                    <div class="hotel-meta">${hotelType} ${starsText}</div>
                                    <div class="hotel-cost">Est. Total: ₹${formatCost(plan.hotel.cost)}</div>
                                    ${enrichHtml}
                                    ${altHtml}
                                </div>
                            `;
                        } else {
                            if (hotelCardContainer) hotelCardContainer.classList.add("hidden");
                        }

                        // Render Food and Zones
                        const rList = document.getElementById("opt-restaurants-list");
                        const bList = document.getElementById("opt-bars-list");
                        const bCont = document.getElementById("opt-bars-container");
                        renderFoodAndNightlifeElements(plan.restaurants, plan.bars, rList, bList, bCont);

                        const zList = document.getElementById("opt-zones-container");
                        const zSect = document.getElementById("opt-zones-section");
                        renderExplorationZonesElements(plan.zones, zList, zSect);

                        // Draw Map
                        plotZonesOnMap(plan.zones, plan.hotel, plan.restaurants, plan.bars);
                    }
                }

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

            // Focus tab
            const planTabBtn = document.querySelector('[data-tab="plan-tab"]');
            if (planTabBtn) planTabBtn.click();

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

// Modular food and drinks rendering helper
function renderFoodAndNightlifeElements(restaurants, bars, restList, barsList, barsContainer) {
    if (restList) {
        restList.innerHTML = "";
        if (!restaurants || restaurants.length === 0) {
            restList.innerHTML = "<li style='font-style: italic;'>None selected</li>";
        } else {
            const counts = {};
            restaurants.forEach(r => {
                const name = r.name;
                counts[name] = counts[name] ? { ...r, qty: counts[name].qty + 1 } : { ...r, qty: 1 };
            });
            
            Object.values(counts).forEach(r => {
                const li = document.createElement("li");
                li.style.flexDirection = "column";
                li.style.alignItems = "flex-start";
                li.style.gap = "0.25rem";
                
                const qtyText = r.qty > 1 ? ` <span class="badge-qty" style="color: var(--accent); font-weight: bold; margin-left: 4px;">x${r.qty}</span>` : "";
                
                let enrichHtml = "";
                if (r.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.3;">${r.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; font-style: italic; margin-top: 0.1rem;">
                            Vibe: ${r.enrichment.vibe} | Try: ${r.enrichment.extra_tips}
                        </div>
                    `;
                }
                
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <span class="opt-item-name">${r.name}${qtyText}</span>
                        <span class="opt-item-cost">₹${formatCost(r.cost * r.qty)}</span>
                    </div>
                    ${enrichHtml}
                `;
                restList.appendChild(li);
            });
        }
    }

    if (barsList) {
        barsList.innerHTML = "";
        if (!bars || bars.length === 0) {
            if (barsContainer) barsContainer.classList.add("hidden");
        } else {
            if (barsContainer) barsContainer.classList.remove("hidden");
            bars.forEach(b => {
                const li = document.createElement("li");
                li.style.flexDirection = "column";
                li.style.alignItems = "flex-start";
                li.style.gap = "0.25rem";
                
                let enrichHtml = "";
                if (b.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.3;">${b.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; font-style: italic; margin-top: 0.1rem;">
                            Vibe: ${b.enrichment.vibe} | Recommendation: ${b.enrichment.extra_tips}
                        </div>
                    `;
                }
                
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <span class="opt-item-name">${b.name}</span>
                        <span class="opt-item-cost">${b.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(b.cost)}</span>
                    </div>
                    ${enrichHtml}
                `;
                barsList.appendChild(li);
            });
        }
    }
}

// Modular sightseeing zones rendering helper
function renderExplorationZonesElements(zones, container, zonesSection) {
    if (!container) return;
    container.innerHTML = "";

    if (!zones || zones.length === 0) {
        if (zonesSection) zonesSection.classList.add("hidden");
        return;
    }
    if (zonesSection) zonesSection.classList.remove("hidden");

    zones.forEach(zone => {
        const zoneBlock = document.createElement("div");
        zoneBlock.className = "zone-block";

        const header = document.createElement("div");
        header.className = "zone-header";
        header.innerHTML = `
            <h4>${zone.name}</h4>
            <span class="zone-count-badge">${zone.attractions_count} Attractions</span>
        `;
        zoneBlock.appendChild(header);

        const content = document.createElement("div");
        content.className = "zone-content";

        if (zone.popular_places && zone.popular_places.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group popular";
            group.innerHTML = `
                <h5>Popular Sights</h5>
                <ul class="zone-list">
                    ${zone.popular_places.map(item => {
                        let enrichHtml = "";
                        if (item.enrichment) {
                            enrichHtml = `
                                <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; width: 100%; line-height: 1.3;">${item.enrichment.description}</div>
                                <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; margin-top: 0.15rem;">
                                    Vibe: ${item.enrichment.vibe} | Tips: ${item.enrichment.extra_tips}
                                </div>
                            `;
                        }
                        return `
                            <li class="zone-item" style="flex-direction: column; align-items: flex-start; gap: 0.25rem;">
                                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                                    <span class="zone-item-name">${item.name}</span>
                                    <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                                </div>
                                ${enrichHtml}
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
            content.appendChild(group);
        }

        if (zone.underrated_gems && zone.underrated_gems.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group underrated";
            group.innerHTML = `
                <h5>Underrated Gems</h5>
                <ul class="zone-list">
                    ${zone.underrated_gems.map(item => {
                        let enrichHtml = "";
                        if (item.enrichment) {
                            enrichHtml = `
                                <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; width: 100%; line-height: 1.3;">${item.enrichment.description}</div>
                                <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; margin-top: 0.15rem;">
                                    Vibe: ${item.enrichment.vibe} | Tips: ${item.enrichment.extra_tips}
                                </div>
                            `;
                        }
                        return `
                            <li class="zone-item" style="flex-direction: column; align-items: flex-start; gap: 0.25rem;">
                                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                                    <span class="zone-item-name">${item.name}</span>
                                    <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                                </div>
                                ${enrichHtml}
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
            content.appendChild(group);
        }

        zoneBlock.appendChild(content);
        container.appendChild(zoneBlock);
    });
}

// Draw single-city local zones, hotel, restaurants and bars on map
function plotZonesOnMap(zones, hotel, restaurants, bars) {
    mapLayers.forEach(layer => {
        try { map.removeLayer(layer); } catch (e) {}
    });
    mapLayers = [];

    if (!map) return;

    const allLatLngs = [];

    if (hotel && hotel.id !== "virtual_depot") {
        const hotelMarker = L.marker([hotel.lat, hotel.lon]).addTo(map);
        hotelMarker.bindPopup(`<b>🏨 ${hotel.name}</b><br>Stay Location`);
        mapLayers.push(hotelMarker);
        allLatLngs.push([hotel.lat, hotel.lon]);
    }

    if (restaurants) {
        restaurants.forEach(r => {
            const marker = L.circleMarker([r.lat, r.lon], {
                radius: 7,
                fillColor: "#EA580C",
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

    if (bars) {
        bars.forEach(b => {
            const marker = L.circleMarker([b.lat, b.lon], {
                radius: 7,
                fillColor: "#9333EA",
                color: "#FFFFFF",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.85
            }).addTo(map);
            marker.bindPopup(`<b>🍻 Nightlife: ${b.name}</b>`);
            mapLayers.push(marker);
            allLatLngs.push([b.lat, b.lon]);
        });
    }

    const ZONE_COLORS = ["#2563EB", "#059669", "#DC2626", "#D97706", "#DB2777"];
    if (zones) {
        zones.forEach((zone, zoneIdx) => {
            const color = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
            const zoneCoords = [];

            if (zone.popular_places) {
                zone.popular_places.forEach(item => {
                    const marker = L.circleMarker([item.lat, item.lon], {
                        radius: 8,
                        fillColor: "#DC2626",
                        color: "#FFFFFF",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    }).addTo(map);
                    
                    const costText = item.cost === 0 ? "Free" : `₹${formatCost(item.cost)}`;
                    marker.bindPopup(`<b>🏛️ ${item.name}</b><br>Popular Sight<br>Cost: ${costText}`);
                    mapLayers.push(marker);
                    zoneCoords.push([item.lat, item.lon]);
                    allLatLngs.push([item.lat, item.lon]);
                });
            }

            if (zone.underrated_gems) {
                zone.underrated_gems.forEach(item => {
                    const marker = L.circleMarker([item.lat, item.lon], {
                        radius: 8,
                        fillColor: "#059669",
                        color: "#FFFFFF",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    }).addTo(map);
                    
                    const costText = item.cost === 0 ? "Free" : `₹${formatCost(item.cost)}`;
                    marker.bindPopup(`<b>💎 ${item.name}</b><br>Underrated Gem<br>Cost: ${costText}`);
                    mapLayers.push(marker);
                    zoneCoords.push([item.lat, item.lon]);
                    allLatLngs.push([item.lat, item.lon]);
                });
            }

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

// Draw multi-city stops, local pins, and intercity connecting routes on map
function plotMultiCityOnMap(stops, legs) {
    mapLayers.forEach(layer => {
        try { map.removeLayer(layer); } catch (e) {}
    });
    mapLayers = [];

    if (!map) return;

    const allLatLngs = [];
    const intercityPoints = [];
    const STOP_COLORS = ["#2563EB", "#059669", "#DC2626", "#D97706", "#DB2777"];

    // 1. Loop through stops to draw hotel, restaurant, and sightseeing pins
    stops.forEach((stop, idx) => {
        const stopColor = STOP_COLORS[idx % STOP_COLORS.length];
        
        if (stop.hotel) {
            const hMarker = L.marker([stop.hotel.lat, stop.hotel.lon]).addTo(map);
            const label = stop.hotel.id === "virtual_depot" ? "City Center" : "Accommodation";
            hMarker.bindPopup(`
                <div style="text-align: center;">
                    <b style="color: var(--accent); font-size: 1rem;">${stop.city.toUpperCase()}</b><br>
                    <strong>${stop.hotel.name}</strong><br>
                    <i>${label}</i>
                </div>
            `);
            mapLayers.push(hMarker);
            allLatLngs.push([stop.hotel.lat, stop.hotel.lon]);
            intercityPoints.push([stop.hotel.lat, stop.hotel.lon]);
        }

        if (stop.restaurants) {
            stop.restaurants.forEach(r => {
                const marker = L.circleMarker([r.lat, r.lon], {
                    radius: 6,
                    fillColor: "#EA580C",
                    color: "#FFFFFF",
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
                marker.bindPopup(`<b>🍽️ Restaurant: ${r.name}</b><br>City: ${stop.city}`);
                mapLayers.push(marker);
                allLatLngs.push([r.lat, r.lon]);
            });
        }

        if (stop.bars) {
            stop.bars.forEach(b => {
                const marker = L.circleMarker([b.lat, b.lon], {
                    radius: 6,
                    fillColor: "#9333EA",
                    color: "#FFFFFF",
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
                marker.bindPopup(`<b>🍻 Nightlife: ${b.name}</b><br>City: ${stop.city}`);
                mapLayers.push(marker);
                allLatLngs.push([b.lat, b.lon]);
            });
        }

        if (stop.zones) {
            stop.zones.forEach(zone => {
                const zoneCoords = [];
                
                if (zone.popular_places) {
                    zone.popular_places.forEach(item => {
                        const marker = L.circleMarker([item.lat, item.lon], {
                            radius: 7,
                            fillColor: "#DC2626",
                            color: "#FFFFFF",
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.85
                        }).addTo(map);
                        marker.bindPopup(`<b>🏛️ ${item.name}</b><br>Popular Sight<br>City: ${stop.city}`);
                        mapLayers.push(marker);
                        zoneCoords.push([item.lat, item.lon]);
                        allLatLngs.push([item.lat, item.lon]);
                    });
                }
                
                if (zone.underrated_gems) {
                    zone.underrated_gems.forEach(item => {
                        const marker = L.circleMarker([item.lat, item.lon], {
                            radius: 7,
                            fillColor: "#059669",
                            color: "#FFFFFF",
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.85
                        }).addTo(map);
                        marker.bindPopup(`<b>💎 ${item.name}</b><br>Underrated Gem<br>City: ${stop.city}`);
                        mapLayers.push(marker);
                        zoneCoords.push([item.lat, item.lon]);
                        allLatLngs.push([item.lat, item.lon]);
                    });
                }

                if (zoneCoords.length > 1) {
                    const polyline = L.polyline(zoneCoords, {
                        color: stopColor,
                        weight: 2,
                        opacity: 0.4,
                        dashArray: "4, 4"
                    }).addTo(map);
                    mapLayers.push(polyline);
                }
            });
        }
    });

    // 2. Connect the stops using legs coordinates
    if (legs && legs.length > 0) {
        const legPath = [];
        
        legs.forEach(leg => {
            const fromStop = stops.find(s => s.city.toLowerCase() === leg.from.toLowerCase());
            const toStop = stops.find(s => s.city.toLowerCase() === leg.to.toLowerCase());
            
            let fromPt = fromStop ? [fromStop.hotel.lat, fromStop.hotel.lon] : null;
            let toPt = toStop ? [toStop.hotel.lat, toStop.hotel.lon] : null;
            
            // Fallback coordinate mapping
            if (!fromPt && stops.length > 0) {
                fromPt = [stops[0].hotel.lat, stops[0].hotel.lon];
            }
            if (!toPt && stops.length > 0) {
                toPt = [stops[stops.length - 1].hotel.lat, stops[stops.length - 1].hotel.lon];
            }
            
            if (fromPt) legPath.push(fromPt);
            if (toPt) legPath.push(toPt);
        });

        if (legPath.length > 0) {
            const intercityLine = L.polyline(legPath, {
                color: "#6D28D9",
                weight: 4,
                opacity: 0.8,
                dashArray: "8, 8"
            }).addTo(map);
            mapLayers.push(intercityLine);
        }
    }

    if (allLatLngs.length > 0) {
        map.fitBounds(allLatLngs, { padding: [60, 60] });
    }
}
