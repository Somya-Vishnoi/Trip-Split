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
    const budgetInput = document.getElementById("budget");

    if (!amountInput || !currencySelect || !resultDiv || !applyBtn || !budgetInput) return;

    function updateConversion() {
        const amount = parseFloat(amountInput.value) || 0;
        const currency = currencySelect.value;
        const rate = EXCHANGE_RATES[currency] || 1;
        const converted = amount * rate;
        resultDiv.textContent = `₹${converted.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return Math.round(converted);
    }

    // Attach listeners
    amountInput.addEventListener("input", updateConversion);
    currencySelect.addEventListener("change", updateConversion);

    // Apply button click
    applyBtn.addEventListener("click", () => {
        const convertedVal = updateConversion();
        if (convertedVal > 0) {
            budgetInput.value = convertedVal;
            // Visual feedback on budget input
            budgetInput.style.borderColor = "var(--accent)";
            budgetInput.style.backgroundColor = "rgba(124, 58, 237, 0.08)";
            setTimeout(() => {
                budgetInput.style.borderColor = "";
                budgetInput.style.backgroundColor = "";
            }, 800);
        }
    });

    // Run initial conversion
    updateConversion();
}

// Map Initialization (Strictly Light Mode Map)
function initializeLeafletMap(lat, lon, bbox) {
    const mapContainer = document.getElementById("map");
    // Clear placeholder
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
            color: "#7C3AED", // Purple boundary to match accent
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
    const placeholder = venuesTab.querySelector(".summary-placeholder");

    const planTab = document.getElementById("plan-tab");
    const planData = document.getElementById("plan-data");
    const planPlaceholder = planTab.querySelector(".plan-placeholder");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const city = document.getElementById("destination").value.trim();
        const people = parseInt(document.getElementById("people").value);
        const days = parseInt(document.getElementById("days").value);
        const budget = parseFloat(document.getElementById("budget").value);
        
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
            document.getElementById("hotel-count").textContent = searchData.venue_counts.hotels;
            document.getElementById("rest-count").textContent = searchData.venue_counts.restaurants;
            document.getElementById("attr-count").textContent = searchData.venue_counts.attractions;

            populateList("sample-hotels", searchData.sample_venues.hotels, "No hotels found");
            populateList("sample-restaurants", searchData.sample_venues.restaurants, "No restaurants found");
            populateList("sample-attractions", searchData.sample_venues.attractions, "No attractions found");

            placeholder.classList.add("hidden");
            venuesData.classList.remove("hidden");

            // STEP 2: Optimize Budget Plan
            loaderText.textContent = "Running multi-stage Knapsack DP Optimizer...";
            
            const planResponse = await fetch("/api/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ city, budget, days, people })
            });

            if (!planResponse.ok) {
                throw new Error(await planResponse.text() || "Failed to optimize budget plan.");
            }

            const planResult = await planResponse.json();

            if (!planResult.success) {
                // Show budget exceeded warning
                planPlaceholder.innerHTML = `<p style="color: var(--accent); font-weight: bold;">⚠️ Optimization Failed: ${planResult.message}</p>`;
                planPlaceholder.classList.remove("hidden");
                planData.classList.add("hidden");
            } else {
                const plan = planResult.plan;
                
                // Populate Plan Summary
                document.getElementById("plan-total-cost").textContent = `₹${plan.total_cost.toFixed(2)}`;
                document.getElementById("plan-person-cost").textContent = `₹${plan.cost_per_person.toFixed(2)}`;
                
                const statusBadge = document.getElementById("plan-status");
                statusBadge.textContent = "Within Budget";
                statusBadge.className = "plan-status-badge"; // Reset class
                
                // Populate Hotel
                const hotelDetail = document.getElementById("opt-hotel-detail");
                const starsText = plan.hotel.stars ? ` ⭐ ${plan.hotel.stars} Star` : "";
                hotelDetail.innerHTML = `
                    <div class="hotel-details-block">
                        <div class="hotel-name">${plan.hotel.name}</div>
                        <div class="hotel-meta">${plan.hotel.sub_type.toUpperCase()} ${starsText}</div>
                        <div class="hotel-cost">Est. Total: ₹${plan.hotel.cost.toFixed(2)}</div>
                    </div>
                `;

                // Populate Restaurants list
                populateOptList("opt-restaurants-list", plan.restaurants);

                // Populate Attractions list
                populateOptList("opt-attractions-list", plan.attractions, true);

                // Populate Backup Plan
                const backupSection = document.getElementById("backup-plan-section");
                if (plan.backup) {
                    document.getElementById("backup-cost-badge").textContent = `₹${plan.backup.total_cost.toFixed(2)}`;
                    document.getElementById("backup-hotel-name").textContent = plan.backup.hotel.name;
                    backupSection.classList.remove("hidden");
                } else {
                    backupSection.classList.add("hidden");
                }

                planPlaceholder.classList.add("hidden");
                planData.classList.remove("hidden");
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

function populateOptList(elementId, items, isAttraction = false) {
    const list = document.getElementById(elementId);
    list.innerHTML = "";

    if (!items || items.length === 0) {
        const li = document.createElement("li");
        li.textContent = "None selected";
        li.style.fontStyle = "italic";
        list.appendChild(li);
        return;
    }

    items.forEach(item => {
        const li = document.createElement("li");
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "opt-item-name";
        nameSpan.textContent = item.name;
        li.appendChild(nameSpan);

        if (isAttraction && item.cost === 0) {
            const freeSpan = document.createElement("span");
            freeSpan.className = "free-badge";
            freeSpan.textContent = "Free";
            li.appendChild(freeSpan);
        } else {
            const costSpan = document.createElement("span");
            costSpan.className = "opt-item-cost";
            costSpan.textContent = `₹${item.cost.toFixed(2)}`;
            li.appendChild(costSpan);
        }

        list.appendChild(li);
    });
}
