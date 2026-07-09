/**
 * ==========================================================================
 * TRIPADVISOR SINGLE PAGE APPLICATION ENGINE (CLONE CORE LOGIC)
 * ==========================================================================
 */

// --- GLOBAL APPLICATION STATE ---
const state = {
    currentView: 'home',
    currency: 'INR',
    currencySymbol: '₹',
    user: null, // null when logged out, object when logged in
    currentCity: '',
    selectedCategory: 'hotels',
    activeSubtab: 'dest-overview',
    activeDetailSubtab: 'detail-overview',
    activeRestDetailSubtab: 'rest-overview',
    activeExpDetailSubtab: 'exp-overview',
    
    // Core database caches
    cityData: {}, // Details of loaded cities
    venues: {
        hotel: [],
        restaurant: [],
        experience: []
    },
    filteredVenues: {
        hotel: [],
        restaurant: [],
        experience: []
    },

    // Lightbox gallery state
    lightboxImages: [],
    lightboxIndex: 0,

    // In-memory reviews database indexed by venue name
    reviews: {},

    // In-memory travel forum database
    forumBoards: [
        { id: 'india', name: 'India Forum', posts: 1240 },
        { id: 'jaipur', name: 'Jaipur Forum', posts: 320 },
        { id: 'goa', name: 'Goa Forum', posts: 840 },
        { id: 'delhi', name: 'Delhi Forum', posts: 910 },
        { id: 'mumbai', name: 'Mumbai Forum', posts: 410 }
    ],
    forumThreads: [
        {
            id: 1,
            boardId: 'jaipur',
            title: 'Is 3 days enough for Jaipur and Amber Fort?',
            author: 'traveler_sam',
            date: '2026-07-01',
            replies: [
                { author: 'traveler_sam', date: '2026-07-01', text: 'Planning a group trip of 4 people. Is 3 days enough to see Hawa Mahal, City Palace, and Amber Fort without rushing?' },
                { author: 'jaipur_expert', date: '2026-07-02', text: 'Yes, 3 days is perfect! Day 1 for Hawa Mahal & City Palace, Day 2 for Amber Fort & Jal Mahal, Day 3 for shopping and local dinners.' },
                { author: 'nomad_rachel', date: '2026-07-03', text: 'Totally agree. Make sure to catch the light show at Amber Fort in the evening!' }
            ]
        },
        {
            id: 2,
            boardId: 'goa',
            title: 'Which beach is best for families in South Goa?',
            author: 'family_mom',
            date: '2026-06-28',
            replies: [
                { author: 'family_mom', date: '2026-06-28', text: 'Looking for a calm, clean beach in South Goa with good family resorts.' },
                { author: 'goa_lover', date: '2026-06-29', text: 'Varca Beach or Cavelossim Beach are excellent. Very quiet, clean white sand, and great family resorts like Radisson or Taj Exotica nearby.' }
            ]
        }
    ],
    activeThreadId: null,

    // Simulated favorites list
    favorites: JSON.parse(localStorage.getItem('ta_favorites') || '[]'),
    
    // Booking checkout wizard
    checkoutItem: null,
    checkoutType: 'hotel',

    // Maps markers references
    resultsMap: null,
    resultsMapMarkers: [],
    detailMap: null,
    detailMapMarker: null
};

// Mock review templates for dynamic generator
const MOCK_REVIEWS_POOL = [
    { title: "Absolutely stunning property!", text: "Our stay here was absolutely top-notch. The service was impeccable, rooms clean, and location couldn't be better. Highly recommend!", rating: 5, author: "ashok_trip", city: "Delhi" },
    { title: "Vibrant and wonderful experience", text: "Lovely ambiance, extremely polite staff. The heritage rooms felt royal. Will definitely visit again.", rating: 5, author: "riya_sen", city: "Kolkata" },
    { title: "Decent stay but expensive", text: "Nice rooms but the rates are quite high for the amenities provided. Breakfast menu could have more options.", rating: 3, author: "mark_travels", city: "London" },
    { title: "Average hospitality", text: "The service was a bit slow. Had to call room service thrice for extra towels. Otherwise location is good.", rating: 3, author: "neha_g", city: "Mumbai" },
    { title: "Terrible customer service", text: "Disappointed with the front desk behavior. Long check-in lines and unfriendly staff. Room was dusty.", rating: 1, author: "angry_traveller", city: "New York" }
];

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for simulated login
    const savedUser = localStorage.getItem('ta_user');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
        updateNavForUser();
    }
    
    // Setup event listeners for forms, review modals, search inputs
    setupGlobalSearchAutocomplete();
    
    // Initialize date pickers
    const todayStr = new Date().toISOString().split('T')[0];
    const checkinEl = document.getElementById('book-date-checkin');
    const checkoutEl = document.getElementById('book-date-checkout');
    if (checkinEl) checkinEl.value = todayStr;
    if (checkoutEl) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        checkoutEl.value = tomorrow.toISOString().split('T')[0];
    }
    
    // Load Homepage Carousels
    renderHomepageExperiences();
    renderHomepageHotels();
    renderHomepageArticles();
    
    // Parse URL parameters on load for deep linking & history compatibility
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view') || 'home';
    const paramVal = urlParams.get('param') || '';
    const cityParam = urlParams.get('city');
    const catParam = urlParams.get('cat');
    const itemParam = urlParams.get('item');
    const threadParam = urlParams.get('thread');
    
    if (cityParam) state.currentCity = decodeURIComponent(cityParam);
    if (catParam) state.selectedCategory = decodeURIComponent(catParam);
    if (itemParam) state.selectedItemId = decodeURIComponent(itemParam);
    if (threadParam) state.selectedThreadId = parseInt(threadParam);
    
    // Push the initial replaceState
    window.history.replaceState({
        viewId: viewParam,
        param: paramVal,
        currentCity: state.currentCity || '',
        selectedCategory: state.selectedCategory || '',
        selectedItemId: state.selectedItemId || '',
        selectedThreadId: state.selectedThreadId || ''
    }, '', window.location.search || '?view=home');
    
    // Route to initial page view
    if (viewParam === 'destination' && state.currentCity) {
        navigateToDestinationOverview(state.currentCity, 'India', true);
    } else if ((viewParam === 'hotel-detail' || viewParam === 'restaurant-detail' || viewParam === 'experience-detail') && state.selectedItemId) {
        let cat = viewParam === 'hotel-detail' ? 'hotel' : viewParam === 'restaurant-detail' ? 'restaurant' : 'experience';
        navigateToDetail(state.selectedItemId, cat, '', true);
    } else if (viewParam === 'forum-thread' && state.selectedThreadId) {
        openForumThread(state.selectedThreadId, true);
    } else if (viewParam === 'hotel-results' || viewParam === 'restaurant-results' || viewParam === 'experience-results') {
        navigateToCategoryResults(state.selectedCategory || 'hotels', true);
    } else {
        navigateToView(viewParam, paramVal, true);
    }
});

// Window Popstate Listener for Browser Back/Forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state) {
        const { viewId, param, currentCity, selectedCategory, selectedItemId, selectedThreadId } = event.state;
        if (currentCity) state.currentCity = currentCity;
        if (selectedCategory) state.selectedCategory = selectedCategory;
        if (selectedItemId) state.selectedItemId = selectedItemId;
        if (selectedThreadId) state.selectedThreadId = selectedThreadId;
        
        // Navigate accordingly
        if (viewId === 'destination' && state.currentCity) {
            navigateToDestinationOverview(state.currentCity, 'India', true);
        } else if ((viewId === 'hotel-detail' || viewId === 'restaurant-detail' || viewId === 'experience-detail') && state.selectedItemId) {
            let cat = viewId === 'hotel-detail' ? 'hotel' : viewId === 'restaurant-detail' ? 'restaurant' : 'experience';
            navigateToDetail(state.selectedItemId, cat, '', true);
        } else if (viewId === 'forum-thread' && state.selectedThreadId) {
            openForumThread(state.selectedThreadId, true);
        } else if (viewId === 'hotel-results' || viewId === 'restaurant-results' || viewId === 'experience-results') {
            navigateToCategoryResults(state.selectedCategory || 'hotels', true);
        } else {
            navigateToView(viewId, param, true);
        }
    } else {
        navigateToView('home', '', true);
    }
});

// --- ROUTER VIEW CONTROLLER ---
function navigateToView(viewId, param = '', skipPushState = false) {
    state.currentView = viewId;
    
    // Hide all views
    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    
    // Show active view
    const activeView = document.getElementById(`${viewId}-view`);
    if (activeView) activeView.classList.remove('hidden');
    
    // Update active nav links
    document.querySelectorAll('.nav-tab-link').forEach(link => {
        if (link.dataset.viewTarget === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Subtab / Scroll management
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    // Perform view-specific updates
    if (viewId === 'profile') {
        renderUserProfilePage(param);
    } else if (viewId === 'forums') {
        renderForumIndex();
    } else if (viewId === 'ledger') {
        initializeLedgerView();
    }
    
    if (!skipPushState) {
        let url = '?view=' + viewId;
        if (param) url += '&param=' + encodeURIComponent(param);
        if (state.currentCity) url += '&city=' + encodeURIComponent(state.currentCity);
        if (state.selectedCategory) url += '&cat=' + encodeURIComponent(state.selectedCategory);
        if (state.selectedItemId) url += '&item=' + encodeURIComponent(state.selectedItemId);
        if (state.selectedThreadId) url += '&thread=' + encodeURIComponent(state.selectedThreadId);
        
        window.history.pushState({
            viewId: viewId,
            param: param,
            currentCity: state.currentCity,
            selectedCategory: state.selectedCategory,
            selectedItemId: state.selectedItemId,
            selectedThreadId: state.selectedThreadId
        }, '', url);
    }
}

// Navigates directly from pills/search into the category search pages
function navigateToCategoryResults(category, skipPushState = false) {
    state.selectedCategory = category;
    
    if (category === 'restaurants') {
        const city = state.currentCity || 'Jaipur';
        state.currentCity = city;
        document.getElementById('rest-city-name-label').textContent = city;
        navigateToView('restaurant-results', '', skipPushState);
        loadCategoryResults('restaurant', city);
    } else if (category === 'attractions') {
        const city = state.currentCity || 'Jaipur';
        state.currentCity = city;
        document.getElementById('exp-city-name-label').textContent = city;
        navigateToView('experience-results', '', skipPushState);
        loadCategoryResults('experience', city);
    } else {
        // Default stays/hotels
        const city = state.currentCity || 'Jaipur';
        state.currentCity = city;
        document.getElementById('results-city-name-label').textContent = city;
        navigateToView('hotel-results', '', skipPushState);
        loadCategoryResults('hotel', city);
    }
}

// --- CURRENCY CONVERTER SYSTEM ---
function openLanguageModal() {
    document.getElementById('language-selector-modal').classList.remove('hidden');
}

function closeLanguageModal() {
    document.getElementById('language-selector-modal').classList.add('hidden');
}

function handleCurrencyChange(curr) {
    state.currency = curr;
    state.currencySymbol = curr === 'INR' ? '₹' : curr === 'USD' ? '$' : curr === 'EUR' ? '€' : '£';
    document.querySelector('.nav-btn-icon').textContent = `🌐 ${curr}`;
    
    // Trigger redraw of active page content
    if (state.currentView === 'hotel-results') {
        renderHotelResultsList();
    } else if (state.currentView === 'restaurant-results') {
        renderRestaurantResultsList();
    } else if (state.currentView === 'experience-results') {
        renderExperienceResultsList();
    }
}

function formatCost(amountInInr) {
    let rate = 1;
    if (state.currency === 'USD') rate = 0.012;
    else if (state.currency === 'EUR') rate = 0.011;
    else if (state.currency === 'GBP') rate = 0.009;
    
    const converted = Math.round(amountInInr * rate);
    return state.currencySymbol + converted.toLocaleString('en-IN');
}

// --- SIGN IN & SIMULATED USER SESSION ---
function openSigninModal() {
    document.getElementById('signin-modal').classList.remove('hidden');
}

function closeSigninModal() {
    document.getElementById('signin-modal').classList.add('hidden');
}

function switchSigninModalTab(tabId) {
    document.querySelectorAll('.signin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.signin-form-pane').forEach(pane => pane.classList.add('hidden'));
    
    document.querySelector(`[data-stab="${tabId}"]`).classList.add('active');
    document.getElementById(`${tabId}-pane`).classList.remove('hidden');
}

function handleSignInSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('signin-email').value;
    const name = email.split('@')[0];
    
    state.user = {
        username: name.charAt(0).toUpperCase() + name.slice(1),
        email: email,
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
        homeCity: "Delhi, India",
        memberSince: "2026",
        reviewsCount: 2,
        photosCount: 0,
        helpfulVotes: 4
    };
    
    localStorage.setItem('ta_user', JSON.stringify(state.user));
    updateNavForUser();
    closeSigninModal();
}

function handleRegisterSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    
    state.user = {
        username: name,
        email: email,
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
        homeCity: "Goa, India",
        memberSince: "2026",
        reviewsCount: 0,
        photosCount: 0,
        helpfulVotes: 0
    };
    
    localStorage.setItem('ta_user', JSON.stringify(state.user));
    updateNavForUser();
    closeSigninModal();
}

function handleOAuthLogin(provider) {
    alert(`Connecting with ${provider} OAuth mock integration...`);
    state.user = {
        username: `${provider}Explorer`,
        email: `${provider.toLowerCase()}@example.com`,
        avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80",
        homeCity: "Mumbai, India",
        memberSince: "2026",
        reviewsCount: 3,
        photosCount: 1,
        helpfulVotes: 8
    };
    localStorage.setItem('ta_user', JSON.stringify(state.user));
    updateNavForUser();
    closeSigninModal();
}

function handleSignOut() {
    state.user = null;
    localStorage.removeItem('ta_user');
    
    document.getElementById('nav-signin-btn').classList.remove('hidden');
    document.getElementById('nav-user-dropdown').classList.add('hidden');
    
    document.getElementById('drawer-signin-btn').classList.remove('hidden');
    document.getElementById('drawer-user-info').classList.add('hidden');
    
    navigateToView('home');
}

function updateNavForUser() {
    if (!state.user) return;
    
    // Desktop Nav update
    document.getElementById('nav-signin-btn').classList.add('hidden');
    const userDrop = document.getElementById('nav-user-dropdown');
    userDrop.classList.remove('hidden');
    document.getElementById('nav-username').textContent = state.user.username;
    if (state.user.avatar) {
        document.getElementById('nav-avatar').src = state.user.avatar;
    }
    
    // Mobile Drawer update
    document.getElementById('drawer-signin-btn').classList.add('hidden');
    const drawerInfo = document.getElementById('drawer-user-info');
    drawerInfo.classList.remove('hidden');
    document.getElementById('drawer-username-span').textContent = state.user.username;
}

function toggleMobileDrawer() {
    document.getElementById('mobile-drawer').classList.toggle('hidden');
}

// --- HOMEPAGE RENDERING ---
function renderHomepageExperiences() {
    const list = document.getElementById('experiences-deck');
    if (!list) return;
    
    const exps = [
        { name: "Jaipur TukTuk Street Food guided safari", cost: 1500, stars: 5, reviews: 140, type: "Tours", badge: "LIKELY TO SELL OUT", img: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80" },
        { name: "Private Taj Mahal Day Trip by Gatimaan Express Train", cost: 4800, stars: 5, reviews: 820, type: "Day Trips", badge: "POPULAR EXCURSION", img: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=400&q=80" },
        { name: "Old Delhi Spice Market & Rickshaw Ride Heritage Walk", cost: 950, stars: 4.5, reviews: 290, type: "Sightseeing", badge: "", img: "https://images.unsplash.com/photo-1585123334904-845d60e97b29?auto=format&fit=crop&w=400&q=80" },
        { name: "Amber Palace Elephants sanctuary eco tour", cost: 2500, stars: 4.5, reviews: 110, type: "Outdoor Sights", badge: "ECO CHOICE", img: "https://images.unsplash.com/photo-1504618223053-559bdef9dd5a?auto=format&fit=crop&w=400&q=80" }
    ];
    
    list.innerHTML = exps.map(item => `
        <li class="card-item-el" onclick="navigateToDetail('Amber Palace Tour', 'experience', 'Amber, Jaipur, India')">
            <div class="card-img-container">
                <img src="${item.img}" alt="${item.name}">
                ${item.badge ? `<span class="card-badge">${item.badge}</span>` : ''}
            </div>
            <div class="card-details">
                <span class="card-category-label">${item.type}</span>
                <strong class="card-item-title">${item.name}</strong>
                <div class="card-rating-row">
                    ${getBubbleRatingHtml(item.stars)}
                    <span>(${item.reviews})</span>
                </div>
                <div class="card-price-row">from ₹${item.cost.toLocaleString('en-IN')}</div>
            </div>
        </li>
    `).join('');
}

function renderHomepageHotels() {
    const list = document.getElementById('personalized-hotels-grid');
    if (!list) return;
    
    const hotels = [
        { name: "Taj Rambagh Palace Jaipur", cost: 35000, stars: 5, reviews: 490, img: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80" },
        { name: "Umaid Bhawan Palace Jodhpur", cost: 42000, stars: 5, reviews: 310, img: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=400&q=80" },
        { name: "Trident Hotel Udaipur", cost: 11500, stars: 4.5, reviews: 680, img: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=400&q=80" }
    ];
    
    list.innerHTML = hotels.map(item => `
        <div class="card-item-el" onclick="navigateToDetail('${item.name}', 'hotel')">
            <div class="card-img-container">
                <img src="${item.img}" alt="${item.name}">
            </div>
            <div class="card-details">
                <span class="card-category-label">Luxury Stays</span>
                <strong class="card-item-title">${item.name}</strong>
                <div class="card-rating-row">
                    ${getBubbleRatingHtml(item.stars)}
                    <span>(${item.reviews})</span>
                </div>
                <div class="card-price-row">from ₹${item.cost.toLocaleString('en-IN')} / night</div>
            </div>
        </div>
    `).join('');
}

function renderHomepageArticles() {
    const list = document.getElementById('articles-deck');
    if (!list) return;
    
    const blogs = [
        { title: "Rajasthan 7-Day Golden Triangle Guide", author: "Aarav Sharma", img: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=400&q=80" },
        { title: "Best places to try street Pyaz Kachori in old Johari Bazar", author: "Sania Malik", img: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80" },
        { title: "A complete guide to Goa's pristine South coast beaches", author: "John Doe", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80" }
    ];
    
    list.innerHTML = blogs.map(item => `
        <li class="card-item-el" style="width:300px;">
            <div class="card-img-container" style="height:150px;">
                <img src="${item.img}" alt="${item.title}">
            </div>
            <div class="card-details">
                <span class="card-category-label">Travel Article</span>
                <strong class="card-item-title" style="font-size:0.88rem;">${item.title}</strong>
                <span style="font-size:0.75rem; color:var(--text-muted);">Written by ${item.author}</span>
            </div>
        </li>
    `).join('');
}

function scrollCarousel(id, dir) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollLeft += (dir * 280);
    }
}

// --- AUTOCOMPLETE & GLOBAL SEARCH TYPEAHEAD ---
function setupGlobalSearchAutocomplete() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-autocomplete-dropdown');
    if (!input || !dropdown) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }
        
        // Show grouped results
        const items = [
            { type: 'dest', label: 'Jaipur', sub: 'Rajasthan, India' },
            { type: 'dest', label: 'Goa', sub: 'India' },
            { type: 'dest', label: 'Delhi', sub: 'National Capital Territory, India' },
            { type: 'dest', label: 'Mumbai', sub: 'Maharashtra, India' }
        ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
        
        if (items.length === 0) {
            dropdown.innerHTML = `<div style="padding:1rem; text-align:center; font-size:0.85rem; color:var(--text-muted);">No destinations matched. Press Enter to search generically.</div>`;
            dropdown.classList.remove('hidden');
            return;
        }
        
        dropdown.innerHTML = `
            <div class="autocomplete-group-title">Destinations</div>
            ${items.map(item => `
                <div class="autocomplete-item" onclick="selectAutocompleteDest('${item.label}', '${item.sub}')">
                    <span class="item-icon">📍</span>
                    <div>
                        <span class="item-name">${item.label}</span>
                        <div class="item-sub">${item.sub}</div>
                    </div>
                </div>
            `).join('')}
        `;
        dropdown.classList.remove('hidden');
    });
    
    // Hide autocomplete on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-wrapper')) {
            dropdown.classList.add('hidden');
        }
    });

    // Support enter key submission
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            triggerGlobalSearch();
        }
    });
}

function selectAutocompleteDest(city, country) {
    document.getElementById('global-search-input').value = city;
    document.getElementById('search-autocomplete-dropdown').classList.add('hidden');
    navigateToDestinationOverview(city, country);
}

function triggerGlobalSearch() {
    const val = document.getElementById('global-search-input').value.trim();
    if (!val) return;
    
    document.getElementById('search-autocomplete-dropdown').classList.add('hidden');
    navigateToDestinationOverview(val, "India");
}

function preFillCitySearch(city) {
    navigateToDestinationOverview(city, "India");
}

// --- DESTINATION OVERVIEW CONTROLLER ---
async function navigateToDestinationOverview(city, country = "India", skipPushState = false) {
    state.currentCity = city;
    navigateToView('destination', '', skipPushState);
    
    // Populate header photo based on city
    let heroImg = "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80"; // Jaipur
    if (city.toLowerCase() === 'goa') heroImg = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80";
    else if (city.toLowerCase() === 'mumbai') heroImg = "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=1200&q=80";
    else if (city.toLowerCase() === 'delhi') heroImg = "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80";
    
    document.getElementById('city-hero-banner-el').style.backgroundImage = `linear-gradient(transparent, rgba(0,0,0,0.6)), url('${heroImg}')`;
    document.getElementById('city-title-heading').textContent = city.toUpperCase();
    document.getElementById('city-country-heading').textContent = country;
    
    // Default subtab
    switchDestSubtab('dest-overview');
    
    // Call backend API search to populate real hotels, restaurants, sights!
    showPageLoader();
    try {
        const res = await fetch(`/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city: city })
        });
        if (res.ok) {
            const data = await res.json();
            // Pre-process venues list
            state.venues.hotel = data.hotels || [];
            state.venues.restaurant = data.restaurants || [];
            state.venues.experience = data.attractions || [];
            
            // Backups in case Overpass returns empty array (to keep college presentation working!)
            if (state.venues.hotel.length === 0) populateFallbackVenues(city);
            
            // Build descriptions
            document.getElementById('dest-overview-blurb').textContent = `${city} is one of the most visited and iconic destinations in ${country}. Famous for its rich history, cultural landmarks, outstanding hospitality, and exquisite local cuisines. Plan and split budgets here seamlessly!`;
            
            // Render sample lists
            renderSampleLists();
        }
    } catch (err) {
        populateFallbackVenues(city);
        renderSampleLists();
    } finally {
        hidePageLoader();
    }
}

function switchDestSubtab(tabName) {
    state.activeSubtab = tabName;
    document.querySelectorAll('.subtab-btn').forEach(btn => {
        if (btn.dataset.subtab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.querySelectorAll('.dest-subtab-pane').forEach(pane => pane.classList.add('hidden'));
    
    if (tabName === 'dest-overview') {
        document.getElementById('dest-overview-tab').classList.remove('hidden');
    } else if (tabName === 'dest-hotels') {
        document.getElementById('dest-hotels-tab').classList.remove('hidden');
        renderTabbedSearchView('hotel');
    } else if (tabName === 'dest-restaurants') {
        document.getElementById('dest-restaurants-tab').classList.remove('hidden');
        renderTabbedSearchView('restaurant');
    } else if (tabName === 'dest-attractions') {
        document.getElementById('dest-attractions-tab').classList.remove('hidden');
        renderTabbedSearchView('experience');
    } else {
        document.getElementById('dest-guide-tab').classList.remove('hidden');
    }
}

// Fallback arrays to guarantee presentation results for college assignment
function populateFallbackVenues(city) {
    state.venues.hotel = [
        { name: "Taj Rambagh Palace", cost: 38000, stars: 5, sub_type: "Hotel", lat: 26.8981, lon: 75.8078, wifi: true, pool: true, parking: true, bar: true },
        { name: "The Oberoi Rajvilas", cost: 32000, stars: 5, sub_type: "Resort", lat: 26.8791, lon: 75.8821, wifi: true, pool: true, parking: true, bar: true },
        { name: "Zostel Backpacker Hostel", cost: 800, stars: 4, sub_type: "Hostel", lat: 26.9212, lon: 75.8234, wifi: true, pool: false, parking: true, bar: false },
        { name: "Pearl Palace Heritage Guest House", cost: 3200, stars: 4.5, sub_type: "Guest House", lat: 26.9189, lon: 75.7891, wifi: true, pool: false, parking: true, bar: true }
    ];
    state.venues.restaurant = [
        { name: "Laxmi Mishthan Bhandar (LMB)", cost: 450, stars: 4.5, sub_type: "indian", price_tier: 2, lat: 26.9201, lon: 75.8281 },
        { name: "Peacock Rooftop Cafe", cost: 600, stars: 4.7, sub_type: "cafe", price_tier: 2, lat: 26.9178, lon: 75.7901 },
        { name: "Chokhi Dhani Ethnic Resort Dining", cost: 1200, stars: 4.8, sub_type: "indian", price_tier: 3, lat: 26.7681, lon: 75.8456 }
    ];
    state.venues.experience = [
        { name: "Amber Palace Heritage Walk", original_cost: 500, stars: 5, sub_type: "museum", lat: 26.9856, lon: 75.8512 },
        { name: "Hawa Mahal Front View Photo Spot", original_cost: 0, stars: 4.8, sub_type: "viewpoint", lat: 26.9239, lon: 75.8267 },
        { name: "Central Park Jaipur", original_cost: 0, stars: 4.3, sub_type: "park", lat: 26.9021, lon: 75.8090 }
    ];
}

function renderSampleLists() {
    renderSubDeck('dest-sample-hotels', state.venues.hotel.slice(0, 3), 'hotel');
    renderSubDeck('dest-sample-restaurants', state.venues.restaurant.slice(0, 3), 'restaurant');
    renderSubDeck('dest-sample-attractions', state.venues.experience.slice(0, 3), 'experience');
}

function renderSubDeck(containerId, list, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    
    if (list.length === 0) {
        el.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted); width:100%;">No ${type} entries loaded for this city.</div>`;
        return;
    }
    
    el.innerHTML = list.map(item => {
        const isHearted = isVenueFavorite(item.name);
        const heartIcon = isHearted ? "❤️" : "🤍";
        
        let costLabel = `₹${item.cost ? item.cost.toLocaleString('en-IN') : '0'}`;
        if (type === 'experience') {
            costLabel = item.original_cost === 0 ? "Free Entry" : `₹${item.original_cost}`;
        }
        
        return `
            <div class="card-item-el" onclick="navigateToDetail('${item.name.replace(/'/g, "\\'")}', '${type}')">
                <div class="card-img-container">
                    <img src="${getPlaceholderSvg(item.name)}" alt="${item.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${item.name.replace(/'/g, "\\'")}', '${type}', '', ${item.lat}, ${item.lon}); this.innerHTML = isVenueFavorite('${item.name.replace(/'/g, "\\'")}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="card-details">
                    <span class="card-category-label">${item.sub_type || type}</span>
                    <strong class="card-item-title">${item.name}</strong>
                    <div class="card-rating-row">
                        ${getBubbleRatingHtml(item.stars || 4.5)}
                    </div>
                    <div class="card-price-row">${costLabel}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Renders the side-by-side search columns inside destination subtabs
function renderTabbedSearchView(category) {
    if (category === 'hotel') {
        const container = document.getElementById('dest-hotels-tab');
        const searchResultsView = document.getElementById('hotel-results-view').innerHTML;
        container.innerHTML = searchResultsView;
        
        // Re-bind controls on the copy
        document.getElementById('results-city-name-label').textContent = state.currentCity;
        loadCategoryResults('hotel', state.currentCity);
    } else if (category === 'restaurant') {
        const container = document.getElementById('dest-restaurants-tab');
        const searchResultsView = document.getElementById('restaurant-results-view').innerHTML;
        container.innerHTML = searchResultsView;
        
        document.getElementById('rest-city-name-label').textContent = state.currentCity;
        loadCategoryResults('restaurant', state.currentCity);
    } else if (category === 'experience') {
        const container = document.getElementById('dest-attractions-tab');
        const searchResultsView = document.getElementById('experience-results-view').innerHTML;
        container.innerHTML = searchResultsView;
        
        document.getElementById('exp-city-name-label').textContent = state.currentCity;
        loadCategoryResults('experience', state.currentCity);
    }
}

// --- FILTERING & SEARCH RESULTS LISTS ---
function loadCategoryResults(type, city) {
    // Sync current lists to filtered lists
    state.filteredVenues[type] = [...state.venues[type]];
    
    // Sort & Render
    applySearchFilters(type);
}

function applySearchFilters(type) {
    let source = [...state.venues[type]];
    
    if (type === 'hotel') {
        // Price Filter
        const maxPrice = parseFloat(document.getElementById('filter-hotel-price-range')?.value || 25000);
        source = source.filter(h => (h.cost || 0) <= maxPrice);
        
        // Class stars filter
        const checkedClasses = Array.from(document.querySelectorAll('.filter-hotel-class-cb:checked')).map(cb => parseInt(cb.value));
        if (checkedClasses.length > 0) {
            source = source.filter(h => checkedClasses.includes(Math.round(h.stars || 4)));
        }
        
        // Property type filter
        const checkedTypes = Array.from(document.querySelectorAll('.filter-hotel-type-cb:checked')).map(cb => cb.value);
        if (checkedTypes.length > 0) {
            source = source.filter(h => checkedTypes.includes((h.sub_type || 'hotel').toLowerCase()));
        }
        
        // Amenities
        const checkedAmens = Array.from(document.querySelectorAll('.filter-hotel-amenity-cb:checked')).map(cb => cb.value);
        if (checkedAmens.length > 0) {
            source = source.filter(h => {
                return checkedAmens.every(amen => {
                    if (amen === 'wifi') return h.wifi !== false;
                    if (amen === 'pool') return h.pool === true;
                    if (amen === 'parking') return h.parking === true;
                    if (amen === 'bar') return h.bar === true;
                    return true;
                });
            });
        }

        // Guest ratings
        const activeRating = parseFloat(document.querySelector('.filter-hotel-rating-radio:checked')?.value || 0);
        if (activeRating > 0) {
            source = source.filter(h => (h.stars || 4) >= activeRating);
        }

        state.filteredVenues.hotel = source;
        renderHotelResultsList();
        
    } else if (type === 'restaurant') {
        const checkedCuisines = Array.from(document.querySelectorAll('.filter-rest-cuisine-cb:checked')).map(cb => cb.value);
        if (checkedCuisines.length > 0) {
            source = source.filter(r => checkedCuisines.includes((r.sub_type || '').toLowerCase()));
        }
        
        const checkedPriceTiers = Array.from(document.querySelectorAll('.filter-rest-price-cb:checked')).map(cb => parseInt(cb.value));
        if (checkedPriceTiers.length > 0) {
            source = source.filter(r => checkedPriceTiers.includes(r.price_tier || 2));
        }

        state.filteredVenues.restaurant = source;
        renderRestaurantResultsList();
        
    } else if (type === 'experience') {
        const checkedCats = Array.from(document.querySelectorAll('.filter-exp-category-cb:checked')).map(cb => cb.value);
        if (checkedCats.length > 0) {
            source = source.filter(e => checkedCats.includes((e.sub_type || '').toLowerCase()));
        }

        const checkedPrices = Array.from(document.querySelectorAll('.filter-exp-price-cb:checked')).map(cb => cb.value);
        if (checkedPrices.length > 0) {
            source = source.filter(e => {
                const isFree = (e.original_cost === 0);
                if (checkedPrices.includes('free') && isFree) return true;
                if (checkedPrices.includes('paid') && !isFree) return true;
                return false;
            });
        }

        state.filteredVenues.experience = source;
        renderExperienceResultsList();
    }
}

function clearAllSearchFilters(type) {
    if (type === 'hotel') {
        const slider = document.getElementById('filter-hotel-price-range');
        if (slider) slider.value = 25000;
        updatePriceSliderLabel(25000);
        
        document.querySelectorAll('.filter-hotel-class-cb').forEach(cb => cb.checked = false);
        document.querySelectorAll('.filter-hotel-type-cb').forEach(cb => cb.checked = false);
        document.querySelectorAll('.filter-hotel-amenity-cb').forEach(cb => cb.checked = false);
        const radioAll = document.querySelector('.filter-hotel-rating-radio[value="0"]');
        if (radioAll) radioAll.checked = true;
    } else if (type === 'restaurant') {
        document.querySelectorAll('.filter-rest-cuisine-cb').forEach(cb => cb.checked = false);
        document.querySelectorAll('.filter-rest-price-cb').forEach(cb => cb.checked = false);
    } else if (type === 'experience') {
        document.querySelectorAll('.filter-exp-category-cb').forEach(cb => cb.checked = false);
        document.querySelectorAll('.filter-exp-price-cb').forEach(cb => cb.checked = false);
    }
    applySearchFilters(type);
}

function updatePriceSliderLabel(val) {
    const lbl = document.getElementById('price-slider-value-lbl');
    if (lbl) lbl.textContent = `Max: ₹${parseInt(val).toLocaleString('en-IN')}`;
}

// --- RENDER MAIN RESULTS STREAMS ---
function renderHotelResultsList() {
    const list = document.getElementById('results-cards-list-container');
    if (!list) return;
    
    const hotels = state.filteredVenues.hotel;
    document.getElementById('results-count-label').textContent = `Showing ${hotels.length} stays`;
    
    if (hotels.length === 0) {
        list.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--text-muted);">No stays match your active filter selections. Try clearing filters.</div>`;
        return;
    }
    
    list.innerHTML = hotels.map(h => {
        const isHearted = isVenueFavorite(h.name);
        const heartIcon = isHearted ? "❤️" : "🤍";
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${h.name.replace(/'/g, "\\'")}', 'hotel')">
                <div class="row-card-img">
                    <img src="${getPlaceholderSvg(h.name)}" alt="${h.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${h.name.replace(/'/g, "\\'")}', 'hotel', '', ${h.lat}, ${h.lon}); this.innerHTML = isVenueFavorite('${h.name.replace(/'/g, "\\'")}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="row-card-content">
                    <div>
                        <h4 style="font-size:1.1rem; margin-bottom:0.25rem;">${h.name}</h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-muted);">
                            <span>${h.sub_type || 'Hotel'}</span>
                            ${getBubbleRatingHtml(h.stars || 4.5)}
                            <span>(120 reviews)</span>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Free WiFi • Pool access • Heritage architecture</p>
                    </div>
                </div>
                <div class="row-card-right">
                    <div class="price-val-lbl">${formatCost(h.cost || 8000)}</div>
                    <span style="font-size:0.7rem; color:var(--text-muted);">per night</span>
                    <button class="view-deal-btn" onclick="event.stopPropagation(); openPartnerComparisonDrawer('${h.name.replace(/'/g, "\\'")}')">View Deal</button>
                    <a href="#" class="compare-prices-link" style="font-size:0.72rem; margin-top:0.4rem; text-decoration:none;" onclick="event.stopPropagation(); openPartnerComparisonDrawer('${h.name.replace(/'/g, "\\'")}')">Compare 4 prices</a>
                </div>
            </div>
        `;
    }).join('');
    
    // Update map overlays if map panel split screen is open
    plotPinsOnResultsMap();
}

function renderRestaurantResultsList() {
    const list = document.getElementById('rest-cards-list-container');
    if (!list) return;
    
    const rests = state.filteredVenues.restaurant;
    if (rests.length === 0) {
        list.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--text-muted);">No restaurants match selected cuisines.</div>`;
        return;
    }
    
    list.innerHTML = rests.map(r => {
        const isHearted = isVenueFavorite(r.name);
        const heartIcon = isHearted ? "❤️" : "🤍";
        const priceSymbols = "₹".repeat(r.price_tier || 2);
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${r.name.replace(/'/g, "\\'")}', 'restaurant')">
                <div class="row-card-img" style="width:200px;">
                    <img src="${getPlaceholderSvg(r.name)}" alt="${r.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${r.name.replace(/'/g, "\\'")}', 'restaurant', '', ${r.lat}, ${r.lon}); this.innerHTML = isVenueFavorite('${r.name.replace(/'/g, "\\'")}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="row-card-content">
                    <div>
                        <h4 style="font-size:1.15rem;">${r.name}</h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                            ${getBubbleRatingHtml(r.stars || 4.2)}
                            <span>(80 reviews)</span>
                            <span>•</span>
                            <span style="font-weight:700;">${priceSymbols}</span>
                            <span>•</span>
                            <span>${r.sub_type || 'Indian'}</span>
                        </div>
                    </div>
                </div>
                <div class="row-card-right" style="width:140px;">
                    <button class="btn-primary" style="padding:0.5rem 1rem; font-size:0.8rem;">Book Table</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderExperienceResultsList() {
    const list = document.getElementById('exp-cards-list-container');
    if (!list) return;
    
    const exps = state.filteredVenues.experience;
    if (exps.length === 0) {
        list.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--text-muted);">No experiences found matching details.</div>`;
        return;
    }
    
    list.innerHTML = exps.map(e => {
        const isHearted = isVenueFavorite(e.name);
        const heartIcon = isHearted ? "❤️" : "🤍";
        const costLbl = e.original_cost === 0 ? "Free Entry" : `₹${e.original_cost.toLocaleString('en-IN')}`;
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${e.name.replace(/'/g, "\\'")}', 'experience')">
                <div class="row-card-img" style="width:200px;">
                    <img src="${getPlaceholderSvg(e.name)}" alt="${e.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${e.name.replace(/'/g, "\\'")}', 'experience', '', ${e.lat}, ${e.lon}); this.innerHTML = isVenueFavorite('${e.name.replace(/'/g, "\\'")}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="row-card-content">
                    <div>
                        <h4 style="font-size:1.15rem;">${e.name}</h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                            ${getBubbleRatingHtml(e.stars || 4.6)}
                            <span>(110 reviews)</span>
                            <span>•</span>
                            <span>${e.sub_type || 'Palace'}</span>
                        </div>
                    </div>
                </div>
                <div class="row-card-right" style="width:140px;">
                    <div style="font-weight:800; font-size:1rem; margin-bottom:0.25rem;">${costLbl}</div>
                    <button class="btn-primary" style="padding:0.5rem 1rem; font-size:0.8rem;">Book Tickets</button>
                </div>
            </div>
        `;
    }).join('');
}

function handleSortSelectChange(val, type) {
    const list = state.filteredVenues[type];
    
    if (val === 'cost_asc') {
        list.sort((a,b) => (a.cost || a.original_cost || 0) - (b.cost || b.original_cost || 0));
    } else if (val === 'cost_desc') {
        list.sort((a,b) => (b.cost || b.original_cost || 0) - (a.cost || a.original_cost || 0));
    } else if (val === 'rating') {
        list.sort((a,b) => (b.stars || 4.5) - (a.stars || 4.5));
    }
    
    if (type === 'hotel') renderHotelResultsList();
    else if (type === 'restaurant') renderRestaurantResultsList();
    else if (type === 'experience') renderExperienceResultsList();
}

// --- PARTNER COMPARISON DRAWER ---
function openPartnerComparisonDrawer(name) {
    const matched = state.venues.hotel.find(h => h.name === name);
    if (!matched) return;
    
    const summary = document.getElementById('drawer-hotel-summary-el');
    const plist = document.getElementById('drawer-partner-prices-list-el');
    
    summary.innerHTML = `
        <h3 style="font-size:1.15rem;">${matched.name}</h3>
        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;">
            ${getBubbleRatingHtml(matched.stars || 4.5)}
            <span style="font-size:0.75rem; color:var(--text-muted);">(120 reviews)</span>
        </div>
    `;
    
    const partners = [
        { brand: "Booking.com", mult: 1 },
        { brand: "Agoda.com", mult: 0.96 },
        { brand: "MakeMyTrip", mult: 1.05 },
        { brand: "TripSplit Deals", mult: 0.98 }
    ];
    
    plist.innerHTML = partners.map(p => {
        const price = Math.round(matched.cost * p.mult);
        return `
            <li class="partner-price-item">
                <div>
                    <span class="partner-logo-label">${p.brand}</span>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Free Cancellation</div>
                </div>
                <div style="text-align:right;">
                    <strong style="font-size:1.15rem; color:var(--accent);">${formatCost(price)}</strong>
                    <button class="btn-primary" style="display:block; padding:0.4rem 0.85rem; font-size:0.78rem; margin-top:0.25rem;" onclick="triggerCheckoutFlow('hotel', '${matched.name.replace(/'/g, "\\'")}')">Book</button>
                </div>
            </li>
        `;
    }).join('');
    
    document.getElementById('partner-comparison-drawer').classList.remove('hidden');
    document.getElementById('partner-drawer-backdrop').classList.remove('hidden');
}

function closePartnerComparisonDrawer() {
    document.getElementById('partner-comparison-drawer').classList.add('hidden');
    document.getElementById('partner-drawer-backdrop').classList.add('hidden');
}

// --- RESULTS MAP TOGGLING & PLOTTING ---
function toggleResultsMapSplit() {
    const mapPanel = document.getElementById('results-map-panel-el');
    const splitLayout = document.getElementById('results-split-layout');
    const toggleBtn = document.getElementById('map-toggle-btn');
    
    if (mapPanel.classList.contains('hidden')) {
        mapPanel.classList.remove('hidden');
        toggleBtn.textContent = "🗺️ Hide Map";
        
        // Initialize map
        if (!state.resultsMap) {
            state.resultsMap = L.map('results-leaflet-map').setView([26.9124, 75.7873], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(state.resultsMap);
        }
        
        setTimeout(() => {
            state.resultsMap.invalidateSize();
            plotPinsOnResultsMap();
        }, 150);
        
    } else {
        mapPanel.classList.add('hidden');
        toggleBtn.textContent = "🗺️ Show Map";
    }
}

function plotPinsOnResultsMap() {
    if (!state.resultsMap) return;
    
    // Clear previous markers
    state.resultsMapMarkers.forEach(m => state.resultsMap.removeLayer(m));
    state.resultsMapMarkers = [];
    
    const hotels = state.filteredVenues.hotel;
    if (hotels.length === 0) return;
    
    const latlngs = [];
    
    hotels.forEach(h => {
        if (!h.lat || !h.lon) return;
        
        // Create custom divicon price tags like TripAdvisor
        const markerIcon = L.divIcon({
            className: 'custom-map-price-pin',
            html: `<div style="background:var(--accent); color:#fff; font-weight:800; font-size:0.75rem; padding:3px 6px; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.25); white-space:nowrap; border:1px solid #fff;">₹${h.cost ? Math.round(h.cost/1000) + 'k' : '?' }</div>`,
            iconSize: [40, 20],
            iconAnchor: [20, 10]
        });
        
        const m = L.marker([h.lat, h.lon], { icon: markerIcon }).addTo(state.resultsMap);
        m.bindPopup(`<b>🏨 ${h.name}</b><br>Price: ${formatCost(h.cost)}<br><a href="#" onclick="navigateToDetail('${h.name.replace(/'/g, "\\'")}', 'hotel'); return false;">View Details</a>`);
        
        state.resultsMapMarkers.push(m);
        latlngs.push([h.lat, h.lon]);
    });
    
    if (latlngs.length > 0) {
        state.resultsMap.fitBounds(latlngs, { padding: [30, 30] });
    }
}

// --- ITEM DETAIL VIEWS MANAGER ---
function navigateToDetail(name, category, addressFallback = "", skipPushState = false) {
    state.selectedItemId = name;
    state.selectedCategory = category;

    // Find the item details in list caches
    let item = state.venues[category].find(v => v.name === name);
    if (!item) {
        // Build mock properties if not found
        item = {
            name: name,
            cost: 14000,
            original_cost: 1500,
            stars: 4.8,
            sub_type: category === 'hotel' ? 'Luxury Stay' : category === 'restaurant' ? 'Indian Cafe' : 'Heritage Tour',
            lat: 26.9124,
            lon: 75.7873,
            wifi: true, pool: true, parking: true, bar: true,
            enrichment: {
                description: `${name} is exceptionally popular with travelers. It boasts pristine aesthetics, highly professional staff service levels, and lies close to local transit.`,
                vibe: "Elegant & Heritage",
                extra_tips: "Must try local signatures."
            }
        };
    }
    
    // Fill detailed fields based on category
    if (category === 'hotel') {
        state.checkoutItem = item;
        state.checkoutType = 'hotel';
        
        navigateToView('hotel-detail', '', skipPushState);
        
        document.getElementById('detail-hotel-name').textContent = item.name;
        document.getElementById('detail-hotel-rating-bubbles').innerHTML = getBubbleRatingHtml(item.stars || 4.5);
        document.getElementById('detail-hotel-reviews-count').textContent = `(${getReviewsListForVenue(item.name).length} reviews)`;
        document.getElementById('detail-hotel-class-stars').textContent = "⭐".repeat(Math.round(item.stars || 5));
        document.getElementById('detail-hotel-address').textContent = addressFallback || item.address || `${item.name} Central Area, Jaipur, Rajasthan`;
        
        // Description
        document.getElementById('detail-overview-description').textContent = item.enrichment?.description || `${item.name} offers travelers a royal legacy stay inside comfortable suites. It features highly praised spa setups and authentic culinary options inside gardens.`;
        
        // Rooms
        const rgrid = document.getElementById('detail-rooms-grid-container');
        rgrid.innerHTML = `
            <div class="row-card-item">
                <div class="row-card-img" style="width:160px;"><img src="https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=300&q=80" alt="Deluxe Room"></div>
                <div class="row-card-content">
                    <h5 style="font-size:0.95rem;">Deluxe Garden View Suite</h5>
                    <p style="font-size:0.75rem; color:var(--text-muted);">1 King Bed • Sleeps 2 • Free cancellation</p>
                </div>
                <div class="row-card-right" style="width:150px;">
                    <strong style="font-size:1.1rem; color:var(--accent);">${formatCost(item.cost)}</strong>
                    <button class="btn-primary" style="font-size:0.75rem; padding:0.4rem 0.8rem;" onclick="triggerCheckoutFlow('hotel', '${item.name.replace(/'/g, "\\'")}')">Book Room</button>
                </div>
            </div>
            <div class="row-card-item">
                <div class="row-card-img" style="width:160px;"><img src="https://images.unsplash.com/photo-1582719478250-c89cae4db85b?auto=format&fit=crop&w=300&q=80" alt="Luxury Room"></div>
                <div class="row-card-content">
                    <h5 style="font-size:0.95rem;">Royal Heritage Suite (Balcony)</h5>
                    <p style="font-size:0.75rem; color:var(--text-muted);">1 King Bed + Lounge • Free Breakfast</p>
                </div>
                <div class="row-card-right" style="width:150px;">
                    <strong style="font-size:1.1rem; color:var(--accent);">${formatCost(item.cost * 1.4)}</strong>
                    <button class="btn-primary" style="font-size:0.75rem; padding:0.4rem 0.8rem;" onclick="triggerCheckoutFlow('hotel', '${item.name.replace(/'/g, "\\'")}')">Book Room</button>
                </div>
            </div>
        `;

        // Amenities
        const amens = document.getElementById('detail-hotel-amenities-strip');
        amens.innerHTML = `
            <span class="amenity-pill-icon">📶 Free WiFi</span>
            <span class="amenity-pill-icon">🏊 Swimming Pool</span>
            <span class="amenity-pill-icon">🅿️ Free Valet Parking</span>
            <span class="amenity-pill-icon">🍷 Dining Restobar</span>
            <span class="amenity-pill-icon">🕒 24/7 Desk Reception</span>
        `;

        // Booking widget sidebar values
        document.getElementById('booking-sidebar-price-val').textContent = formatCost(item.cost);
        
        // Book partners list
        const bcomp = document.getElementById('booking-compare-partner-list');
        bcomp.innerHTML = `
            <li style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:3px;">
                <span>Booking.com</span>
                <strong>${formatCost(item.cost)}</strong>
            </li>
            <li style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:3px;">
                <span>Agoda.com</span>
                <strong>${formatCost(item.cost * 0.97)}</strong>
            </li>
            <li style="display:flex; justify-content:space-between;">
                <span>MakeMyTrip</span>
                <strong>${formatCost(item.cost * 1.03)}</strong>
            </li>
        `;
        
        // Gallery photo columns
        setupGalleryStrip('hotel-gallery-strip-container', item.name);
        
        // Review score bars
        renderReviewsPanelDetails(item.name);
        
        // Subtab default
        switchDetailSubtab('detail-overview');
        
        // Draw maps
        setTimeout(() => {
            initializeDetailMap('detail-location-leaflet-map', item.lat, item.lon, item.name);
        }, 300);

    } else if (category === 'restaurant') {
        state.checkoutItem = item;
        state.checkoutType = 'restaurant';
        navigateToView('restaurant-detail', '', skipPushState);
        
        document.getElementById('detail-rest-name').textContent = item.name;
        document.getElementById('detail-rest-rating-bubbles').innerHTML = getBubbleRatingHtml(item.stars || 4.4);
        document.getElementById('detail-rest-reviews-count').textContent = `(${getReviewsListForVenue(item.name).length} reviews)`;
        document.getElementById('detail-rest-address').textContent = addressFallback || item.address || `${item.name} Bazaar, Jaipur, Rajasthan`;
        document.getElementById('detail-rest-cuisine-label').textContent = item.sub_type ? item.sub_type.toUpperCase() : 'INDIAN TRADITIONAL';
        
        document.getElementById('detail-rest-overview-description').textContent = `${item.name} is one of the most popular dining destinations in this area. It specializes in mouth-watering regional desserts, snacks, and traditional signature thalis.`;
        
        // Menu list
        const mlist = document.getElementById('rest-signature-dishes-list');
        mlist.innerHTML = `
            <li>✔️ Special Maharaja Thali (Keri Sangri, Dal Bati) — <strong>₹450</strong></li>
            <li>✔️ Crispy Pyaaz Kachori (Heritage recipe) — <strong>₹90</strong></li>
            <li>✔️ Kesar Lassi (Sweet saffron curd drink) — <strong>₹120</strong></li>
        `;
        
        // Amenities
        const amens = document.getElementById('detail-rest-amenities-strip');
        amens.innerHTML = `
            <span class="amenity-pill-icon">🌿 Vegetarian Options</span>
            <span class="amenity-pill-icon">🪑 Outdoor seating area</span>
            <span class="amenity-pill-icon">💳 Cards Accepted</span>
        `;
        
        setupGalleryStrip('rest-gallery-strip-container', item.name);
        renderRestaurantReviewsPanel(item.name);
        switchRestDetailSubtab('rest-overview');

    } else if (category === 'experience') {
        state.checkoutItem = item;
        state.checkoutType = 'experience';
        navigateToView('experience-detail', '', skipPushState);
        
        document.getElementById('detail-exp-name').textContent = item.name;
        document.getElementById('detail-exp-rating-bubbles').innerHTML = getBubbleRatingHtml(item.stars || 4.7);
        document.getElementById('detail-exp-reviews-count').textContent = `(${getReviewsListForVenue(item.name).length} reviews)`;
        document.getElementById('detail-exp-address').textContent = addressFallback || item.address || `${item.name} Fort Gates, Jaipur, Rajasthan`;
        
        document.getElementById('detail-exp-overview-description').textContent = `${item.name} offers tourists a magnificent, historic look into legacy royal chambers, defense watchtowers, and stunning architecture. Hire local guides for details.`;
        
        const amens = document.getElementById('detail-exp-amenities-strip');
        amens.innerHTML = `
            <span class="amenity-pill-icon">⏱️ Duration: 3 Hours</span>
            <span class="amenity-pill-icon">🗣️ Language: English & Hindi</span>
            <span class="amenity-pill-icon">🎟️ Express Tickets option</span>
        `;
        
        document.getElementById('activity-booking-price-val').textContent = formatCost(item.original_cost || 1500);
        
        setupGalleryStrip('exp-gallery-strip-container', item.name);
        renderExperienceReviewsPanel(item.name);
        switchExpDetailSubtab('exp-overview');
    }
}

function setupGalleryStrip(containerId, name) {
    const el = document.getElementById(containerId);
    if (!el) return;
    
    // TripAdvisor gallery photos
    const imgs = [
        "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1582719478250-c89cae4db85b?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=400&q=80"
    ];
    
    state.lightboxImages = imgs;
    
    el.innerHTML = imgs.map((src, idx) => {
        if (idx === 4) {
            return `
                <div class="gallery-photo-el" onclick="openLightbox(${idx})">
                    <img src="${src}" alt="Slide">
                    <button class="gallery-see-all-btn">See all photos</button>
                </div>
            `;
        }
        return `
            <div class="gallery-photo-el" onclick="openLightbox(${idx})">
                <img src="${src}" alt="Slide">
            </div>
        `;
    }).join('');
}

// Lightbox modal carousel logic
function openLightbox(idx) {
    state.lightboxIndex = idx;
    const lightbox = document.getElementById('image-lightbox');
    const img = document.getElementById('lightbox-img');
    const cap = document.getElementById('lightbox-caption');
    
    img.src = state.lightboxImages[idx];
    cap.textContent = `Photo ${idx + 1} of ${state.lightboxImages.length}`;
    
    lightbox.classList.remove('hidden');
}

function closeLightbox() {
    document.getElementById('image-lightbox').classList.add('hidden');
}

function navigateLightbox(dir) {
    let nextIdx = state.lightboxIndex + dir;
    if (nextIdx < 0) nextIdx = state.lightboxImages.length - 1;
    if (nextIdx >= state.lightboxImages.length) nextIdx = 0;
    
    openLightbox(nextIdx);
}

// Subtab switcher inside detail panes
function switchDetailSubtab(subName) {
    state.activeDetailSubtab = subName;
    document.querySelectorAll('[data-dtab]').forEach(btn => {
        if (btn.dataset.dtab === subName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.querySelectorAll('#detail-subtabs-pane, .detail-pane-content').forEach(pane => {
        if (pane.id.startsWith('detail-') && pane.id.endsWith('-pane')) {
            pane.classList.add('hidden');
        }
    });
    
    document.getElementById(`detail-${subName.replace('detail-', '')}-pane`).classList.remove('hidden');
    
    // Invalidate map size if Map tab activated
    if (subName === 'detail-location' && state.detailMap) {
        setTimeout(() => state.detailMap.invalidateSize(), 150);
    }
}

function switchRestDetailSubtab(subName) {
    state.activeRestDetailSubtab = subName;
    document.querySelectorAll('[data-rtab]').forEach(btn => {
        if (btn.dataset.rtab === subName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.querySelectorAll('#rest-overview-pane, #rest-menu-pane, #rest-reviews-pane').forEach(pane => pane.classList.add('hidden'));
    document.getElementById(`${subName}-pane`).classList.remove('hidden');
}

function switchExpDetailSubtab(subName) {
    state.activeExpDetailSubtab = subName;
    document.querySelectorAll('[data-etab]').forEach(btn => {
        if (btn.dataset.etab === subName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.querySelectorAll('#exp-overview-pane, #exp-included-pane, #exp-reviews-pane').forEach(pane => pane.classList.add('hidden'));
    document.getElementById(`${subName}-pane`).classList.remove('hidden');
}

// Leaflet map initialization
function initializeDetailMap(containerId, lat, lon, name) {
    if (state.detailMap) {
        state.detailMap.remove();
        state.detailMap = null;
    }
    
    state.detailMap = L.map(containerId).setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.detailMap);
    
    state.detailMapMarker = L.marker([lat, lon]).addTo(state.detailMap);
    state.detailMapMarker.bindPopup(`<b>📍 ${name}</b>`).openPopup();
}

function scrollToElement(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// --- REVIEWS DATABASE & SUBMISSIONS ---
function getReviewsListForVenue(venueName) {
    if (!state.reviews[venueName]) {
        // Pre-populate mock reviews for this venue name
        state.reviews[venueName] = [
            { id: 1, author: "traveler_amit", rating: 5, date: "2026-06", title: "Phenomenal! Best service ever", body: "I spent three nights here during our family trip. The ambiance is royal, the gardens are beautifully kept, and the peacock sightings inside are absolute delights. Staff goes out of their way to support.", response: "Thank you for the kind words! We hope to welcome you back." },
            { id: 2, author: "stewart_j", rating: 4, date: "2026-05", title: "Lovely grounds and clean sheets", body: "Excellence in historic maintenance. Rooms are fully packed with heritage details, but check-in queues at the front desk lobby area took about 20 minutes. Worth visiting.", response: null }
        ];
    }
    return state.reviews[venueName];
}

function renderReviewsPanelDetails(venueName) {
    const list = getReviewsListForVenue(venueName);
    document.getElementById('detail-reviews-total-lbl').textContent = list.length;
    
    // Bar breakdown calculation
    const counts = {5:0, 4:0, 3:0, 2:0, 1:0};
    list.forEach(r => counts[Math.round(r.rating)]++);
    
    const container = document.getElementById('rating-breakdown-bars-container');
    container.innerHTML = [5, 4, 3, 2, 1].map(score => {
        const percentage = list.length > 0 ? Math.round((counts[score] / list.length) * 100) : 0;
        return `
            <div class="percentage-bar-row">
                <span style="width:60px;">${score} Bubble</span>
                <div class="bar-bg"><div class="bar-fill" style="width:${percentage}%;"></div></div>
                <span style="width:30px; text-align:right;">${percentage}%</span>
            </div>
        `;
    }).join('');
    
    // Sub-ratings
    const subContainer = document.getElementById('sub-ratings-list-container');
    subContainer.innerHTML = `
        <li>📍 Location: <span>🟢🟢🟢🟢🟢 5.0</span></li>
        <li>🧹 Cleanliness: <span>🟢🟢🟢🟢🟢 4.9</span></li>
        <li>🤵 Service: <span>🟢🟢🟢🟢🔘 4.8</span></li>
        <li>🪙 Value: <span>🟢🟢🟢🟢⚪ 4.2</span></li>
    `;

    // Render review cards
    const deck = document.getElementById('detail-reviews-cards-deck');
    deck.innerHTML = list.map(r => `
        <li class="review-card-li">
            <div class="review-card-header">
                <div class="reviewer-profile">
                    <img class="reviewer-avatar" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80" alt="Av">
                    <div>
                        <span class="reviewer-name">${r.author}</span>
                        <div class="reviewer-geo">Mumbai, India • 12 contributions</div>
                    </div>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:var(--text-muted);">
                    ${getBubbleRatingHtml(r.rating)}
                    <div style="margin-top:0.25rem;">Visited: ${r.date}</div>
                </div>
            </div>
            <strong style="font-size:0.95rem; display:block; margin-bottom:0.25rem;">${r.title}</strong>
            <p class="review-body-text">${r.body}</p>
            ${r.response ? `
                <div class="owner-response-box">
                    <strong>Response from Owner:</strong>
                    <p style="margin-top:0.25rem; font-style:italic;">"${r.response}"</p>
                </div>
            ` : ''}
        </li>
    `).join('');
}

function renderRestaurantReviewsPanel(name) {
    const list = getReviewsListForVenue(name);
    const deck = document.getElementById('rest-reviews-cards-deck');
    if (!deck) return;
    
    deck.innerHTML = list.map(r => `
        <li class="review-card-li">
            <div class="review-card-header">
                <div class="reviewer-profile">
                    <img class="reviewer-avatar" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" alt="Av">
                    <div>
                        <span class="reviewer-name">${r.author}</span>
                    </div>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:var(--text-muted);">
                    ${getBubbleRatingHtml(r.rating)}
                </div>
            </div>
            <strong>${r.title}</strong>
            <p class="review-body-text">${r.body}</p>
        </li>
    `).join('');
}

function renderExperienceReviewsPanel(name) {
    const list = getReviewsListForVenue(name);
    const deck = document.getElementById('exp-reviews-cards-deck');
    if (!deck) return;
    
    deck.innerHTML = list.map(r => `
        <li class="review-card-li">
            <div class="review-card-header">
                <div class="reviewer-profile">
                    <img class="reviewer-avatar" src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80" alt="Av">
                    <div>
                        <span class="reviewer-name">${r.author}</span>
                    </div>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:var(--text-muted);">
                    ${getBubbleRatingHtml(r.rating)}
                </div>
            </div>
            <strong>${r.title}</strong>
            <p class="review-body-text">${r.body}</p>
        </li>
    `).join('');
}

// Write a Review modal flows
function launchWriteReviewFlow() {
    if (!state.user) {
        openSigninModal();
        return;
    }
    
    // Reset review form inputs
    document.getElementById('review-form-headline').value = '';
    document.getElementById('review-form-body').value = '';
    document.getElementById('review-form-score-val').value = 5;
    document.getElementById('review-char-validation-label').textContent = '0 / 200 characters';
    document.getElementById('review-char-validation-warning').classList.add('hidden');
    setReviewFormBubbleScore(5);
    
    document.getElementById('write-review-modal').classList.remove('hidden');
}

function closeWriteReviewModal() {
    document.getElementById('write-review-modal').classList.add('hidden');
}

function setReviewFormBubbleScore(score) {
    document.getElementById('review-form-score-val').value = score;
    document.querySelectorAll('.bubble-selector-dot').forEach((dot, idx) => {
        if (idx < score) dot.classList.add('active');
        else dot.classList.remove('active');
    });
}

function handleReviewBodyTextInput(val) {
    const lbl = document.getElementById('review-char-validation-label');
    lbl.textContent = `${val.length} / 200 characters`;
    
    const warn = document.getElementById('review-char-validation-warning');
    if (val.length < 200) warn.classList.remove('hidden');
    else warn.classList.add('hidden');
}

function handleReviewFormSubmit(e) {
    e.preventDefault();
    const body = document.getElementById('review-form-body').value.trim();
    if (body.length < 200) {
        document.getElementById('review-char-validation-warning').classList.remove('hidden');
        return;
    }
    
    const score = parseInt(document.getElementById('review-form-score-val').value);
    const date = document.getElementById('review-form-date').value;
    const headline = document.getElementById('review-form-headline').value.trim();
    
    const newRev = {
        id: Date.now(),
        author: state.user.username,
        rating: score,
        date: date,
        title: headline,
        body: body,
        response: null
    };
    
    const venueName = state.checkoutItem?.name || "Taj Rambagh Palace";
    state.reviews[venueName] = state.reviews[venueName] || [];
    state.reviews[venueName].unshift(newRev); // add to top
    
    // Increment user contribution counts
    state.user.reviewsCount++;
    localStorage.setItem('ta_user', JSON.stringify(state.user));
    updateNavForUser();
    
    closeWriteReviewModal();
    
    // Refresh ratings view
    if (state.currentView === 'hotel-detail') renderReviewsPanelDetails(venueName);
    else if (state.currentView === 'restaurant-detail') renderRestaurantReviewsPanel(venueName);
    else if (state.currentView === 'experience-detail') renderExperienceReviewsPanel(venueName);
}

function simulatePhotoUploadPicker() {
    alert("Photo files dropzone trigger mock - selected photo added successfully!");
    document.getElementById('review-form-photo-val').value = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
}

// --- BOOKING CHECKOUT WIZARD FLOW ---
function triggerCheckoutFlow(type, optName = '') {
    const item = optName ? state.venues.hotel.find(h => h.name === optName) : state.checkoutItem;
    if (!item) return;
    
    state.checkoutItem = item;
    state.checkoutType = type;
    
    // Reset steps
    document.getElementById('checkout-step-1').classList.remove('hidden');
    document.getElementById('checkout-step-2').classList.add('hidden');
    document.getElementById('checkout-step-3').classList.add('hidden');
    
    document.getElementById('step-lbl-1').className = 'step-active';
    document.getElementById('step-lbl-2').className = '';
    document.getElementById('step-lbl-3').className = '';
    
    // If user logged in, fill info
    if (state.user) {
        document.getElementById('chk-email').value = state.user.email;
        document.getElementById('chk-fname').value = state.user.username;
    }
    
    document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

function handleCheckoutStep1Submit(e) {
    e.preventDefault();
    document.getElementById('checkout-step-1').classList.add('hidden');
    document.getElementById('checkout-step-2').classList.remove('hidden');
    
    document.getElementById('step-lbl-1').className = '';
    document.getElementById('step-lbl-2').className = 'step-active';
}

function handleCheckoutStep2Submit(e) {
    e.preventDefault();
    
    const cardholder = document.getElementById('chk-cardname').value;
    const refNum = `TA-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const costText = state.checkoutType === 'hotel' ? formatCost(state.checkoutItem.cost) : formatCost(state.checkoutItem.original_cost || 1500);
    
    document.getElementById('chk-receipt-username').textContent = cardholder;
    document.getElementById('chk-receipt-ref').textContent = refNum;
    document.getElementById('chk-receipt-title').textContent = state.checkoutItem.name;
    document.getElementById('chk-receipt-cost').textContent = costText;
    
    // Save to user saved itineraries list
    if (state.user) {
        state.user.savedTrips = state.user.savedTrips || [];
        state.user.savedTrips.push({
            id: refNum,
            title: `${state.currentCity || 'Jaipur'} Vacation Plan`,
            ref: refNum,
            hotelName: state.checkoutItem.name,
            cost: costText,
            date: new Date().toLocaleDateString()
        });
        localStorage.setItem('ta_user', JSON.stringify(state.user));
    }
    
    document.getElementById('checkout-step-2').classList.add('hidden');
    document.getElementById('checkout-step-3').classList.remove('hidden');
    
    document.getElementById('step-lbl-2').className = '';
    document.getElementById('step-lbl-3').className = 'step-active';
}

// --- TRAVEL FORUMS SYSTEM ---
function renderForumIndex() {
    const list = document.getElementById('forum-threads-container-list');
    if (!list) return;
    
    list.innerHTML = state.forumThreads.map(t => `
        <li class="forum-thread-row" onclick="openForumThread(${t.id})">
            <div class="forum-thread-info">
                <h4>${t.title}</h4>
                <div style="font-size:0.75rem; color:var(--text-muted);">Posted by ${t.author} in ${t.boardId.toUpperCase()} board • Date: ${t.date}</div>
            </div>
            <span class="thread-replies-badge">${t.replies.length} replies</span>
        </li>
    `).join('');
    
    // Filter boards sidebar
    const boardList = document.getElementById('forum-boards-list-container');
    boardList.innerHTML = state.forumBoards.map(b => `
        <li><a href="#" style="text-decoration:none; font-weight:600;" onclick="filterForumThreadsByBoard('${b.id}'); return false;">💬 ${b.name} (${b.posts} posts)</a></li>
    `).join('');
}

function filterForumThreadsByBoard(boardId) {
    const list = document.getElementById('forum-threads-container-list');
    const filtered = state.forumThreads.filter(t => t.boardId === boardId);
    
    if (filtered.length === 0) {
        list.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-muted);">No threads published in this board yet.</div>`;
        return;
    }
    
    list.innerHTML = filtered.map(t => `
        <li class="forum-thread-row" onclick="openForumThread(${t.id})">
            <div class="forum-thread-info">
                <h4>${t.title}</h4>
                <div style="font-size:0.75rem; color:var(--text-muted);">Posted by ${t.author} • Date: ${t.date}</div>
            </div>
            <span class="thread-replies-badge">${t.replies.length} replies</span>
        </li>
    `).join('');
}

function openForumThread(threadId, skipPushState = false) {
    state.activeThreadId = threadId;
    state.selectedThreadId = threadId;
    navigateToView('forum-thread', '', skipPushState);
    
    const thread = state.forumThreads.find(t => t.id === threadId);
    if (!thread) return;
    
    document.getElementById('thread-title-lbl').textContent = thread.title;
    document.getElementById('thread-author-lbl').textContent = thread.author;
    document.getElementById('thread-date-lbl').textContent = thread.date;
    
    const stream = document.getElementById('thread-posts-stream-container');
    stream.innerHTML = thread.replies.map((post, idx) => `
        <div style="background:#FFFFFF; border:1px solid var(--border); border-radius:12px; padding:1.25rem; display:flex; gap:1.25rem; ${idx > 0 ? 'margin-left:2rem;' : ''}">
            <div style="text-align:center; width:60px; flex:0 0 auto;">
                <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80" alt="Av" style="width:40px; height:40px; border-radius:50%;">
                <span style="font-size:0.7rem; font-weight:700; display:block; margin-top:0.25rem;">${post.author}</span>
            </div>
            <div style="flex:1; font-size:0.88rem; line-height:1.5; color:var(--text-secondary);">
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">Posted on ${post.date}</div>
                <p>${post.text}</p>
            </div>
        </div>
    `).join('');
}

function handlePostForumReply() {
    if (!state.user) {
        openSigninModal();
        return;
    }
    
    const body = document.getElementById('forum-reply-body').value.trim();
    if (!body) return;
    
    const thread = state.forumThreads.find(t => t.id === state.activeThreadId);
    if (!thread) return;
    
    thread.replies.push({
        author: state.user.username,
        date: new Date().toISOString().split('T')[0],
        text: body
    });
    
    document.getElementById('forum-reply-body').value = '';
    openForumThread(state.activeThreadId);
}

function launchCreateThreadFlow() {
    if (!state.user) {
        openSigninModal();
        return;
    }
    document.getElementById('forum-thread-title').value = '';
    document.getElementById('forum-thread-body').value = '';
    document.getElementById('forum-create-thread-modal').classList.remove('hidden');
}

function closeCreateThreadModal() {
    document.getElementById('forum-create-thread-modal').classList.add('hidden');
}

function handleCreateThreadSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('forum-thread-title').value.trim();
    const body = document.getElementById('forum-thread-body').value.trim();
    
    const newThread = {
        id: state.forumThreads.length + 1,
        boardId: 'jaipur',
        title: title,
        author: state.user.username,
        date: new Date().toISOString().split('T')[0],
        replies: [
            { author: state.user.username, date: new Date().toISOString().split('T')[0], text: body }
        ]
    };
    
    state.forumThreads.unshift(newThread);
    closeCreateThreadModal();
    renderForumIndex();
}

// --- USER PROFILE RENDERING ---
function renderUserProfilePage(subtab = 'contributions') {
    if (!state.user) {
        openSigninModal();
        return;
    }
    
    document.getElementById('profile-username-lbl').textContent = state.user.username;
    document.getElementById('profile-location-lbl').textContent = state.user.homeCity;
    document.getElementById('profile-stat-reviews').textContent = state.user.reviewsCount;
    document.getElementById('profile-stat-photos').textContent = state.user.photosCount;
    
    // Fill Edit Profile inputs
    document.getElementById('edit-profile-username').value = state.user.username;
    document.getElementById('edit-profile-location').value = state.user.homeCity;
    
    // Render My Reviews
    const revContainer = document.getElementById('profile-reviews-list-container');
    const userReviews = [];
    
    // Traverse local reviews databases for reviews written by the active user
    Object.keys(state.reviews).forEach(venueName => {
        state.reviews[venueName].forEach(r => {
            if (r.author === state.user.username) {
                userReviews.push({ ...r, venueName: venueName });
            }
        });
    });
    
    if (userReviews.length === 0) {
        revContainer.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-muted);">You haven't contributed any reviews yet. Click a property and write a review!</div>`;
    } else {
        revContainer.innerHTML = userReviews.map(r => `
            <li class="review-card-li" style="background:#FAF9F6; padding:1.25rem; border-radius:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.8rem; color:var(--text-secondary);">
                    <strong>🏢 ${r.venueName}</strong>
                    <span>Visited: ${r.date}</span>
                </div>
                ${getBubbleRatingHtml(r.rating)}
                <strong style="font-size:0.95rem; display:block; margin:0.4rem 0 0.25rem 0;">${r.title}</strong>
                <p class="review-body-text">${r.body}</p>
            </li>
        `).join('');
    }
    
    // Render Saved Trips
    const tripContainer = document.getElementById('profile-trips-list-container');
    const trips = state.user.savedTrips || [];
    if (trips.length === 0) {
        tripContainer.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-muted);">No saved trips yet. Book a stay or use the Optimizer Widget to plan a trip!</div>`;
    } else {
        tripContainer.innerHTML = trips.map(t => `
            <li style="background:#FFFFFF; border:1px solid var(--border); border-radius:12px; padding:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h4 style="font-size:1rem; margin-bottom:0.25rem;">${t.title}</h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">🏨 Hotel: ${t.hotelName}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">Booked: ${t.date} • Ref: ${t.ref}</div>
                </div>
                <strong style="font-size:1.15rem; color:var(--accent);">${t.cost}</strong>
            </li>
        `).join('');
    }
    
    switchProfileSubtab('profile-contributions');
}

function switchProfileSubtab(tabName) {
    document.querySelectorAll('[data-ptab]').forEach(btn => {
        if (btn.dataset.ptab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.querySelectorAll('.profile-tab-pane').forEach(pane => pane.classList.add('hidden'));
    document.getElementById(`${tabName}-pane`).classList.remove('hidden');
}

function toggleEditProfileForm() {
    document.getElementById('profile-edit-inline-box').classList.toggle('hidden');
}

function handleSaveProfileUpdate() {
    const newName = document.getElementById('edit-profile-username').value.trim();
    const newLoc = document.getElementById('edit-profile-location').value.trim();
    if (!newName) return;
    
    state.user.username = newName;
    state.user.homeCity = newLoc;
    
    localStorage.setItem('ta_user', JSON.stringify(state.user));
    updateNavForUser();
    renderUserProfilePage();
    toggleEditProfileForm();
}

// --- TRIP PLANS & TRIP SPLIT BUDGET OPTIMIZER WIDGETS ---
async function triggerDestTripOptimizer() {
    const budget = parseFloat(document.getElementById('dest-budget-input').value) || 30000;
    const days = parseInt(document.getElementById('dest-days-input').value) || 3;
    const people = parseInt(document.getElementById('dest-people-input').value) || 2;
    
    showPageLoader();
    try {
        const res = await fetch(`/api/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                city: state.currentCity,
                budget: budget,
                days: days,
                people: people,
                include_stay: true,
                include_transport: true,
                include_attractions: true,
                add_travel: false
            })
        });
        if (res.ok) {
            const data = await res.json();
            
            // Check if stop exists
            if (data.stops && data.stops.length > 0) {
                const stop = data.stops[0];
                
                // Show a successful modal dialog detailing the optimization split!
                const optimizedHotel = stop.hotel ? stop.hotel.name : "None recommended";
                const totalCost = formatCost(data.total_cost || budget);
                const splitCost = formatCost(data.cost_per_person || (budget/people));
                
                alert(`🎉 TripSplit Optimizer Result:\n\n- Recommended Lodging Choice: ${optimizedHotel}\n- Optimized Total Estimated Cost: ${totalCost}\n- Split Cost (Per Person): ${splitCost}\n\nWe have saved this optimal route in your profile saved trips!`);
                
                // Save optimized trip
                if (state.user) {
                    state.user.savedTrips = state.user.savedTrips || [];
                    const refNum = `TA-OPT-${Math.floor(1000 + Math.random() * 9000)}`;
                    state.user.savedTrips.push({
                        id: refNum,
                        title: `${state.currentCity} Optimized Split Itinerary`,
                        ref: refNum,
                        hotelName: optimizedHotel,
                        cost: splitCost + " / person",
                        date: new Date().toLocaleDateString()
                    });
                    localStorage.setItem('ta_user', JSON.stringify(state.user));
                    updateNavForUser();
                }
            }
        }
    } catch(e) {
        alert("Failed to connect to TripSplit optimizer backend solver. Running mock local solver instead...");
        alert(`🎉 TripSplit Optimizer Result:\n\n- Recommended Lodging Choice: Pearl Palace Heritage\n- Optimized Total Estimated Cost: ${formatCost(budget * 0.8)}\n- Split Cost (Per Person): ${formatCost((budget * 0.8)/people)}\n\nSaved to profile.`);
    } finally {
        hidePageLoader();
    }
}

// --- UTILITY STYLES RENDERERS ---
function getBubbleRatingHtml(stars) {
    const score = Math.min(5, Math.max(1, Math.round(stars)));
    let bubbles = "";
    for (let i = 0; i < 5; i++) {
        bubbles += `<span class="${i < score ? 'bubble-fill' : 'bubble-empty'}"></span>`;
    }
    return `<div class="tripadvisor-bubbles" title="${stars} bubbles">${bubbles}</div>`;
}

function getPlaceholderSvg(name) {
    const colors = ["4F46E5","0EA5E9","10B981","F59E0B","EF4444","8B5CF6","EC4899","06B6D4"];
    const hash = Math.abs(name.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
    const color = colors[hash % colors.length];
    const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#${color}" width="400" height="300" rx="8"/><text x="200" y="160" text-anchor="middle" fill="white" font-size="48" font-family="Arial,sans-serif" font-weight="bold">${initials}</text></svg>`)}`;
}

// Favorites local storage
function toggleFavoriteVenue(name, type, icon, lat, lon) {
    const idx = state.favorites.indexOf(name);
    if (idx > -1) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.push(name);
    }
    localStorage.setItem('ta_favorites', JSON.stringify(state.favorites));
}

// Favorites local storage check
function isVenueFavorite(name) {
    return state.favorites.includes(name);
}

// Global loaders helpers
function showPageLoader() {
    let loader = document.getElementById('global-page-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-page-loader';
        loader.style = 'position:fixed; top:0; bottom:0; left:0; right:0; background:rgba(255,255,255,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; flex-direction:column; font-weight:700; font-family:var(--font-heading);';
        loader.innerHTML = `<div style="border:4px solid #f3f3f3; border-top:4px solid var(--accent); border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin-bottom:1rem;"></div>Loading TripSplit databases...`;
        
        // Add animation stylesheet dynamically
        const style = document.createElement('style');
        style.innerHTML = `@keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }`;
        document.head.appendChild(style);
        
        document.body.appendChild(loader);
    }
    loader.classList.remove('hidden');
}

function hidePageLoader() {
    const loader = document.getElementById('global-page-loader');
    if (loader) loader.classList.add('hidden');
}

// --- FLOATING AI ASSISTANT CHATBOT LOGIC ---
function toggleFloatingChat() {
    document.getElementById('floating-chat-container').classList.toggle('hidden');
}

async function handleSendChatMessage() {
    const input = document.getElementById('assistant-chat-input');
    const query = input.value.trim();
    if (!query) return;
    
    input.value = '';
    
    // Append user message
    appendChatMessage(query, 'user');
    
    // Call backend assistant endpoint
    try {
        const res = await fetch('/api/assistant', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query,
                favorites: state.favorites
            })
        });
        if (res.ok) {
            const data = await res.json();
            appendChatMessage(data.response, 'assistant');
        } else {
            appendChatMessage("Sorry, I'm having trouble connecting to the travel advice servers right now. Please try again in a bit!", 'assistant');
        }
    } catch (err) {
        appendChatMessage("Sorry, I'm offline. Please make sure the backend Python server is running!", 'assistant');
    }
}

function handleChatInputKeyPress(e) {
    if (e.key === 'Enter') {
        handleSendChatMessage();
    }
}

function appendChatMessage(text, sender) {
    const box = document.getElementById('assistant-chat-box');
    if (!box) return;
    
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.textContent = text;
    box.appendChild(msg);
    
    // Scroll to bottom
    box.scrollTop = box.scrollHeight;
}

// --- GROUP EXPENSE SPLITTER LEDGER LOGIC ---
state.ledgerExpenses = JSON.parse(localStorage.getItem('ta_expenses') || '[]');
state.groupMembers = localStorage.getItem('ta_members') ? localStorage.getItem('ta_members').split(',') : ['Somya', 'Amit', 'Priya', 'Rohan'];

function initializeLedgerView() {
    // Fill Group Members input field
    const membersInput = document.getElementById('group-members-input');
    if (membersInput) {
        membersInput.value = state.groupMembers.join(', ');
    }
    
    // Populate Paid By Dropdown
    const paidBySelect = document.getElementById('exp-paid-by');
    if (paidBySelect) {
        paidBySelect.innerHTML = state.groupMembers.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    
    // Populate Split checkboxes
    const cboxes = document.getElementById('exp-split-checkboxes');
    if (cboxes) {
        cboxes.innerHTML = state.groupMembers.map(m => `
            <label style="display:flex; align-items:center; gap:0.25rem; font-size:0.78rem; font-weight:600; cursor:pointer;">
                <input type="checkbox" class="exp-splitter-cb" value="${m}" checked>
                <span>${m}</span>
            </label>
        `).join('');
    }
    
    // Render History & Balances
    renderLedgerHistoryList();
    calculateSettleUpLedger();
}

function handleGroupMembersChange(value) {
    const list = value.split(',').map(m => m.trim()).filter(m => m.length > 0);
    if (list.length === 0) return;
    
    state.groupMembers = list;
    localStorage.setItem('ta_members', list.join(','));
    initializeLedgerView();
}

function handleLogExpenseSubmit(e) {
    e.preventDefault();
    const desc = document.getElementById('exp-desc').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const paidBy = document.getElementById('exp-paid-by').value;
    
    const splitters = Array.from(document.querySelectorAll('.exp-splitter-cb:checked')).map(cb => cb.value);
    if (splitters.length === 0) {
        alert("Please select at least one person to split the expense between!");
        return;
    }
    
    const exp = {
        id: Date.now(),
        desc: desc,
        amount: amount,
        paidBy: paidBy,
        splitters: splitters
    };
    
    state.ledgerExpenses.push(exp);
    localStorage.setItem('ta_expenses', JSON.stringify(state.ledgerExpenses));
    
    // Reset Form fields
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    
    initializeLedgerView();
}

function handleDeleteExpense(id) {
    state.ledgerExpenses = state.ledgerExpenses.filter(e => e.id !== id);
    localStorage.setItem('ta_expenses', JSON.stringify(state.ledgerExpenses));
    initializeLedgerView();
}

function handleClearLedger() {
    state.ledgerExpenses = [];
    localStorage.removeItem('ta_expenses');
    initializeLedgerView();
}

function renderLedgerHistoryList() {
    const list = document.getElementById('ledger-history-list');
    if (!list) return;
    
    if (state.ledgerExpenses.length === 0) {
        list.innerHTML = `<li style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No bills logged in the ledger yet.</li>`;
        return;
    }
    
    list.innerHTML = state.ledgerExpenses.map(e => `
        <li style="border:1px solid var(--border); border-radius:8px; padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center; background:#FAF9F6; font-size:0.85rem;">
            <div>
                <strong>${e.desc}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                    Paid by <strong>${e.paidBy}</strong> • Split between: ${e.splitters.join(', ')}
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
                <strong style="color:var(--text-primary);">₹${e.amount.toLocaleString('en-IN')}</strong>
                <button onclick="handleDeleteExpense(${e.id})" style="color:#DC2626; font-weight:700; font-size:1.1rem; line-height:1;">&times;</button>
            </div>
        </li>
    `).join('');
}

function calculateSettleUpLedger() {
    const blist = document.getElementById('ledger-balances-list');
    const rlist = document.getElementById('ledger-resolutions-list');
    if (!blist || !rlist) return;
    
    // Initialize empty balances map
    const balances = {};
    state.groupMembers.forEach(m => balances[m] = 0);
    
    // Calculate net credit/debit for each person
    state.ledgerExpenses.forEach(e => {
        const share = e.amount / e.splitters.length;
        
        // Add full paid amount to payer credit balance
        if (balances[e.paidBy] !== undefined) {
            balances[e.paidBy] += e.amount;
        }
        
        // Subtract share from splitters debit balance
        e.splitters.forEach(s => {
            if (balances[s] !== undefined) {
                balances[s] -= share;
            }
        });
    });
    
    // Render balances list
    blist.innerHTML = Object.keys(balances).map(m => {
        const bal = balances[m];
        const color = bal > 0.01 ? '#00AA6C' : bal < -0.01 ? '#DC2626' : 'var(--text-muted)';
        const sign = bal > 0.01 ? '+' : '';
        return `
            <li style="display:flex; justify-content:space-between; border-bottom:1.5px dashed var(--border); padding-bottom:2px;">
                <span>${m}</span>
                <strong style="color:${color};">${sign}₹${Math.round(bal).toLocaleString('en-IN')}</strong>
            </li>
        `;
    }).join('');
    
    // Solve balances clearing using greedy match algorithm
    const debtors = [];
    const creditors = [];
    
    Object.keys(balances).forEach(m => {
        const bal = balances[m];
        if (bal < -0.05) {
            debtors.push({ name: m, balance: bal });
        } else if (bal > 0.05) {
            creditors.push({ name: m, balance: bal });
        }
    });
    
    const transactions = [];
    
    // Greedily match largest debtor to largest creditor
    let iterations = 0;
    while (debtors.length > 0 && creditors.length > 0 && iterations < 100) {
        iterations++;
        
        debtors.sort((a,b) => a.balance - b.balance); // largest debtor first (most negative)
        creditors.sort((a,b) => b.balance - a.balance); // largest creditor first (most positive)
        
        const d = debtors[0];
        const c = creditors[0];
        
        const clearAmt = Math.min(-d.balance, c.balance);
        
        transactions.push({
            from: d.name,
            to: c.name,
            amount: Math.round(clearAmt)
        });
        
        d.balance += clearAmt;
        c.balance -= clearAmt;
        
        if (Math.abs(d.balance) < 0.05) debtors.shift();
        if (Math.abs(c.balance) < 0.05) creditors.shift();
    }
    
    if (transactions.length === 0) {
        rlist.innerHTML = `<li style="color:var(--text-muted); font-size:0.8rem; font-weight:normal; text-align:center; padding:0.5rem 0;">Group is fully settled!</li>`;
        return;
    }
    
    rlist.innerHTML = transactions.map(t => `
        <li style="border:1.5px solid var(--accent); background:#FAFBF9; border-radius:6px; padding:0.4rem 0.75rem; margin-bottom:0.35rem; font-size:0.82rem;">
            💸 <strong>${t.from}</strong> owes <strong>${t.to}</strong>: <span style="font-size:0.9rem;">₹${t.amount.toLocaleString('en-IN')}</span>
        </li>
    `).join('');
}

