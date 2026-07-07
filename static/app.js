// State Variables
let map = null;
let mapLayers = [];
let currentSearchData = null; // Store last searched candidate venues globally
let lastPlanResult = null;    // Store last primary optimized plan result
let activePlanType = "primary"; // "primary" or "backup"

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
    setupActionButtons();
    renderHistoryList();
    renderFavoritesList();
    setupHeaderNavigation();
    setupLedger();
    setupAssistantChat();
    
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

// Setup navigation links actions and modal triggers
function setupHeaderNavigation() {
    const navDiscover = document.getElementById("nav-discover");
    const navTrips = document.getElementById("nav-trips");
    const navEngine = document.getElementById("nav-engine");
    const navLinks = document.querySelectorAll(".nav-links a");

    function setActiveNav(activeBtn) {
        navLinks.forEach(a => a.classList.remove("active"));
        activeBtn.classList.add("active");
    }

    if (navDiscover) {
        navDiscover.addEventListener("click", (e) => {
            e.preventDefault();
            setActiveNav(navDiscover);
            const destinationInput = document.getElementById("destination");
            if (destinationInput) {
                destinationInput.focus();
                destinationInput.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }

    if (navTrips) {
        navTrips.addEventListener("click", (e) => {
            e.preventDefault();
            setActiveNav(navTrips);
            const historyCard = document.getElementById("history-card");
            if (historyCard) {
                historyCard.scrollIntoView({ behavior: "smooth", block: "center" });
                // Visual Flash Animation to highlight the panel
                historyCard.style.transition = "outline 0.3s ease";
                historyCard.style.outline = "3px solid var(--accent)";
                setTimeout(() => {
                    historyCard.style.outline = "none";
                }, 1000);
            }
        });
    }

    // Modal display management
    const aboutModal = document.getElementById("about-modal");
    const closeModalBtn = document.getElementById("close-modal-btn");
    const closeModalBtnBottom = document.getElementById("close-modal-btn-bottom");

    if (navEngine && aboutModal) {
        navEngine.addEventListener("click", (e) => {
            e.preventDefault();
            aboutModal.classList.remove("hidden");
        });
    }

    function hideModal() {
        if (aboutModal) {
            aboutModal.classList.add("hidden");
        }
    }

    if (closeModalBtn) closeModalBtn.addEventListener("click", hideModal);
    if (closeModalBtnBottom) closeModalBtnBottom.addEventListener("click", hideModal);

    // Hide when clicking outside modal-card
    if (aboutModal) {
        aboutModal.addEventListener("click", (e) => {
            if (e.target === aboutModal) {
                hideModal();
            }
        });
    }
}

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

// Action Buttons Event Handlers (Backup switch, PDF print)
function setupActionButtons() {
    const toggleBtn = document.getElementById("toggle-backup-btn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            if (!lastPlanResult) return;
            const backupPlan = lastPlanResult.backup;
            if (!backupPlan) return;

            if (activePlanType === "primary") {
                activePlanType = "backup";
                toggleBtn.textContent = "Switch to Primary Option";
                toggleBtn.style.background = "var(--accent)";
                toggleBtn.style.color = "#ffffff";
                renderPlanItinerary(backupPlan);
            } else {
                activePlanType = "primary";
                toggleBtn.textContent = "Switch to Economy Option";
                toggleBtn.style.background = "var(--bg-card)";
                toggleBtn.style.color = "var(--text)";
                renderPlanItinerary(lastPlanResult);
            }
        });
    }

    const exportBtn = document.getElementById("export-pdf-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            window.print();
        });
    }
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
    const planActions = document.querySelector(".plan-actions-row");

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

        if (planActions) planActions.classList.add("hidden");

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
                lastPlanResult = planResult.plan;
                activePlanType = "primary";

                // Render plan details
                renderPlanItinerary(lastPlanResult);

                // Save to history
                saveTripToHistory(city, lastPlanResult, currentSearchData);

                // Show backup action button if a backup plan exists
                const toggleBtn = document.getElementById("toggle-backup-btn");
                if (toggleBtn) {
                    if (lastPlanResult.backup) {
                        toggleBtn.classList.remove("hidden");
                        toggleBtn.textContent = "Switch to Economy Option";
                        toggleBtn.style.background = "var(--bg-card)";
                        toggleBtn.style.color = "var(--text)";
                    } else {
                        toggleBtn.classList.add("hidden");
                    }
                }

                // Show action bar
                if (planActions) planActions.classList.remove("hidden");

                // Populate Backup Plan Section footer
                const backupSection = document.getElementById("backup-plan-section");
                if (backupSection) {
                    if (lastPlanResult.backup) {
                        const backupCostBadge = document.getElementById("backup-cost-badge");
                        if (backupCostBadge) backupCostBadge.textContent = `₹${formatCost(lastPlanResult.backup.total_cost)}`;
                        const backupHotelName = document.getElementById("backup-hotel-name");
                        if (backupHotelName) {
                            backupHotelName.textContent = lastPlanResult.backup.stops && lastPlanResult.backup.stops[0].hotel && lastPlanResult.backup.stops[0].hotel.id !== "virtual_depot" 
                                ? lastPlanResult.backup.stops[0].hotel.name 
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

// Populate search candidate lists with TripAdvisor interactive Heart icons
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

    const category = elementId.includes("hotel") ? "hotel" : elementId.includes("rest") ? "restaurant" : "attraction";
    const categoryIcon = category === "hotel" ? "🏨" : category === "restaurant" ? "🍔" : "🏛️";

    items.forEach(name => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.gap = "0.5rem";

        const textSpan = document.createElement("span");
        textSpan.textContent = name;
        textSpan.title = name;
        textSpan.style.whiteSpace = "nowrap";
        textSpan.style.overflow = "hidden";
        textSpan.style.textOverflow = "ellipsis";
        textSpan.style.flex = "1";

        // Heart Icon Button
        const heartBtn = document.createElement("button");
        heartBtn.className = "heart-btn";
        heartBtn.style.background = "none";
        heartBtn.style.border = "none";
        heartBtn.style.cursor = "pointer";
        heartBtn.style.fontSize = "1rem";
        heartBtn.style.padding = "0.2rem";
        
        const isHearted = isVenueFavorite(name);
        heartBtn.innerHTML = isHearted ? "❤️" : "🤍";
        
        heartBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavoriteVenue(name, category, categoryIcon);
            heartBtn.innerHTML = isVenueFavorite(name) ? "❤️" : "🤍";
        });

        li.appendChild(textSpan);
        li.appendChild(heartBtn);
        list.appendChild(li);
    });
}

// Modular rendering function for a plan (primary or backup)
function renderPlanItinerary(plan) {
    if (!plan) return;

    // Populate Plan Summary
    const totalCostEl = document.getElementById("plan-total-cost");
    if (totalCostEl) totalCostEl.textContent = `₹${formatCost(plan.total_cost)}`;
    const personCostEl = document.getElementById("plan-person-cost");
    if (personCostEl) personCostEl.textContent = `₹${formatCost(plan.cost_per_person)}`;
    
    const statusBadge = document.getElementById("plan-status");
    if (statusBadge) {
        statusBadge.textContent = activePlanType === "backup" ? "Economy Backup Plan" : "Optimal Plan (Within Budget)";
        statusBadge.className = activePlanType === "backup" ? "plan-status-badge backup" : "plan-status-badge";
        if (activePlanType === "backup") {
            statusBadge.style.background = "#FEF3C7";
            statusBadge.style.color = "#D97706";
        } else {
            statusBadge.style.background = "var(--success-light)";
            statusBadge.style.color = "var(--success)";
        }
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

            const carbonFactor = plan.travel_mode === "flight" ? 0.15 : 
                                 plan.travel_mode === "bus" ? 0.05 : 0.025;
            const carbonValue = plan.distance_km * plan.people * carbonFactor;

            travelDetails.innerHTML = `
                <div style="margin-bottom: 0.25rem;"><strong>Roundtrip Route:</strong> ${routeLabels}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>Distance: ${plan.distance_km.toFixed(1)} km | Mode: ${modeName}</div>
                    <span class="carbon-badge">🌱 Carbon: ${carbonValue.toFixed(1)} kg CO₂</span>
                </div>
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
                        
                        <!-- Middle: Food & Nightlife Card -->
                        <div class="opt-card opt-food-card">
                            <h3>Food & Nightlife</h3>
                            <div class="plan-sub-section">
                                <div class="food-block">
                                    <h4>Selected Restaurants</h4>
                                    <ul class="stop-restaurants-list-${i} opt-list"></ul>
                                </div>
                                <div class="nightlife-block stop-bars-container-${i}" style="margin-top: 1rem;">
                                    <h4>Selected Bars & Clubs</h4>
                                    <ul class="stop-bars-list-${i} opt-list"></ul>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right: Sightseeing & Exploration Card -->
                        <div class="opt-card opt-itinerary-card">
                            <h3>Sightseeing & Exploration</h3>
                            <div class="plan-sub-section stop-zones-section-${i}">
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
                    const starsHtml = stop.hotel.stars ? getBubbleRatingHtml(stop.hotel.stars) : "";
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

                    const isHearted = isVenueFavorite(stop.hotel.name);
                    const heartIcon = isHearted ? "❤️" : "🤍";

                    hotelDetail.innerHTML = `
                        <div class="hotel-details-block">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.25rem;">
                                <div class="hotel-name" style="font-weight: 700;">${stop.hotel.name}</div>
                                <button onclick="toggleFavoriteVenue('${stop.hotel.name.replace(/'/g, "\\'")}', 'hotel', '🏨', ${stop.hotel.lat}, ${stop.hotel.lon})" style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:0.2rem;">${heartIcon}</button>
                            </div>
                            <div class="hotel-meta" style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">${hotelType} ${starsHtml}</div>
                            <div class="hotel-cost">Est. Total: ₹${formatCost(stop.hotel.cost)}</div>
                            ${enrichHtml}
                            ${altHtml}
                            ${getVotingTagsHtml(stop.hotel.name)}
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
            const stop = plan.stops[0];
            wrapper.innerHTML = `
                <div class="optimized-layout-grid">
                    <!-- Left: Accommodation Card -->
                    <div class="opt-card opt-hotel-card" id="opt-hotel-card-container">
                        <h3>Accommodation</h3>
                        <div id="opt-hotel-detail" class="opt-detail"></div>
                    </div>
                    
                    <!-- Middle: Food & Nightlife Card -->
                    <div class="opt-card opt-food-card">
                        <h3>Food & Nightlife</h3>
                        <div class="plan-sub-section">
                            <div class="food-block">
                                <h4>Selected Restaurants</h4>
                                <ul id="opt-restaurants-list" class="opt-list"></ul>
                            </div>
                            <div class="nightlife-block" id="opt-bars-container" style="margin-top: 1rem;">
                                <h4>Selected Bars & Clubs</h4>
                                <ul id="opt-bars-list" class="opt-list"></ul>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right: Sightseeing & Exploration Card -->
                    <div class="opt-card opt-itinerary-card">
                        <h3>Sightseeing & Exploration</h3>
                        <div class="plan-sub-section" id="opt-zones-section">
                            <div id="opt-zones-container" class="zones-timeline"></div>
                        </div>
                    </div>
                </div>
            `;

            const hotelCardContainer = document.getElementById("opt-hotel-card-container");
            const hotelDetail = document.getElementById("opt-hotel-detail");
            
            if (stop.hotel && stop.hotel.id !== "virtual_depot") {
                const starsHtml = stop.hotel.stars ? getBubbleRatingHtml(stop.hotel.stars) : "";
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

                // Suggest alternative stays under accommodation card
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

                const isHearted = isVenueFavorite(stop.hotel.name);
                const heartIcon = isHearted ? "❤️" : "🤍";

                hotelDetail.innerHTML = `
                    <div class="hotel-details-block">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.25rem;">
                            <div class="hotel-name" style="font-weight: 700;">${stop.hotel.name}</div>
                            <button onclick="toggleFavoriteVenue('${stop.hotel.name.replace(/'/g, "\\'")}', 'hotel', '🏨', ${stop.hotel.lat}, ${stop.hotel.lon})" style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:0.2rem;">${heartIcon}</button>
                        </div>
                        <div class="hotel-meta" style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">${hotelType} ${starsHtml}</div>
                        <div class="hotel-cost">Est. Total: ₹${formatCost(stop.hotel.cost)}</div>
                        ${enrichHtml}
                        ${altHtml}
                        ${getVotingTagsHtml(stop.hotel.name)}
                    </div>
                `;
            } else {
                if (hotelCardContainer) hotelCardContainer.classList.add("hidden");
            }

            // Render Food and Zones
            const rList = document.getElementById("opt-restaurants-list");
            const bList = document.getElementById("opt-bars-list");
            const bCont = document.getElementById("opt-bars-container");
            renderFoodAndNightlifeElements(stop.restaurants, stop.bars, rList, bList, bCont);

            const zList = document.getElementById("opt-zones-container");
            const zSect = document.getElementById("opt-zones-section");
            renderExplorationZonesElements(stop.zones, zList, zSect);

            // Draw Map
            plotZonesOnMap(stop.zones, stop.hotel, stop.restaurants, stop.bars);
        }
    }
}

// Modular food and drinks rendering helper with TripAdvisor Heart Favorites icon
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

                const isHearted = isVenueFavorite(r.name);
                const heartIcon = isHearted ? "❤️" : "🤍";
                
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div style="display:flex; align-items:center; gap:0.25rem; overflow:hidden; flex:1;">
                            <span class="opt-item-name" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${r.name}${qtyText}</span>
                            <button onclick="toggleFavoriteVenue('${r.name.replace(/'/g, "\\'")}', 'restaurant', '🍔', ${r.lat}, ${r.lon})" style="background:none; border:none; cursor:pointer; font-size:0.85rem; padding:0.1rem;">${heartIcon}</button>
                        </div>
                        <span class="opt-item-cost">₹${formatCost(r.cost * r.qty)}</span>
                    </div>
                    ${enrichHtml}
                    ${getVotingTagsHtml(r.name)}
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

                const isHearted = isVenueFavorite(b.name);
                const heartIcon = isHearted ? "❤️" : "🤍";
                
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div style="display:flex; align-items:center; gap:0.25rem; overflow:hidden; flex:1;">
                            <span class="opt-item-name" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${b.name}</span>
                            <button onclick="toggleFavoriteVenue('${b.name.replace(/'/g, "\\'")}', 'bar', '🍻', ${b.lat}, ${b.lon})" style="background:none; border:none; cursor:pointer; font-size:0.85rem; padding:0.1rem;">${heartIcon}</button>
                        </div>
                        <span class="opt-item-cost">${b.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(b.cost)}</span>
                    </div>
                    ${enrichHtml}
                    ${getVotingTagsHtml(b.name)}
                `;
                barsList.appendChild(li);
            });
        }
    }
}

// Modular sightseeing zones rendering helper with TripAdvisor Heart Favorites icon
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
            
            const list = document.createElement("ul");
            list.className = "zone-list";
            
            zone.popular_places.forEach(item => {
                const li = document.createElement("li");
                li.className = "zone-item";
                li.style.flexDirection = "column";
                li.style.alignItems = "flex-start";
                li.style.gap = "0.25rem";
                
                let enrichHtml = "";
                if (item.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; width: 100%; line-height: 1.3;">${item.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; margin-top: 0.15rem;">
                            Vibe: ${item.enrichment.vibe} | Tips: ${item.enrichment.extra_tips}
                        </div>
                    `;
                }

                const isHearted = isVenueFavorite(item.name);
                const heartIcon = isHearted ? "❤️" : "🤍";

                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div style="display:flex; align-items:center; gap:0.25rem; overflow:hidden; flex:1;">
                            <span class="zone-item-name" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</span>
                            <button onclick="toggleFavoriteVenue('${item.name.replace(/'/g, "\\'")}', 'attraction', '🏛️', ${item.lat}, ${item.lon})" style="background:none; border:none; cursor:pointer; font-size:0.85rem; padding:0.1rem;">${heartIcon}</button>
                        </div>
                        <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                    </div>
                    ${enrichHtml}
                    ${getVotingTagsHtml(item.name)}
                `;
                list.appendChild(li);
            });

            group.innerHTML = "<h5>Popular Sights</h5>";
            group.appendChild(list);
            content.appendChild(group);
        }

        if (zone.underrated_gems && zone.underrated_gems.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group underrated";
            
            const list = document.createElement("ul");
            list.className = "zone-list";
            
            zone.underrated_gems.forEach(item => {
                const li = document.createElement("li");
                li.className = "zone-item";
                li.style.flexDirection = "column";
                li.style.alignItems = "flex-start";
                li.style.gap = "0.25rem";
                
                let enrichHtml = "";
                if (item.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; width: 100%; line-height: 1.3;">${item.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.75rem; color: #4B5563; margin-top: 0.15rem;">
                            Vibe: ${item.enrichment.vibe} | Tips: ${item.enrichment.extra_tips}
                        </div>
                    `;
                }

                const isHearted = isVenueFavorite(item.name);
                const heartIcon = isHearted ? "❤️" : "🤍";

                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div style="display:flex; align-items:center; gap:0.25rem; overflow:hidden; flex:1;">
                            <span class="zone-item-name" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</span>
                            <button onclick="toggleFavoriteVenue('${item.name.replace(/'/g, "\\'")}', 'attraction', '🏛️', ${item.lat}, ${item.lon})" style="background:none; border:none; cursor:pointer; font-size:0.85rem; padding:0.1rem;">${heartIcon}</button>
                        </div>
                        <span class="zone-item-cost">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                    </div>
                    ${enrichHtml}
                    ${getVotingTagsHtml(item.name)}
                `;
                list.appendChild(li);
            });

            group.innerHTML = "<h5>Underrated Gems</h5>";
            group.appendChild(list);
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

// LocalStorage History Helpers
function saveTripToHistory(city, plan, searchData) {
    try {
        let history = JSON.parse(localStorage.getItem("tripsplit_history")) || [];
        // Prevent duplicate entries
        history = history.filter(item => item.city.toLowerCase() !== city.toLowerCase());
        
        // Add new entry to the front
        history.unshift({
            city: city,
            plan: plan,
            searchData: searchData,
            timestamp: new Date().toLocaleString()
        });
        
        // Cap history at 5 items
        if (history.length > 5) history.pop();
        
        localStorage.setItem("tripsplit_history", JSON.stringify(history));
        renderHistoryList();
    } catch (e) {
        console.error("Failed to save trip to history:", e);
    }
}

function renderHistoryList() {
    const list = document.getElementById("history-list");
    const placeholder = document.getElementById("history-list-placeholder");
    if (!list) return;
    list.innerHTML = "";

    try {
        const history = JSON.parse(localStorage.getItem("tripsplit_history")) || [];
        if (history.length === 0) {
            if (placeholder) placeholder.classList.remove("hidden");
            list.classList.add("hidden");
            return;
        }

        if (placeholder) placeholder.classList.add("hidden");
        list.classList.remove("hidden");

        history.forEach((item, index) => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "0.5rem";
            li.style.border = "1px solid var(--border)";
            li.style.borderRadius = "6px";
            li.style.background = "var(--surface-light)";
            li.style.fontSize = "0.82rem";

            const info = document.createElement("div");
            info.style.display = "flex";
            info.style.flexDirection = "column";
            info.style.gap = "0.15rem";
            
            const title = document.createElement("strong");
            title.textContent = item.city.toUpperCase();
            title.style.color = "var(--accent)";
            
            const subtitle = document.createElement("span");
            subtitle.textContent = `Cost: ₹${formatCost(item.plan.total_cost)}`;
            subtitle.style.fontSize = "0.75rem";
            subtitle.style.color = "var(--text-secondary)";

            info.appendChild(title);
            info.appendChild(subtitle);

            const actions = document.createElement("div");
            actions.style.display = "flex";
            actions.style.gap = "0.35rem";

            const loadBtn = document.createElement("button");
            loadBtn.textContent = "Load";
            loadBtn.style.padding = "0.2rem 0.4rem";
            loadBtn.style.fontSize = "0.75rem";
            loadBtn.style.borderRadius = "4px";
            loadBtn.style.cursor = "pointer";
            loadBtn.style.background = "var(--accent)";
            loadBtn.style.color = "#fff";
            loadBtn.style.border = "none";
            loadBtn.addEventListener("click", () => {
                loadHistoryItem(item);
            });

            const delBtn = document.createElement("button");
            delBtn.innerHTML = "🗑️";
            delBtn.style.padding = "0.2rem 0.3rem";
            delBtn.style.fontSize = "0.75rem";
            delBtn.style.borderRadius = "4px";
            delBtn.style.cursor = "pointer";
            delBtn.style.background = "transparent";
            delBtn.style.border = "1px solid var(--border)";
            delBtn.addEventListener("click", () => {
                deleteHistoryItem(index);
            });

            actions.appendChild(loadBtn);
            actions.appendChild(delBtn);

            li.appendChild(info);
            li.appendChild(actions);
            list.appendChild(li);
        });
    } catch (e) {
        console.error("Failed to render history list:", e);
    }
}

function loadHistoryItem(item) {
    try {
        lastPlanResult = item.plan;
        activePlanType = "primary";
        currentSearchData = item.searchData;

        // Restore form input values
        document.getElementById("destination").value = item.city;
        
        // Show and populate candidate lists
        const venuesTab = document.getElementById("venues-tab");
        const venuesData = document.getElementById("venues-data");
        const placeholder = venuesTab ? venuesTab.querySelector(".summary-placeholder") : null;
        if (placeholder) placeholder.classList.add("hidden");
        if (venuesData) venuesData.classList.remove("hidden");

        const hotelCountEl = document.getElementById("hotel-count");
        if (hotelCountEl) hotelCountEl.textContent = currentSearchData.venue_counts.hotels;
        const restCountEl = document.getElementById("rest-count");
        if (restCountEl) restCountEl.textContent = currentSearchData.venue_counts.restaurants;
        const attrCountEl = document.getElementById("attr-count");
        if (attrCountEl) attrCountEl.textContent = currentSearchData.venue_counts.attractions;

        populateList("sample-hotels", currentSearchData.sample_venues.hotels, "No hotels found");
        populateList("sample-restaurants", currentSearchData.sample_venues.restaurants, "No restaurants found");
        populateList("sample-attractions", currentSearchData.sample_venues.attractions, "No attractions found");

        // Initialize Map
        initializeLeafletMap(currentSearchData.geocoding.lat, currentSearchData.geocoding.lon, currentSearchData.geocoding.bbox);

        // Render plan details
        renderPlanItinerary(lastPlanResult);

        // Update toggle buttons and container states
        const toggleBtn = document.getElementById("toggle-backup-btn");
        if (toggleBtn) {
            if (lastPlanResult.backup) {
                toggleBtn.classList.remove("hidden");
                toggleBtn.textContent = "Switch to Economy Option";
                toggleBtn.style.background = "var(--bg-card)";
                toggleBtn.style.color = "var(--text)";
            } else {
                toggleBtn.classList.add("hidden");
            }
        }

        const planActions = document.querySelector(".plan-actions-row");
        if (planActions) planActions.classList.remove("hidden");

        const planTab = document.getElementById("plan-tab");
        const planData = document.getElementById("plan-data");
        const planPlaceholder = planTab ? planTab.querySelector(".plan-placeholder") : null;
        if (planPlaceholder) planPlaceholder.classList.add("hidden");
        if (planData) planData.classList.remove("hidden");

        // Focus Tab
        const planTabBtn = document.querySelector('[data-tab="plan-tab"]');
        if (planTabBtn) planTabBtn.click();
        
        alert(`Loaded saved itinerary for "${item.city.toUpperCase()}"!`);
    } catch (e) {
        alert("Failed to load history item.");
        console.error(e);
    }
}

function deleteHistoryItem(index) {
    try {
        let history = JSON.parse(localStorage.getItem("tripsplit_history")) || [];
        history.splice(index, 1);
        localStorage.setItem("tripsplit_history", JSON.stringify(history));
        renderHistoryList();
    } catch (e) {
        console.error("Failed to delete history item:", e);
    }
}

// TripAdvisor Bubble Ratings Helper (Styled in Purple)
function getBubbleRatingHtml(stars) {
    if (!stars) return "";
    const count = Math.min(5, Math.max(1, Math.round(stars)));
    let bubbles = "";
    for (let i = 0; i < 5; i++) {
        if (i < count) {
            bubbles += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#7C3AED; margin-right:3px; border:1px solid #7C3AED;"></span>`;
        } else {
            bubbles += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#E0E0E0; margin-right:3px; border:1px solid #CCCCCC;"></span>`;
        }
    }
    return `<div class="tripadvisor-bubbles" style="display:inline-flex; align-items:center; margin-left:6px;" title="${count} bubbles">${bubbles}</div>`;
}

// TripAdvisor Hero Quick Filters Toggle Helper
window.toggleHeroFilter = function(type) {
    let checkboxId = "";
    let btnId = "";
    if (type === 'stay') {
        checkboxId = "filter-stay";
        btnId = "hero-btn-hotels";
    } else if (type === 'transport') {
        checkboxId = "filter-transport";
        btnId = "hero-btn-transport";
    } else if (type === 'attractions') {
        checkboxId = "filter-attractions";
        btnId = "hero-btn-sightseeing";
    }

    const checkbox = document.getElementById(checkboxId);
    const btn = document.getElementById(btnId);
    if (checkbox && btn) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    }
};

// Favorites / TripAdvisor Trip Board Helpers
function isVenueFavorite(name) {
    try {
        const favorites = JSON.parse(localStorage.getItem("tripsplit_favorites")) || [];
        return favorites.some(f => f.name.toLowerCase() === name.toLowerCase());
    } catch (e) {
        return false;
    }
}

function toggleFavoriteVenue(name, category, icon, lat = null, lon = null) {
    try {
        let favorites = JSON.parse(localStorage.getItem("tripsplit_favorites")) || [];
        const index = favorites.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
        
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            let finalLat = lat;
            let finalLon = lon;
            if (!finalLat) {
                // Try to find in lastPlanResult stops
                if (lastPlanResult && lastPlanResult.stops) {
                    for (const stop of lastPlanResult.stops) {
                        if (stop.hotel && stop.hotel.name.toLowerCase() === name.toLowerCase()) {
                            finalLat = stop.hotel.lat;
                            finalLon = stop.hotel.lon;
                            break;
                        }
                        const rMatch = stop.restaurants.find(r => r.name.toLowerCase() === name.toLowerCase());
                        if (rMatch) {
                            finalLat = rMatch.lat;
                            finalLon = rMatch.lon;
                            break;
                        }
                        const bMatch = stop.bars.find(b => b.name.toLowerCase() === name.toLowerCase());
                        if (bMatch) {
                            finalLat = bMatch.lat;
                            finalLon = bMatch.lon;
                            break;
                        }
                        if (stop.zones) {
                            for (const zone of stop.zones) {
                                const pMatch = zone.popular_places ? zone.popular_places.find(p => p.name.toLowerCase() === name.toLowerCase()) : null;
                                if (pMatch) {
                                    finalLat = pMatch.lat;
                                    finalLon = pMatch.lon;
                                    break;
                                }
                                const uMatch = zone.underrated_gems ? zone.underrated_gems.find(u => u.name.toLowerCase() === name.toLowerCase()) : null;
                                if (uMatch) {
                                    finalLat = uMatch.lat;
                                    finalLon = uMatch.lon;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            if (!finalLat && currentSearchData && currentSearchData.geocoding) {
                finalLat = currentSearchData.geocoding.lat;
                finalLon = currentSearchData.geocoding.lon;
            }
            favorites.push({
                name: name,
                category: category,
                icon: icon,
                lat: finalLat,
                lon: finalLon,
                timestamp: new Date().toLocaleString()
            });
        }
        localStorage.setItem("tripsplit_favorites", JSON.stringify(favorites));
        renderFavoritesList();
        
        // Refresh visible elements
        if (currentSearchData) {
            populateList("sample-hotels", currentSearchData.sample_venues.hotels, "No hotels found");
            populateList("sample-restaurants", currentSearchData.sample_venues.restaurants, "No restaurants found");
            populateList("sample-attractions", currentSearchData.sample_venues.attractions, "No attractions found");
        }
        if (lastPlanResult) {
            renderPlanItinerary(lastPlanResult);
        }
    } catch (e) {
        console.error("Failed to toggle favorite:", e);
    }
}

function renderFavoritesList() {
    const list = document.getElementById("favorites-list");
    const placeholder = document.getElementById("favorites-placeholder");
    if (!list) return;
    list.innerHTML = "";

    try {
        const favorites = JSON.parse(localStorage.getItem("tripsplit_favorites")) || [];
        if (favorites.length === 0) {
            if (placeholder) placeholder.classList.remove("hidden");
            list.classList.add("hidden");
            return;
        }

        if (placeholder) placeholder.classList.add("hidden");
        list.classList.remove("hidden");

        favorites.forEach((item, index) => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.flexDirection = "column";
            li.style.alignItems = "stretch";
            li.style.padding = "0.5rem";
            li.style.border = "1px solid var(--border)";
            li.style.borderRadius = "6px";
            li.style.background = "var(--surface-light)";
            li.style.fontSize = "0.82rem";
            li.style.gap = "0.25rem";

            // Row 1: Icon, Name and Action Buttons
            const topRow = document.createElement("div");
            topRow.style.display = "flex";
            topRow.style.justifyContent = "space-between";
            topRow.style.alignItems = "center";
            topRow.style.width = "100%";

            const info = document.createElement("div");
            info.style.display = "flex";
            info.style.alignItems = "center";
            info.style.gap = "0.4rem";
            info.style.overflow = "hidden";
            info.style.flex = "1";
            
            const iconSpan = document.createElement("span");
            iconSpan.textContent = item.icon;
            
            const nameSpan = document.createElement("span");
            nameSpan.textContent = item.name;
            nameSpan.style.fontWeight = "600";
            nameSpan.style.whiteSpace = "nowrap";
            nameSpan.style.overflow = "hidden";
            nameSpan.style.textOverflow = "ellipsis";

            info.appendChild(iconSpan);
            info.appendChild(nameSpan);

            const actions = document.createElement("div");
            actions.style.display = "flex";
            actions.style.gap = "0.3rem";

            if (item.lat && item.lon) {
                const pinBtn = document.createElement("button");
                pinBtn.innerHTML = "📍";
                pinBtn.title = "Locate on Map";
                pinBtn.style.background = "none";
                pinBtn.style.border = "none";
                pinBtn.style.cursor = "pointer";
                pinBtn.style.fontSize = "0.95rem";
                pinBtn.addEventListener("click", () => {
                    if (map) {
                        const mapTabBtn = document.querySelector('[data-tab="map-tab"]');
                        if (mapTabBtn) mapTabBtn.click();
                        map.setView([item.lat, item.lon], 15);
                        mapLayers.forEach(layer => {
                            if (layer.getLatLng && layer.getLatLng().lat === item.lat && layer.getLatLng().lng === item.lon) {
                                layer.openPopup();
                            }
                        });
                    }
                });
                actions.appendChild(pinBtn);
            }

            const delBtn = document.createElement("button");
            delBtn.innerHTML = "🗑";
            delBtn.title = "Remove";
            delBtn.style.background = "none";
            delBtn.style.border = "none";
            delBtn.style.cursor = "pointer";
            delBtn.style.fontSize = "0.95rem";
            delBtn.addEventListener("click", () => {
                toggleFavoriteVenue(item.name, item.category, item.icon);
            });
            actions.appendChild(delBtn);

            topRow.appendChild(info);
            topRow.appendChild(actions);

            li.appendChild(topRow);

            // Row 2: Voting Tags
            const voteDiv = document.createElement("div");
            voteDiv.innerHTML = getVotingTagsHtml(item.name);
            li.appendChild(voteDiv);

            list.appendChild(li);
        });
    } catch (e) {
        console.error("Failed to render favorites list:", e);
    }
}

// Prefill City Helper for Trending Destinations cards
window.preFillCity = function(cityName) {
    const destInput = document.getElementById("destination");
    if (destInput) {
        destInput.value = cityName;
        destInput.scrollIntoView({ behavior: "smooth", block: "center" });
        destInput.focus();
        
        const form = document.getElementById("search-form");
        if (form) {
            const submitBtn = document.getElementById("search-btn");
            if (submitBtn) {
                submitBtn.click();
            }
        }
    }
};

// --- TRIP GROUP EXPENSE LEDGER SYSTEM ---
function setupLedger() {
    const membersInput = document.getElementById("group-members-input");
    const ledgerForm = document.getElementById("ledger-form");
    const clearBtn = document.getElementById("clear-ledger-btn");

    if (!membersInput) return;

    // Listen to changes in group members list
    membersInput.addEventListener("input", updateLedgerInputs);
    updateLedgerInputs(); // Initial setup of dropdowns

    if (ledgerForm) {
        ledgerForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const desc = document.getElementById("exp-desc").value.trim();
            const amount = parseFloat(document.getElementById("exp-amount").value);
            const paidBy = document.getElementById("exp-paid-by").value;
            
            // Get split candidates
            const checkedBoxes = document.querySelectorAll("#exp-split-checkboxes input:checked");
            const splitBetween = Array.from(checkedBoxes).map(cb => cb.value);

            if (!desc || isNaN(amount) || amount <= 0 || !paidBy || splitBetween.length === 0) {
                alert("Please fill all expense fields and select at least one person to split between!");
                return;
            }

            const expenses = JSON.parse(localStorage.getItem("tripsplit_ledger")) || [];
            expenses.push({
                desc,
                amount,
                paidBy,
                splitBetween,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            localStorage.setItem("tripsplit_ledger", JSON.stringify(expenses));
            
            // Clear input fields
            document.getElementById("exp-desc").value = "";
            document.getElementById("exp-amount").value = "";
            
            renderLedger();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all ledger expenses?")) {
                localStorage.removeItem("tripsplit_ledger");
                renderLedger();
            }
        });
    }

    renderLedger();
}

function updateLedgerInputs() {
    const input = document.getElementById("group-members-input");
    const select = document.getElementById("exp-paid-by");
    const checkboxesDiv = document.getElementById("exp-split-checkboxes");
    
    if (!input || !select || !checkboxesDiv) return;

    const members = input.value.split(",").map(m => m.trim()).filter(m => m.length > 0);
    
    // Save selected values to restore them
    const prevPaidBy = select.value;
    
    // Clear
    select.innerHTML = "";
    checkboxesDiv.innerHTML = "";

    members.forEach(member => {
        // Dropdown Option
        const opt = document.createElement("option");
        opt.value = member;
        opt.textContent = member;
        select.appendChild(opt);

        // Checkbox Split Item
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "0.35rem";
        label.style.fontSize = "0.8rem";
        label.style.cursor = "pointer";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = member;
        cb.checked = true; // default splits equally
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(member));
        checkboxesDiv.appendChild(label);
    });

    if (prevPaidBy && members.includes(prevPaidBy)) {
        select.value = prevPaidBy;
    }
}

function renderLedger() {
    const list = document.getElementById("ledger-history-list");
    const placeholder = document.getElementById("ledger-history-placeholder");
    const balanceList = document.getElementById("ledger-balances-list");
    const balancePlaceholder = document.getElementById("ledger-balances-placeholder");
    const input = document.getElementById("group-members-input");

    if (!list || !balanceList || !input) return;

    list.innerHTML = "";
    balanceList.innerHTML = "";

    const members = input.value.split(",").map(m => m.trim()).filter(m => m.length > 0);
    const expenses = JSON.parse(localStorage.getItem("tripsplit_ledger")) || [];

    if (expenses.length === 0) {
        if (placeholder) placeholder.classList.remove("hidden");
        if (balancePlaceholder) balancePlaceholder.classList.remove("hidden");
        return;
    }

    if (placeholder) placeholder.classList.add("hidden");
    if (balancePlaceholder) balancePlaceholder.classList.add("hidden");

    // 1. Render expense history
    expenses.forEach((e, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.padding = "0.35rem 0";
        li.style.borderBottom = "1px dashed var(--border)";

        li.innerHTML = `
            <div>
                <strong>${e.desc}</strong> <span style="font-size:0.75rem; color:var(--text-secondary);">(${e.timestamp})</span><br>
                <span style="font-size:0.72rem; color:var(--text-secondary);">Paid by <b>${e.paidBy}</b> split amongst: ${e.splitBetween.join(", ")}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.35rem;">
                <span style="font-weight:700; color:var(--accent);">₹${e.amount}</span>
                <button onclick="deleteLedgerItem(${idx})" style="background:none; border:none; cursor:pointer; font-size:0.8rem;">❌</button>
            </div>
        `;
        list.appendChild(li);
    });

    // 2. Settle Up Calculator (Splitwise debt clearing greedy algorithm)
    const balances = {};
    members.forEach(m => { balances[m] = 0.0; });

    expenses.forEach(e => {
        // Payer gets credited full amount
        if (balances[e.paidBy] !== undefined) {
            balances[e.paidBy] += e.amount;
        }
        
        // Split amount per split candidate
        const share = e.amount / e.splitBetween.length;
        e.splitBetween.forEach(recipient => {
            if (balances[recipient] !== undefined) {
                balances[recipient] -= share;
            }
        });
    });

    // Solve debt clearing transactions
    const debtors = [];
    const creditors = [];

    Object.keys(balances).forEach(person => {
        const bal = balances[person];
        if (bal < -0.01) {
            debtors.push({ name: person, amount: -bal });
        } else if (bal > 0.01) {
            creditors.push({ name: person, amount: bal });
        }
    });

    // Greedy matching
    let transactionsCount = 0;
    while (debtors.length > 0 && creditors.length > 0) {
        // Sort descending to settle largest first
        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const debtor = debtors[0];
        const creditor = creditors[0];
        const settleAmount = Math.min(debtor.amount, creditor.amount);

        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.gap = "0.25rem";
        li.style.background = "#fff";
        li.style.padding = "0.35rem 0.5rem";
        li.style.borderRadius = "4px";
        li.style.border = "1px solid #E9D5FF";
        li.style.marginBottom = "0.25rem";
        li.innerHTML = `💸 <span style="color:#6D28D9;">${debtor.name}</span> owes <span style="color:#059669;">${creditor.name}</span> <strong>₹${settleAmount.toFixed(1)}</strong>`;
        balanceList.appendChild(li);
        transactionsCount++;

        debtor.amount -= settleAmount;
        creditor.amount -= settleAmount;

        if (debtor.amount < 0.01) debtors.shift();
        if (creditor.amount < 0.01) creditors.shift();
    }

    if (transactionsCount === 0) {
        if (balancePlaceholder) balancePlaceholder.classList.remove("hidden");
    }
}

window.deleteLedgerItem = function(index) {
    const expenses = JSON.parse(localStorage.getItem("tripsplit_ledger")) || [];
    expenses.splice(index, 1);
    localStorage.setItem("tripsplit_ledger", JSON.stringify(expenses));
    renderLedger();
};

// --- DYNAMIC GROUP VOTING SYSTEM ---
window.toggleMemberVote = function(venueName, memberName) {
    try {
        let votes = JSON.parse(localStorage.getItem("tripsplit_votes")) || {};
        if (!votes[venueName]) {
            votes[venueName] = {};
        }

        const currentVote = votes[venueName][memberName] || "";
        let nextVote = "";
        
        if (currentVote === "") {
            nextVote = "yes";
        } else if (currentVote === "yes") {
            nextVote = "no";
        } else {
            nextVote = "";
        }

        votes[venueName][memberName] = nextVote;
        localStorage.setItem("tripsplit_votes", JSON.stringify(votes));
        
        // Refresh Favorites and Itinerary displays to show matching vote tag style
        if (currentSearchData) {
            populateList("sample-hotels", currentSearchData.sample_venues.hotels, "No hotels found");
            populateList("sample-restaurants", currentSearchData.sample_venues.restaurants, "No restaurants found");
            populateList("sample-attractions", currentSearchData.sample_venues.attractions, "No attractions found");
        }
        if (lastPlanResult) {
            renderPlanItinerary(lastPlanResult);
        }
        renderFavoritesList();
    } catch (e) {
        console.error("Failed to toggle member vote:", e);
    }
};

function getVotingTagsHtml(venueName) {
    const input = document.getElementById("group-members-input");
    if (!input) return "";
    const members = input.value.split(",").map(m => m.trim()).filter(m => m.length > 0);
    
    let votes = {};
    try {
        votes = JSON.parse(localStorage.getItem("tripsplit_votes")) || {};
    } catch (e) {}

    const venueVotes = votes[venueName] || {};

    const badges = members.map(m => {
        const val = venueVotes[m] || ""; // "yes", "no" or ""
        let classStr = "vote-tag";
        let label = `${m}`;
        if (val === "yes") {
            classStr += " yes";
            label += " 👍";
        } else if (val === "no") {
            classStr += " no";
            label += " 👎";
        }
        
        return `<span class="${classStr}" onclick="event.stopPropagation(); toggleMemberVote('${venueName.replace(/'/g, "\\'")}', '${m.replace(/'/g, "\\'")}')">${label}</span>`;
    }).join("");

    return `
        <div class="voting-tags-row">
            <span style="font-size:0.7rem; color:var(--text-secondary); align-self:center; font-weight:700; margin-right:4px;">Votes:</span>
            ${badges}
        </div>
    `;
}

// --- GEMINI TRAVEL ASSISTANT CHAT SYSTEM ---
function setupAssistantChat() {
    const chatBtn = document.getElementById("assistant-chat-btn");
    const chatInput = document.getElementById("assistant-chat-input");
    const chatBox = document.getElementById("assistant-chat-box");

    if (!chatBtn || !chatInput || !chatBox) return;

    async function sendChatQuery() {
        const query = chatInput.value.trim();
        if (!query) return;

        // Clear input
        chatInput.value = "";

        // Append User bubble
        appendChatBubble(chatBox, query, "user");

        // Append Loading / Typing indicator
        const typingId = appendChatBubble(chatBox, "Typing...", "assistant");
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            // Load current favorites/hearted board list as context
            const favorites = JSON.parse(localStorage.getItem("tripsplit_favorites")) || [];
            
            const response = await fetch("/api/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, favorites })
            });

            const typingBubble = document.getElementById(typingId);
            if (typingBubble) typingBubble.remove();

            if (!response.ok) {
                throw new Error("Assistant connection lost.");
            }

            const data = await response.json();
            appendChatBubble(chatBox, data.response, "assistant");
        } catch (e) {
            const typingBubble = document.getElementById(typingId);
            if (typingBubble) typingBubble.remove();
            appendChatBubble(chatBox, `Assistant: ${e.message}`, "error");
        }
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    chatBtn.addEventListener("click", sendChatQuery);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            sendChatQuery();
        }
    });
}

function appendChatBubble(container, text, type) {
    const bubble = document.createElement("div");
    const id = "bubble_" + Math.random().toString(36).slice(2, 9);
    bubble.id = id;
    bubble.className = `chat-msg ${type}`;
    
    // Support basic markdown like **bold** in assistant response
    if (type === "assistant") {
        bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    } else {
        bubble.textContent = text;
    }
    
    container.appendChild(bubble);
    return id;
}
