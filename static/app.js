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

    const navChat = document.getElementById("nav-chat");
    if (navChat) {
        navChat.addEventListener("click", (e) => {
            e.preventDefault();
            setActiveNav(navChat);
            if (window.toggleFloatingChat) {
                window.toggleFloatingChat(true);
            }
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
function renderVenueCardHtml(v, category, isRecommended = false) {
    const isHearted = isVenueFavorite(v.name);
    const heartIcon = isHearted ? "❤️" : "🤍";
    const optBadge = isRecommended ? `<span class="recommended-badge">⭐ Recommended Choice</span>` : "";
    const starsHtml = v.stars ? getBubbleRatingHtml(v.stars) : (v.utility ? getBubbleRatingHtml(Math.min(5, Math.ceil(v.utility / 30))) : "");
    const subTypeLabel = v.sub_type ? v.sub_type.toUpperCase() : category.toUpperCase();
    
    let costText = "";
    if (category === "hotel") {
        costText = `Est. Total: ₹${formatCost(v.cost)}`;
    } else if (category === "restaurant" || category === "bar") {
        costText = `Est. Meal Cost: ₹${formatCost(v.cost)}`;
    } else {
        costText = v.original_cost === 0 ? "Free Entry" : `Est. Fee: ₹${formatCost(v.original_cost)}`;
    }
    
    let enrichHtml = "";
    if (v.enrichment) {
        enrichHtml = `
            <div class="enrich-desc" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.25rem; line-height: 1.35;">${v.enrichment.description}</div>
            <div class="enrich-meta" style="font-size: 0.7rem; color: #4B5563; font-style: italic; margin-top: 0.25rem;">
                Vibe: ${v.enrichment.vibe} | Try: ${v.enrichment.extra_tips}
            </div>
        `;
    }
    
    const escapedName = v.name.replace(/'/g, "\\'");
    const categoryIcon = category === "hotel" ? "🏨" : category === "restaurant" ? "🍔" : category === "bar" ? "🍻" : "🏛️";
    
    // Add vote tag listing
    const votesHtml = getVotingTagsHtml(v.name);
    
    return `
        <div class="horizontal-card ${isRecommended ? 'recommended-border' : ''}">
            ${optBadge}
            ${renderVenueImageHtml(v.name, category)}
            <div class="card-details-box" style="display: flex; flex-direction: column; justify-content: space-between; flex: 1; padding: 0.75rem 0.5rem 0.5rem 0.5rem; gap: 0.35rem;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.25rem;">
                        <h5 class="venue-title" style="margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">${v.name}</h5>
                        <button onclick="toggleFavoriteVenue('${escapedName}', '${category}', '${categoryIcon}', ${v.lat}, ${v.lon})" style="background: none; border: none; cursor: pointer; font-size: 1rem; padding: 0.1rem; line-height: 1;">${heartIcon}</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.15rem; font-size: 0.72rem; color: var(--text-muted);">
                        <span>${subTypeLabel}</span>
                        ${starsHtml}
                    </div>
                    <div class="venue-cost-label" style="font-size: 0.8rem; font-weight: 700; color: var(--accent); margin-top: 0.25rem;">${costText}</div>
                </div>
                ${enrichHtml}
                ${votesHtml}
            </div>
        </div>
    `;
}

function renderPlanItinerary(plan) {
    if (!plan) return;

    // Populate Plan Summary
    const totalCostEl = document.getElementById("plan-total-cost");
    if (totalCostEl) totalCostEl.textContent = `₹${formatCost(plan.total_cost)}`;
    const personCostEl = document.getElementById("plan-person-cost");
    if (personCostEl) personCostEl.textContent = `₹${formatCost(plan.cost_per_person)}`;
    
    const statusBadge = document.getElementById("plan-status");
    if (statusBadge) {
        const isExceeded = plan.stops.some(s => s.budget_exceeded);
        if (isExceeded) {
            statusBadge.textContent = "Recommendation (Exceeds Target Budget)";
            statusBadge.className = "plan-status-badge backup";
            statusBadge.style.background = "#FEE2E2";
            statusBadge.style.color = "#DC2626";
        } else {
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

    const wrapper = document.getElementById("plan-details-wrapper");
    if (wrapper) {
        wrapper.innerHTML = "";

        plan.stops.forEach((stop, i) => {
            const stopSection = document.createElement("div");
            stopSection.className = "multi-stop-section";
            stopSection.style.marginTop = "2rem";
            stopSection.style.borderTop = "2.5px solid var(--border)";
            stopSection.style.paddingTop = "1.5rem";
            
            // 🏨 Stays Section
            let staysHtml = "";
            if (stop.all_hotels && stop.all_hotels.length > 0) {
                const recommendedHotel = stop.all_hotels.find(h => h.optimized) || stop.all_hotels[0];
                const otherHotels = stop.all_hotels.filter(h => h.name !== recommendedHotel.name);
                
                staysHtml = `
                    <div class="stop-row stays-row">
                        <div class="row-header">
                            <h4>🏨 Stays & Accommodations in ${stop.city.toUpperCase()}</h4>
                        </div>
                        <div class="row-content-split">
                            <div class="recommended-column">
                                <div class="section-tag-label">Recommended Accommodation</div>
                                ${renderVenueCardHtml(recommendedHotel, 'hotel', true)}
                            </div>
                            <div class="candidates-column">
                                <div class="section-tag-label">All Stays & Lodgings</div>
                                <div class="horizontal-card-deck">
                                    ${otherHotels.map(h => renderVenueCardHtml(h, 'hotel', false)).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 🍽️ Dining Section
            let diningHtml = "";
            if (stop.all_restaurants && stop.all_restaurants.length > 0) {
                const recommendedRests = stop.all_restaurants.filter(r => r.optimized);
                const otherRests = stop.all_restaurants.filter(r => !r.optimized);
                
                diningHtml = `
                    <div class="stop-row dining-row" style="margin-top: 1.5rem;">
                        <div class="row-header">
                            <h4>🍽️ Places to Eat & Dining in ${stop.city.toUpperCase()}</h4>
                        </div>
                        <div class="row-content-split">
                            <div class="recommended-column">
                                <div class="section-tag-label">Recommended Meals</div>
                                <div class="horizontal-card-deck" style="flex-direction: column; width: 100%;">
                                    ${recommendedRests.map(r => renderVenueCardHtml(r, 'restaurant', true)).join("")}
                                    ${recommendedRests.length === 0 ? '<div style="font-style:italic; font-size:0.8rem; color:var(--text-muted); padding:1rem; text-align:center;">None selected</div>' : ''}
                                </div>
                            </div>
                            <div class="candidates-column">
                                <div class="section-tag-label">All Dining Options</div>
                                <div class="horizontal-card-deck">
                                    ${otherRests.map(r => renderVenueCardHtml(r, 'restaurant', false)).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 🍻 Nightlife Section
            let nightlifeHtml = "";
            if (stop.all_bars && stop.all_bars.length > 0) {
                const recommendedBars = stop.all_bars.filter(b => b.optimized);
                const otherBars = stop.all_bars.filter(b => !b.optimized);
                
                nightlifeHtml = `
                    <div class="stop-row nightlife-row" style="margin-top: 1.5rem;">
                        <div class="row-header">
                            <h4>🍻 Bars, Pubs & Nightlife in ${stop.city.toUpperCase()}</h4>
                        </div>
                        <div class="row-content-split">
                            <div class="recommended-column">
                                <div class="section-tag-label">Recommended Drinks</div>
                                <div class="horizontal-card-deck" style="flex-direction: column; width: 100%;">
                                    ${recommendedBars.map(b => renderVenueCardHtml(b, 'bar', true)).join("")}
                                    ${recommendedBars.length === 0 ? '<div style="font-style:italic; font-size:0.8rem; color:var(--text-muted); padding:1rem; text-align:center;">None selected</div>' : ''}
                                </div>
                            </div>
                            <div class="candidates-column">
                                <div class="section-tag-label">All Nightspots & Pubs</div>
                                <div class="horizontal-card-deck">
                                    ${otherBars.map(b => renderVenueCardHtml(b, 'bar', false)).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 🏛️ Sightseeing Section
            let sightseeingHtml = "";
            if (stop.all_sightseeing && stop.all_sightseeing.length > 0) {
                const recommendedSights = stop.all_sightseeing.filter(a => a.optimized);
                const otherSights = stop.all_sightseeing.filter(a => !a.optimized);
                
                let zonesTimelineHtml = "";
                if (stop.zones && stop.zones.length > 0) {
                    zonesTimelineHtml = stop.zones.map((zone, zIdx) => `
                        <div class="zone-timeline-step" style="border-left: 2px solid var(--accent); padding-left: 1rem; margin-bottom: 1.25rem; position: relative;">
                            <div class="dot" style="position: absolute; left: -5px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent);"></div>
                            <h5 style="margin: 0; font-size: 0.85rem; font-weight: 700; color: var(--accent);">${zone.name}</h5>
                            <ul style="margin: 0.25rem 0 0 0; padding-left: 1rem; font-size: 0.78rem; color: var(--text-primary); line-height: 1.4;">
                                ${zone.popular_places.map(p => `<li><strong>${p.name}</strong></li>`).join("")}
                                ${zone.underrated_gems.map(u => `<li><strong>${u.name}</strong> (Gem 💎)</li>`).join("")}
                            </ul>
                        </div>
                    `).join("");
                } else {
                    zonesTimelineHtml = '<div style="font-style:italic; font-size:0.8rem; color:var(--text-muted);">No timeline generated</div>';
                }

                sightseeingHtml = `
                    <div class="stop-row sightseeing-row" style="margin-top: 1.5rem;">
                        <div class="row-header">
                            <h4>🏛️ Sightseeing & Tourist Attractions in ${stop.city.toUpperCase()}</h4>
                        </div>
                        <div class="row-content-split">
                            <div class="recommended-column">
                                <div class="section-tag-label">Recommended Itinerary</div>
                                <div style="background: var(--surface-light); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem;">
                                    ${zonesTimelineHtml}
                                </div>
                            </div>
                            <div class="candidates-column">
                                <div class="section-tag-label">All Sights, Beaches & Places</div>
                                <div class="horizontal-card-deck">
                                    ${otherSights.map(a => renderVenueCardHtml(a, 'attraction', false)).join("")}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            stopSection.innerHTML = `
                <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--accent); margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem;">
                    <span>Stop ${i + 1}: ${stop.city.toUpperCase()} (${stop.days} Days)</span>
                    <span>Est. Cost: ₹${formatCost(stop.local_cost)}</span>
                </h2>
                <div class="stop-horizontal-row-container">
                    ${staysHtml}
                    ${diningHtml}
                    ${nightlifeHtml}
                    ${sightseeingHtml}
                </div>
            `;
            wrapper.appendChild(stopSection);
        });

        // Draw Map
        if (plan.multi_city) {
            plotMultiCityOnMap(plan.stops, plan.legs);
        } else {
            plotZonesOnMap(plan.stops[0]);
        }
        
        loadRealVenueImages();
    }
}

// --- REAL VENUE PHOTO SYSTEM (Wikipedia + Wikimedia Commons) ---
const venueImageCache = {};

function getPlaceholderSvg(name) {
    const colors = ["4F46E5","0EA5E9","10B981","F59E0B","EF4444","8B5CF6","EC4899","06B6D4"];
    const hash = Math.abs(name.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
    const color = colors[hash % colors.length];
    const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#${color}" width="400" height="300" rx="8"/><text x="200" y="160" text-anchor="middle" fill="white" font-size="48" font-family="Arial,sans-serif" font-weight="bold">${initials}</text></svg>`)}`;
}

function renderVenueImageHtml(venueName, category) {
    const placeholder = getPlaceholderSvg(venueName);
    const escapedName = venueName.replace(/'/g, "\\'");
    return `
        <div class="venue-img-container" onclick="openLightboxForVenue('${escapedName}')">
            <img src="${placeholder}" class="venue-img" alt="${venueName}" data-venue="${venueName.replace(/"/g, '&quot;')}" data-category="${category}" onerror="this.onerror=null; this.src=getPlaceholderSvg('${escapedName}');">
            <button class="img-zoom-btn" onclick="event.stopPropagation(); openLightboxForVenue('${escapedName}')">🔍</button>
        </div>
    `;
}

// Fetch real photos from Wikipedia for all rendered venue images
async function loadRealVenueImages() {
    const imgs = document.querySelectorAll("img.venue-img[data-venue]");
    const promises = [];
    
    imgs.forEach(img => {
        const name = img.dataset.venue;
        if (!name) return;
        
        // Already loaded
        if (venueImageCache[name]) {
            img.src = venueImageCache[name];
            return;
        }
        
        promises.push(fetchWikipediaImage(name).then(url => {
            if (url) {
                venueImageCache[name] = url;
                // Update ALL images with this venue name (handles duplicates)
                document.querySelectorAll(`img.venue-img[data-venue="${CSS.escape(name)}"]`).forEach(el => {
                    el.onerror = () => {
                        el.src = getPlaceholderSvg(name);
                        el.onerror = null;
                    };
                    el.src = url;
                });
            }
        }));
    });
    
    await Promise.allSettled(promises);
}

async function fetchWikipediaImage(placeName) {
    // Get the city context for better search
    const destInput = document.getElementById("destination");
    const city = destInput ? destInput.value.trim() : "";
    
    // Try multiple search strategies
    const searchTerms = [
        placeName,
        city ? `${placeName} ${city}` : null,
        placeName.replace(/\(.*?\)/g, "").trim()  // Remove parentheticals
    ].filter(Boolean);
    
    for (const term of searchTerms) {
        try {
            // Wikipedia page summary API - titles require spaces replaced with underscores
            const formattedTerm = term.replace(/\s+/g, "_");
            const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(formattedTerm)}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.thumbnail && data.thumbnail.source) {
                    // Request a higher-res version (600px wide)
                    return data.thumbnail.source.replace(/\/\d+px-/, "/600px-");
                }
            }
        } catch(e) { /* try next */ }
    }
    
    // Fallback: Wikipedia search API
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName)}&format=json&origin=*&srlimit=1`;
        const res = await fetch(searchUrl);
        if (res.ok) {
            const data = await res.json();
            const pages = data.query?.search;
            if (pages && pages.length > 0) {
                const title = pages[0].title;
                const formattedTitle = title.replace(/\s+/g, "_");
                const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(formattedTitle)}`);
                if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    if (summaryData.thumbnail?.source) {
                        return summaryData.thumbnail.source.replace(/\/\d+px-/, "/600px-");
                    }
                }
            }
        }
    } catch(e) { /* use placeholder */ }
    
    return null; // keep placeholder
}

// Lightbox controller
window.openLightboxForVenue = function(venueName) {
    const lightbox = document.getElementById("image-lightbox");
    const img = document.getElementById("lightbox-img");
    const cap = document.getElementById("lightbox-caption");
    if (!lightbox || !img) return;
    
    const src = venueImageCache[venueName] || getPlaceholderSvg(venueName);
    img.src = src;
    if (cap) cap.textContent = venueName;
    lightbox.classList.remove("hidden");
};

window.openLightbox = function(src, caption) {
    const lightbox = document.getElementById("image-lightbox");
    const img = document.getElementById("lightbox-img");
    const cap = document.getElementById("lightbox-caption");
    if (lightbox && img) {
        img.src = src;
        if (cap) cap.textContent = caption;
        lightbox.classList.remove("hidden");
    }
};

window.closeLightbox = function() {
    const lightbox = document.getElementById("image-lightbox");
    if (lightbox) {
        lightbox.classList.add("hidden");
    }
};

// Modular food and drinks rendering helper - Horizontal scrolling cards
function renderFoodAndNightlifeElements(restaurants, bars, restList, barsList, barsContainer) {
    if (restList) {
        restList.className = "horizontal-card-deck";
        restList.innerHTML = "";
        if (!restaurants || restaurants.length === 0) {
            restList.innerHTML = "<li style='font-style: italic; color: var(--text-secondary);'>None selected</li>";
        } else {
            const counts = {};
            restaurants.forEach(r => {
                const name = r.name;
                counts[name] = counts[name] ? { ...r, qty: counts[name].qty + 1 } : { ...r, qty: 1 };
            });
            
            Object.values(counts).forEach(r => {
                const li = document.createElement("li");
                li.className = "horizontal-card";
                
                const qtyText = r.qty > 1 ? ` <span class="badge-qty" style="color: var(--accent); font-weight: bold;">x${r.qty}</span>` : "";
                
                let enrichHtml = "";
                if (r.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.35; flex: 1;">${r.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.7rem; color: #4B5563; font-style: italic; margin-top: 0.15rem; line-height: 1.25;">
                            Vibe: ${r.enrichment.vibe}<br>Try: ${r.enrichment.extra_tips}
                        </div>
                    `;
                } else {
                    enrichHtml = `<div style="flex: 1;"></div>`;
                }

                const isHearted = isVenueFavorite(r.name);
                const heartIcon = isHearted ? "❤️" : "🤍";
                
                li.innerHTML = `
                    ${renderVenueImageHtml(r.name, 'restaurant')}
                    <div style="display: flex; flex-direction: column; flex: 1; justify-content: space-between; gap: 0.35rem; width: 100%;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.25rem;">
                                <h5 style="margin:0; font-size:0.85rem; font-weight:700; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.2;">${r.name}${qtyText}</h5>
                                <button onclick="toggleFavoriteVenue('${r.name.replace(/'/g, "\\'")}', 'restaurant', '🍔', ${r.lat}, ${r.lon})" style="background:none; border:none; cursor:pointer; font-size:0.95rem; padding:0.1rem; line-height:1;">${heartIcon}</button>
                            </div>
                            <span class="opt-item-cost" style="font-size:0.78rem; font-weight:700; color:var(--accent); display:block; margin-top:0.15rem;">₹${formatCost(r.cost * r.qty)}</span>
                        </div>
                        ${enrichHtml}
                        ${getVotingTagsHtml(r.name)}
                    </div>
                `;
                restList.appendChild(li);
            });
        }
    }

    if (barsList) {
        barsList.className = "horizontal-card-deck";
        barsList.innerHTML = "";
        if (!bars || bars.length === 0) {
            if (barsContainer) barsContainer.classList.add("hidden");
        } else {
            if (barsContainer) barsContainer.classList.remove("hidden");
            bars.forEach(b => {
                const li = document.createElement("li");
                li.className = "horizontal-card";
                
                let enrichHtml = "";
                if (b.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.35; flex: 1;">${b.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.7rem; color: #4B5563; font-style: italic; margin-top: 0.15rem; line-height: 1.25;">
                            Vibe: ${b.enrichment.vibe}<br>Rec: ${b.enrichment.extra_tips}
                        </div>
                    `;
                } else {
                    enrichHtml = `<div style="flex: 1;"></div>`;
                }

                const isHearted = isVenueFavorite(b.name);
                const heartIcon = isHearted ? "❤️" : "🤍";
                
                li.innerHTML = `
                    ${renderVenueImageHtml(b.name, 'bar')}
                    <div style="display: flex; flex-direction: column; flex: 1; justify-content: space-between; gap: 0.35rem; width: 100%;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.25rem;">
                                <h5 style="margin:0; font-size:0.85rem; font-weight:700; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.2;">${b.name}</h5>
                                <button onclick="toggleFavoriteVenue('${b.name.replace(/'/g, "\\'")}', 'bar', '🍻', ${b.lat}, ${b.lon})" style="background:none; border:none; cursor:pointer; font-size:0.95rem; padding:0.1rem; line-height:1;">${heartIcon}</button>
                            </div>
                            <span class="opt-item-cost" style="font-size:0.78rem; font-weight:700; color:var(--accent); display:block; margin-top:0.15rem;">${b.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(b.cost)}</span>
                        </div>
                        ${enrichHtml}
                        ${getVotingTagsHtml(b.name)}
                    </div>
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
            list.className = "horizontal-card-deck";
            
            zone.popular_places.forEach(item => {
                const li = document.createElement("li");
                li.className = "horizontal-card";
                
                let enrichHtml = "";
                if (item.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.35; flex: 1;">${item.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.7rem; color: #4B5563; margin-top: 0.15rem; line-height: 1.25;">
                            Vibe: ${item.enrichment.vibe}<br>Tips: ${item.enrichment.extra_tips}
                        </div>
                    `;
                } else {
                    enrichHtml = `<div style="flex: 1;"></div>`;
                }

                const isHearted = isVenueFavorite(item.name);
                const heartIcon = isHearted ? "❤️" : "🤍";

                li.innerHTML = `
                    ${renderVenueImageHtml(item.name, 'attraction')}
                    <div style="display: flex; flex-direction: column; flex: 1; justify-content: space-between; gap: 0.35rem; width: 100%;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.25rem;">
                                <h5 style="margin:0; font-size:0.85rem; font-weight:700; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.2;">${item.name}</h5>
                                <button onclick="toggleFavoriteVenue('${item.name.replace(/'/g, "\\'")}', 'attraction', '🏛️', ${item.lat}, ${item.lon})" style="background:none; border:none; cursor:pointer; font-size:0.95rem; padding:0.1rem; line-height:1;">${heartIcon}</button>
                            </div>
                            <span class="zone-item-cost" style="font-size:0.78rem; font-weight:700; color:var(--accent); display:block; margin-top:0.15rem;">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                        </div>
                        ${enrichHtml}
                        ${getVotingTagsHtml(item.name)}
                    </div>
                `;
                list.appendChild(li);
            });

            group.innerHTML = "<h5 style='margin-bottom:0.25rem; font-size:0.9rem; font-weight:700;'>Popular Sights</h5>";
            group.appendChild(list);
            content.appendChild(group);
        }

        if (zone.underrated_gems && zone.underrated_gems.length > 0) {
            const group = document.createElement("div");
            group.className = "sub-zone-group underrated";
            
            const list = document.createElement("ul");
            list.className = "horizontal-card-deck";
            
            zone.underrated_gems.forEach(item => {
                const li = document.createElement("li");
                li.className = "horizontal-card";
                
                let enrichHtml = "";
                if (item.enrichment) {
                    enrichHtml = `
                        <div class="enrich-desc" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.35; flex: 1;">${item.enrichment.description}</div>
                        <div class="enrich-meta" style="font-size: 0.7rem; color: #4B5563; margin-top: 0.15rem; line-height: 1.25;">
                            Vibe: ${item.enrichment.vibe}<br>Tips: ${item.enrichment.extra_tips}
                        </div>
                    `;
                } else {
                    enrichHtml = `<div style="flex: 1;"></div>`;
                }

                const isHearted = isVenueFavorite(item.name);
                const heartIcon = isHearted ? "❤️" : "🤍";

                li.innerHTML = `
                    ${renderVenueImageHtml(item.name, 'attraction')}
                    <div style="display: flex; flex-direction: column; flex: 1; justify-content: space-between; gap: 0.35rem; width: 100%;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.25rem;">
                                <h5 style="margin:0; font-size:0.85rem; font-weight:700; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.2;">${item.name}</h5>
                                <button onclick="toggleFavoriteVenue('${item.name.replace(/'/g, "\\'")}', 'attraction', '🏛️', ${item.lat}, ${item.lon})" style="background:none; border:none; cursor:pointer; font-size:0.95rem; padding:0.1rem; line-height:1;">${heartIcon}</button>
                            </div>
                            <span class="zone-item-cost" style="font-size:0.78rem; font-weight:700; color:var(--accent); display:block; margin-top:0.15rem;">${item.cost === 0 ? '<span class="free-badge">Free</span>' : '₹' + formatCost(item.cost)}</span>
                        </div>
                        ${enrichHtml}
                        ${getVotingTagsHtml(item.name)}
                    </div>
                `;
                list.appendChild(li);
            });

            group.innerHTML = "<h5 style='margin-bottom:0.25rem; font-size:0.9rem; font-weight:700; margin-top:1rem;'>Underrated Gems</h5>";
            group.appendChild(list);
            content.appendChild(group);
        }

        zoneBlock.appendChild(content);
        container.appendChild(zoneBlock);
    });
}

// Draw single-city local zones, hotel, restaurants and bars on map
function plotZonesOnMap(stop) {
    if (!map || !stop) return;
    
    mapLayers.forEach(layer => {
        try { map.removeLayer(layer); } catch (e) {}
    });
    mapLayers = [];

    const allLatLngs = [];

    // Plot all stays in light blue circle markers, optimized stay as a main marker
    if (stop.all_hotels) {
        stop.all_hotels.forEach(h => {
            if (h.optimized) {
                const hotelMarker = L.marker([h.lat, h.lon]).addTo(map);
                hotelMarker.bindPopup(`<b>🏨 Recommended Stay: ${h.name}</b><br>Est. Total: ₹${formatCost(h.cost)}`);
                mapLayers.push(hotelMarker);
                allLatLngs.push([h.lat, h.lon]);
            } else {
                const marker = L.circleMarker([h.lat, h.lon], {
                    radius: 5,
                    fillColor: "#3B82F6",
                    color: "#FFFFFF",
                    weight: 1,
                    opacity: 0.6,
                    fillOpacity: 0.4
                }).addTo(map);
                marker.bindPopup(`<b>🏨 Lodging Option: ${h.name}</b><br>Est. Total: ₹${formatCost(h.cost)}`);
                mapLayers.push(marker);
                allLatLngs.push([h.lat, h.lon]);
            }
        });
    }

    // Plot all restaurants
    if (stop.all_restaurants) {
        stop.all_restaurants.forEach(r => {
            const isOpt = r.optimized;
            const marker = L.circleMarker([r.lat, r.lon], {
                radius: isOpt ? 8 : 5,
                fillColor: "#EA580C",
                color: "#FFFFFF",
                weight: isOpt ? 2 : 1,
                opacity: isOpt ? 1 : 0.6,
                fillOpacity: isOpt ? 0.9 : 0.4
            }).addTo(map);
            marker.bindPopup(`<b>🍽️ Restaurant: ${r.name}</b><br>Est. Meal: ₹${formatCost(r.cost)}${isOpt ? '<br>⭐ Recommended Choice' : ''}`);
            mapLayers.push(marker);
            allLatLngs.push([r.lat, r.lon]);
        });
    }

    // Plot all bars
    if (stop.all_bars) {
        stop.all_bars.forEach(b => {
            const isOpt = b.optimized;
            const marker = L.circleMarker([b.lat, b.lon], {
                radius: isOpt ? 8 : 5,
                fillColor: "#9333EA",
                color: "#FFFFFF",
                weight: isOpt ? 2 : 1,
                opacity: isOpt ? 1 : 0.6,
                fillOpacity: isOpt ? 0.9 : 0.4
            }).addTo(map);
            marker.bindPopup(`<b>🍻 Nightlife: ${b.name}</b><br>Est. Cost: ₹${formatCost(b.cost)}${isOpt ? '<br>⭐ Recommended Choice' : ''}`);
            mapLayers.push(marker);
            allLatLngs.push([b.lat, b.lon]);
        });
    }

    // Plot all attractions
    if (stop.all_sightseeing) {
        stop.all_sightseeing.forEach(a => {
            const isOpt = a.optimized;
            const marker = L.circleMarker([a.lat, a.lon], {
                radius: isOpt ? 8 : 5,
                fillColor: "#10B981",
                color: "#FFFFFF",
                weight: isOpt ? 2 : 1,
                opacity: isOpt ? 1 : 0.6,
                fillOpacity: isOpt ? 0.9 : 0.4
            }).addTo(map);
            marker.bindPopup(`<b>🏛️ Sight: ${a.name}</b><br>Est. Fee: ${a.original_cost === 0 ? 'Free' : '₹' + formatCost(a.original_cost)}${isOpt ? '<br>⭐ Recommended Choice' : ''}`);
            mapLayers.push(marker);
            allLatLngs.push([a.lat, a.lon]);
        });
    }

    // Draw the recommended zones connection lines
    const ZONE_COLORS = ["#2563EB", "#059669", "#DC2626", "#D97706", "#DB2777"];
    if (stop.zones) {
        stop.zones.forEach((zone, zoneIdx) => {
            const color = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
            const zoneCoords = [];
            
            zone.popular_places.forEach(item => {
                zoneCoords.push([item.lat, item.lon]);
            });
            zone.underrated_gems.forEach(item => {
                zoneCoords.push([item.lat, item.lon]);
            });

            if (zoneCoords.length > 1) {
                const polyline = L.polyline(zoneCoords, {
                    color: color,
                    weight: 2.5,
                    opacity: 0.7,
                    dashArray: "5, 5"
                }).addTo(map);
                mapLayers.push(polyline);
            }
        });
    }

    if (allLatLngs.length > 0) {
        map.fitBounds(allLatLngs, { padding: [50, 50] });
    }
}

function plotMultiCityOnMap(stops, legs) {
    if (!map) return;

    mapLayers.forEach(layer => {
        try { map.removeLayer(layer); } catch (e) {}
    });
    mapLayers = [];

    const allLatLngs = [];
    const intercityPoints = [];
    const STOP_COLORS = ["#2563EB", "#059669", "#DC2626", "#D97706", "#DB2777"];

    // Loop through each stop and plot all stays/restaurants/sights
    stops.forEach((stop, idx) => {
        const stopColor = STOP_COLORS[idx % STOP_COLORS.length];
        
        // Plot stays
        if (stop.all_hotels) {
            stop.all_hotels.forEach(h => {
                if (h.optimized) {
                    const hMarker = L.marker([h.lat, h.lon]).addTo(map);
                    hMarker.bindPopup(`<b>🏨 Recommended Stay: ${h.name}</b><br>Stop: ${stop.city.toUpperCase()}`);
                    mapLayers.push(hMarker);
                    allLatLngs.push([h.lat, h.lon]);
                    intercityPoints.push([h.lat, h.lon]);
                } else {
                    const marker = L.circleMarker([h.lat, h.lon], {
                        radius: 4,
                        fillColor: "#3B82F6",
                        color: "#FFFFFF",
                        weight: 1,
                        opacity: 0.5,
                        fillOpacity: 0.3
                    }).addTo(map);
                    marker.bindPopup(`<b>🏨 Lodging: ${h.name}</b><br>Stop: ${stop.city.toUpperCase()}`);
                    mapLayers.push(marker);
                    allLatLngs.push([h.lat, h.lon]);
                }
            });
        }

        // Plot restaurants
        if (stop.all_restaurants) {
            stop.all_restaurants.forEach(r => {
                const isOpt = r.optimized;
                const marker = L.circleMarker([r.lat, r.lon], {
                    radius: isOpt ? 7 : 4,
                    fillColor: "#EA580C",
                    color: "#FFFFFF",
                    weight: isOpt ? 1.5 : 1,
                    opacity: isOpt ? 0.9 : 0.5,
                    fillOpacity: isOpt ? 0.8 : 0.3
                }).addTo(map);
                marker.bindPopup(`<b>🍽️ Restaurant: ${r.name}</b><br>Stop: ${stop.city.toUpperCase()}`);
                mapLayers.push(marker);
                allLatLngs.push([r.lat, r.lon]);
            });
        }

        // Plot bars
        if (stop.all_bars) {
            stop.all_bars.forEach(b => {
                const isOpt = b.optimized;
                const marker = L.circleMarker([b.lat, b.lon], {
                    radius: isOpt ? 7 : 4,
                    fillColor: "#9333EA",
                    color: "#FFFFFF",
                    weight: isOpt ? 1.5 : 1,
                    opacity: isOpt ? 0.9 : 0.5,
                    fillOpacity: isOpt ? 0.8 : 0.3
                }).addTo(map);
                marker.bindPopup(`<b>🍻 Nightlife: ${b.name}</b><br>Stop: ${stop.city.toUpperCase()}`);
                mapLayers.push(marker);
                allLatLngs.push([b.lat, b.lon]);
            });
        }

        // Plot sights
        if (stop.all_sightseeing) {
            stop.all_sightseeing.forEach(a => {
                const isOpt = a.optimized;
                const marker = L.circleMarker([a.lat, a.lon], {
                    radius: isOpt ? 7 : 4,
                    fillColor: "#10B981",
                    color: "#FFFFFF",
                    weight: isOpt ? 1.5 : 1,
                    opacity: isOpt ? 0.9 : 0.5,
                    fillOpacity: isOpt ? 0.8 : 0.3
                }).addTo(map);
                marker.bindPopup(`<b>🏛️ Sight: ${a.name}</b><br>Stop: ${stop.city.toUpperCase()}`);
                mapLayers.push(marker);
                allLatLngs.push([a.lat, a.lon]);
            });
        }
    });

    // Connecting route lines between stops
    if (intercityPoints.length > 1) {
        const polyline = L.polyline(intercityPoints, {
            color: "#7C3AED",
            weight: 3.5,
            opacity: 0.85,
            dashArray: "8, 8"
        }).addTo(map);
        mapLayers.push(polyline);
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
    const chatContainer = document.getElementById("floating-chat-container");
    const chatBadge = document.getElementById("floating-chat-badge");
    const minimizeBtn = document.getElementById("minimize-chat-btn");

    if (!chatBtn || !chatInput || !chatBox || !chatContainer || !chatBadge) return;

    // Toggle Floating Panel
    window.toggleFloatingChat = function(show) {
        if (show === true) {
            chatContainer.style.display = "flex";
            chatBadge.style.display = "none";
        } else if (show === false) {
            chatContainer.style.display = "none";
            chatBadge.style.display = "flex";
        } else {
            const isHidden = chatContainer.style.display === "none";
            toggleFloatingChat(isHidden);
        }
    };

    if (minimizeBtn) {
        minimizeBtn.addEventListener("click", () => toggleFloatingChat(false));
    }
    chatBadge.addEventListener("click", () => toggleFloatingChat(true));

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
