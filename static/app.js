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
    cityDataCache: {},
    loadedCity: '',
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

    // Optimization state
    lastPlanResult: null,
    activePlanType: "primary",

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
    { title: "Decent stay but expensive", text: "Nice rooms but the rates are quite high for the amenities provided. Breakfast menu could have more options.", rating: 3, author: "mark_travels", city: "Shimla" },
    { title: "Average hospitality", text: "The service was a bit slow. Had to call room service thrice for extra towels. Otherwise location is good.", rating: 3, author: "neha_g", city: "Mumbai" }
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
    setupHomeOptimizerAutocomplete();
    
    // Setup budget preview listeners
    const budgetInput = document.getElementById('opt-home-budget');
    const budgetTypeSelect = document.getElementById('opt-home-budget-type');
    const peopleInput = document.getElementById('opt-home-people');
    if (budgetInput) budgetInput.addEventListener('input', updateBudgetLivePreview);
    if (budgetTypeSelect) budgetTypeSelect.addEventListener('change', updateBudgetLivePreview);
    if (peopleInput) peopleInput.addEventListener('input', updateBudgetLivePreview);
    updateBudgetLivePreview();
    
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
        navigateToDestinationOverview(state.currentCity, 'India', true, urlParams.get('subtab') || 'dest-overview');
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
        const { viewId, param, currentCity, selectedCategory, selectedItemId, selectedThreadId, activeSubtab } = event.state;
        if (currentCity) state.currentCity = currentCity;
        if (selectedCategory) state.selectedCategory = selectedCategory;
        if (selectedItemId) state.selectedItemId = selectedItemId;
        if (selectedThreadId) state.selectedThreadId = selectedThreadId;
        if (activeSubtab) state.activeSubtab = activeSubtab;
        
        // Navigate accordingly
        if (viewId === 'destination' && state.currentCity) {
            navigateToDestinationOverview(state.currentCity, 'India', true, activeSubtab || 'dest-overview');
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

function ensureContentInOriginalView(category) {
    if (category === 'hotel') {
        const content = document.getElementById('hotel-results-view-content');
        const originalParent = document.getElementById('hotel-results-view');
        if (content && originalParent && content.parentNode !== originalParent) {
            originalParent.appendChild(content);
        }
    } else if (category === 'restaurant') {
        const content = document.getElementById('restaurant-results-view-content');
        const originalParent = document.getElementById('restaurant-results-view');
        if (content && originalParent && content.parentNode !== originalParent) {
            originalParent.appendChild(content);
        }
    } else if (category === 'experience') {
        const content = document.getElementById('experience-results-view-content');
        const originalParent = document.getElementById('experience-results-view');
        if (content && originalParent && content.parentNode !== originalParent) {
            originalParent.appendChild(content);
        }
    }
}

// --- ROUTER VIEW CONTROLLER ---
function navigateToView(viewId, param = '', skipPushState = false) {
    state.currentView = viewId;
    
    // Move result content sections back to root views to avoid subtab capture
    ensureContentInOriginalView('hotel');
    ensureContentInOriginalView('restaurant');
    ensureContentInOriginalView('experience');
    
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
        if (viewId === 'destination') {
            if (state.currentCity) url += '&city=' + encodeURIComponent(state.currentCity);
            if (state.activeSubtab) url += '&subtab=' + encodeURIComponent(state.activeSubtab);
        } else if (viewId === 'hotel-results' || viewId === 'restaurant-results' || viewId === 'experience-results') {
            if (state.currentCity) url += '&city=' + encodeURIComponent(state.currentCity);
            if (state.selectedCategory) url += '&cat=' + encodeURIComponent(state.selectedCategory);
        } else if (viewId === 'hotel-detail' || viewId === 'restaurant-detail' || viewId === 'experience-detail') {
            if (state.currentCity) url += '&city=' + encodeURIComponent(state.currentCity);
            if (state.selectedCategory) url += '&cat=' + encodeURIComponent(state.selectedCategory);
            if (state.selectedItemId) url += '&item=' + encodeURIComponent(state.selectedItemId);
        } else if (viewId === 'forum-thread') {
            if (state.selectedThreadId) url += '&thread=' + encodeURIComponent(state.selectedThreadId);
        } else if (param) {
            url += '&param=' + encodeURIComponent(param);
        }
        
        // Prevent duplicate history entries
        const currentState = window.history.state;
        const isSame = currentState && 
                       currentState.viewId === viewId && 
                       currentState.param === param && 
                       currentState.currentCity === (state.currentCity || '') && 
                       currentState.selectedCategory === (state.selectedCategory || '') && 
                       currentState.selectedItemId === (state.selectedItemId || '') && 
                       currentState.selectedThreadId === (state.selectedThreadId || '') &&
                       currentState.activeSubtab === (state.activeSubtab || 'dest-overview');
                       
        if (!isSame) {
            window.history.pushState({
                viewId: viewId,
                param: param,
                currentCity: state.currentCity || '',
                selectedCategory: state.selectedCategory || '',
                selectedItemId: state.selectedItemId || '',
                selectedThreadId: state.selectedThreadId || '',
                activeSubtab: state.activeSubtab || 'dest-overview'
            }, '', url);
        }
    }
}

function showCityPromptModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('city-prompt-modal');
        const input = document.getElementById('city-prompt-input');
        const cancelBtn = document.getElementById('city-prompt-cancel-btn');
        const submitBtn = document.getElementById('city-prompt-submit-btn');
        
        if (!modal || !input || !cancelBtn || !submitBtn) {
            const fallbackCity = prompt("Where are you going? Enter a city name:");
            resolve(fallbackCity);
            return;
        }
        
        input.value = "";
        modal.classList.remove('hidden');
        input.focus();
        
        const cleanUp = () => {
            modal.classList.add('hidden');
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            input.removeEventListener('keypress', handleKeyPress);
        };
        
        const handleSubmit = () => {
            const val = input.value.trim();
            cleanUp();
            resolve(val);
        };
        
        const handleCancel = () => {
            cleanUp();
            resolve(null);
        };
        
        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        input.addEventListener('keypress', handleKeyPress);
    });
}

// Navigates directly from pills/search into the category search pages
function navigateToCategoryResults(category, skipPushState = false) {
    if (category === 'flights' || category === 'cars' || category === 'cruises') {
        alert("✈️ Flights & 🚗 Rental Cars integrations are coming soon! Please check our Hotels, Restaurants, and Things to Do listings.");
        return;
    }

    state.selectedCategory = category;
    let city = state.currentCity;
    
    if (!city) {
        showCityPromptModal().then(customCity => {
            if (!customCity || !customCity.trim()) {
                // Redirect to homepage and focus the main search box
                navigateToView('home', '', skipPushState);
                const input = document.getElementById('global-search-input');
                if (input) {
                    input.focus();
                    input.placeholder = "Please type a destination to see listings...";
                    input.style.borderColor = "var(--accent)";
                    input.style.boxShadow = "0 0 0 3px rgba(124, 58, 237, 0.2)";
                    setTimeout(() => {
                        input.style.borderColor = "";
                        input.style.boxShadow = "";
                        input.placeholder = "Places to go, hotels, restaurants...";
                    }, 5000);
                }
                return;
            }
            state.currentCity = customCity.trim();
            navigateToCategoryResults(category, skipPushState);
        });
        return;
    }
    
    const catType = category === 'restaurants' ? 'restaurant' : category === 'attractions' ? 'experience' : 'hotel';
    ensureContentInOriginalView(catType);
    
    if (category === 'restaurants') {
        document.getElementById('rest-city-name-label').textContent = city;
        navigateToView('restaurant-results', '', skipPushState);
        loadCategoryResults('restaurant', city);
    } else if (category === 'attractions') {
        document.getElementById('exp-city-name-label').textContent = city;
        navigateToView('experience-results', '', skipPushState);
        loadCategoryResults('experience', city);
    } else {
        // Default stays/hotels
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

function escapeForOnclick(str) {
    if (!str) return '';
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
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
    const inputEl = document.getElementById('home-reccos-city-input');
    const city = inputEl ? inputEl.value.trim() : '';
    handleHomeReccosCityChange(city);
}

function renderHomepageHotels() {
    const inputEl = document.getElementById('home-hotels-city-input');
    const city = inputEl ? inputEl.value.trim() : '';
    handleHomeHotelsCityChange(city);
}

async function handleHomeReccosCityChange(city) {
    if (!city || typeof city !== 'string') {
        const inputEl = document.getElementById('home-reccos-city-input');
        city = inputEl ? inputEl.value.trim() : '';
    }
    city = city || 'Jaipur';
    
    const list = document.getElementById('experiences-deck');
    if (!list) return;
    
    list.innerHTML = `<div style="padding:2rem; text-align:center; width:100%; color:var(--text-muted);"><span class="spinner" style="display:inline-block; width:20px; height:20px; border-radius:50%; border:2px solid var(--border); border-top-color:var(--accent); animation:spin 1s linear infinite;"></span> Loading top experiences for ${city}...</div>`;
    
    try {
        const res = await fetch(`/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city: city })
        });
        if (res.ok) {
            const data = await res.json();
            const av = data.all_venues || data;
            const exps = av.attractions || [];
            
            if (exps.length > 0) {
                list.innerHTML = exps.slice(0, 15).map(item => {
                    const escName = escapeForOnclick(item.name);
                    return `
                        <li class="card-item-el" onclick="navigateToDetail('${escName}', 'experience')">
                            <div class="card-img-container" style="height:160px; background:#E5E7EB;">
                                <img src="${getVenuePhoto(item.name, 'experience')}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <div class="card-details" style="padding:0.75rem;">
                                <span class="card-category-label" style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:var(--text-muted);">${item.sub_type || 'experience'}</span>
                                <strong class="card-item-title" style="display:block; font-size:0.85rem; margin:0.2rem 0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</strong>
                                <div class="card-rating-row" style="margin-top:0.2rem;">
                                    ${getBubbleRatingHtml(item.stars || 4.5)}
                                    <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.25rem;">(120 reviews)</span>
                                </div>
                                <div class="card-price-row" style="font-weight:700; font-size:0.85rem; margin-top:0.35rem; color:var(--text-primary);">${item.original_cost === 0 ? "Free Entry" : 'from ₹' + (item.original_cost || 500).toLocaleString('en-IN')}</div>
                            </div>
                        </li>
                    `;
                }).join('');
                return;
            }
        }
    } catch(e) {
        console.error(e);
    }
    
    // Offline / fallback handler
    const fallbackExps = getFallbackExperiences(city);
    list.innerHTML = fallbackExps.slice(0, 4).map(item => {
        const escName = escapeForOnclick(item.name);
        return `
            <li class="card-item-el" onclick="navigateToDetail('${escName}', 'experience')">
                <div class="card-img-container" style="height:160px; background:#E5E7EB;">
                    <img src="${getVenuePhoto(item.name, 'experience')}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div class="card-details" style="padding:0.75rem;">
                    <span class="card-category-label" style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:var(--text-muted);">${item.sub_type || 'experience'}</span>
                    <strong class="card-item-title" style="display:block; font-size:0.85rem; margin:0.2rem 0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</strong>
                    <div class="card-rating-row" style="margin-top:0.2rem;">
                        ${getBubbleRatingHtml(item.stars || 4.5)}
                        <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.25rem;">(80 reviews)</span>
                    </div>
                    <div class="card-price-row" style="font-weight:700; font-size:0.85rem; margin-top:0.35rem; color:var(--text-primary);">${item.original_cost === 0 ? "Free Entry" : 'from ₹' + (item.original_cost || 500).toLocaleString('en-IN')}</div>
                </div>
            </li>
        `;
    }).join('');
}

async function handleHomeHotelsCityChange(city) {
    if (!city || typeof city !== 'string') {
        const inputEl = document.getElementById('home-hotels-city-input');
        city = inputEl ? inputEl.value.trim() : '';
    }
    city = city || 'Goa';
    
    const list = document.getElementById('personalized-hotels-grid');
    if (!list) return;
    
    list.innerHTML = `<div style="padding:2rem; text-align:center; width:100%; color:var(--text-muted);"><span class="spinner" style="display:inline-block; width:20px; height:20px; border-radius:50%; border:2px solid var(--border); border-top-color:var(--accent); animation:spin 1s linear/infinite;"></span> Loading popular stays for ${city}...</div>`;
    
    try {
        const res = await fetch(`/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city: city })
        });
        if (res.ok) {
            const data = await res.json();
            const av = data.all_venues || data;
            const hotels = av.hotels || [];
            
            if (hotels.length > 0) {
                list.innerHTML = hotels.slice(0, 10).map(item => {
                    const escName = escapeForOnclick(item.name);
                    return `
                        <div class="card-item-el" onclick="navigateToDetail('${escName}', 'hotel')">
                            <div class="card-img-container" style="height:160px; background:#E5E7EB;">
                                <img src="${getVenuePhoto(item.name, 'hotel')}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <div class="card-details" style="padding:0.75rem;">
                                <span class="card-category-label" style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:var(--text-muted);">${item.sub_type || 'hotel'}</span>
                                <strong class="card-item-title" style="display:block; font-size:0.85rem; margin:0.2rem 0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</strong>
                                <div class="card-rating-row" style="margin-top:0.2rem;">
                                    ${getBubbleRatingHtml(item.stars || 4.5)}
                                    <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.25rem;">(230 reviews)</span>
                                </div>
                                <div class="card-price-row" style="font-weight:700; font-size:0.85rem; margin-top:0.35rem; color:var(--text-primary);">from ₹${(item.cost || 8000).toLocaleString('en-IN')} / night</div>
                            </div>
                        </div>
                    `;
                }).join('');
                return;
            }
        }
    } catch(e) {
        console.error(e);
    }
    
    // Offline / fallback handler
    const fallbackHotels = getFallbackHotels(city);
    list.innerHTML = fallbackHotels.slice(0, 3).map(item => {
        const escName = escapeForOnclick(item.name);
        return `
            <div class="card-item-el" onclick="navigateToDetail('${escName}', 'hotel')">
                <div class="card-img-container" style="height:160px; background:#E5E7EB;">
                    <img src="${getVenuePhoto(item.name, 'hotel')}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div class="card-details" style="padding:0.75rem;">
                    <span class="card-category-label" style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:var(--text-muted);">${item.sub_type || 'hotel'}</span>
                    <strong class="card-item-title" style="display:block; font-size:0.85rem; margin:0.2rem 0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.name}</strong>
                    <div class="card-rating-row" style="margin-top:0.2rem;">
                        ${getBubbleRatingHtml(item.stars || 4.5)}
                        <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.25rem;">(140 reviews)</span>
                    </div>
                    <div class="card-price-row" style="font-weight:700; font-size:0.85rem; margin-top:0.35rem; color:var(--text-primary);">from ₹${(item.cost || 8000).toLocaleString('en-IN')} / night</div>
                </div>
            </div>
        `;
    }).join('');
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
        
        const items = [
            { type: 'dest', label: 'Jaipur', sub: 'Rajasthan, India' },
            { type: 'dest', label: 'Goa', sub: 'India' },
            { type: 'dest', label: 'Delhi', sub: 'National Capital Territory, India' },
            { type: 'dest', label: 'Mumbai', sub: 'Maharashtra, India' },
            { type: 'dest', label: 'Shimla', sub: 'Himachal Pradesh, India' },
            { type: 'dest', label: 'Manali', sub: 'Himachal Pradesh, India' }
        ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
        
        let htmlContent = '';
        if (items.length > 0) {
            htmlContent = `
                <div class="autocomplete-group-title">Destinations</div>
                ${items.map(item => `
                    <div class="autocomplete-item" onclick="selectAutocompleteDest('${item.label.replace(/'/g, "\\'")}', '${item.sub.replace(/'/g, "\\'")}')">
                        <span class="item-icon">📍</span>
                        <div>
                            <span class="item-name">${item.label}</span>
                            <div class="item-sub">${item.sub}</div>
                        </div>
                    </div>
                `).join('')}
            `;
        }
        
        // Add a clickable search option for the custom query
        const queryEscaped = query.replace(/'/g, "\\'");
        htmlContent += `
            <div class="autocomplete-item" onclick="selectAutocompleteDest('${queryEscaped}', '')" style="border-top:1px solid var(--border);">
                <span class="item-icon">🔍</span>
                <div>
                    <span class="item-name" style="color:var(--accent);">Search for "${query}"</span>
                    <div class="item-sub">Explore custom location</div>
                </div>
            </div>
        `;
        dropdown.innerHTML = htmlContent;
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
async function navigateToDestinationOverview(city, country = "India", skipPushState = false, subtab = 'dest-overview') {
    if (country === "India") {
        country = getCountryForCity(city);
    }
    state.currentCity = city;
    state.activeSubtab = subtab;
    navigateToView('destination', '', skipPushState);
    
    // Populate header photo based on city
    const cityImgs = {
        'jaipur': 'https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80',
        'goa': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        'mumbai': 'https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=1200&q=80',
        'delhi': 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80'
    };
    let heroImg = cityImgs[city.toLowerCase()] || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80";
    
    document.getElementById('city-hero-banner-el').style.backgroundImage = `linear-gradient(transparent, rgba(0,0,0,0.6)), url('${heroImg}')`;
    document.getElementById('city-title-heading').textContent = city.toUpperCase();
    document.getElementById('city-country-heading').textContent = country;
    
    // Switch to specified subtab
    switchDestSubtab(subtab);
    
    // Seasonal Warning Check
    if (typeof checkSeasonalWarning === "function") {
        checkSeasonalWarning(city);
    }
    
    const cityKey = city.toLowerCase().trim();
    if (state.cityDataCache && state.cityDataCache[cityKey]) {
        const cached = state.cityDataCache[cityKey];
        state.venues.hotel = cached.hotels;
        state.venues.restaurant = cached.restaurants;
        state.venues.experience = cached.experiences;
        state.loadedCity = cityKey;
        
        // Build descriptions
        const blurbEl = document.getElementById('dest-overview-blurb');
        if (blurbEl) {
            blurbEl.textContent = `${capitalizeFirstLetter(city)} is one of the most visited and iconic destinations in ${country}. Famous for its rich history, cultural landmarks, outstanding hospitality, and exquisite local cuisines. Plan and split budgets here seamlessly!`;
        }
        
        const forumTitle = document.getElementById('forum-city-title');
        const forumDesc = document.getElementById('forum-city-desc');
        if (forumTitle) forumTitle.textContent = `${capitalizeFirstLetter(city)} Travel Forum`;
        if (forumDesc) forumDesc.textContent = `Connect with real travelers planning trips to ${capitalizeFirstLetter(city)}. Ask about transport, local weather, and hidden gems!`;
        
        renderSampleLists();
        
        if (state.homeOptPending) {
            const pending = state.homeOptPending;
            state.homeOptPending = null;
            document.getElementById('dest-budget-input').value = pending.budget;
            document.getElementById('dest-days-input').value = pending.days;
            document.getElementById('dest-people-input').value = pending.people;
            runTripPlannerOptimization(pending);
        }
        return;
    }
    
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
            const av = data.all_venues || data;
            state.venues.hotel = av.hotels || [];
            state.venues.restaurant = av.restaurants || [];
            state.venues.experience = av.attractions || [];
            
            // If they are empty, fall back
            if (state.venues.hotel.length === 0) state.venues.hotel = getFallbackHotels(city);
            if (state.venues.restaurant.length === 0) state.venues.restaurant = getFallbackRestaurants(city);
            if (state.venues.experience.length === 0) state.venues.experience = getFallbackExperiences(city);
            
            // Cache them
            state.cityDataCache = state.cityDataCache || {};
            state.cityDataCache[cityKey] = {
                hotels: [...state.venues.hotel],
                restaurants: [...state.venues.restaurant],
                experiences: [...state.venues.experience]
            };
            state.loadedCity = cityKey;
        } else {
            // API non-ok, load fallbacks directly
            populateFallbackVenues(city);
            state.loadedCity = cityKey;
        }
        
        // Build descriptions
        const blurbEl = document.getElementById('dest-overview-blurb');
        if (blurbEl) {
            blurbEl.textContent = `${capitalizeFirstLetter(city)} is one of the most visited and iconic destinations in ${country}. Famous for its rich history, cultural landmarks, outstanding hospitality, and exquisite local cuisines. Plan and split budgets here seamlessly!`;
        }
        
        // Update forum teaser with city name
        const forumTitle = document.getElementById('forum-city-title');
        const forumDesc = document.getElementById('forum-city-desc');
        if (forumTitle) forumTitle.textContent = `${capitalizeFirstLetter(city)} Travel Forum`;
        if (forumDesc) forumDesc.textContent = `Connect with real travelers planning trips to ${capitalizeFirstLetter(city)}. Ask about transport, local weather, and hidden gems!`;
        
        // Render sample lists
        renderSampleLists();

        // Trigger pending home budget optimization if requested
        if (state.homeOptPending) {
            const pending = state.homeOptPending;
            state.homeOptPending = null;
            
            document.getElementById('dest-budget-input').value = pending.budget;
            document.getElementById('dest-days-input').value = pending.days;
            document.getElementById('dest-people-input').value = pending.people;
            
            runTripPlannerOptimization(pending);
        }
    } catch (err) {
        populateFallbackVenues(city);
        state.loadedCity = cityKey;
        renderSampleLists();
        if (state.homeOptPending) {
            const pending = state.homeOptPending;
            state.homeOptPending = null;
            document.getElementById('dest-budget-input').value = pending.budget;
            document.getElementById('dest-days-input').value = pending.days;
            document.getElementById('dest-people-input').value = pending.people;
            runTripPlannerOptimization(pending);
        }
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
    } else if (tabName === 'dest-plan') {
        document.getElementById('dest-plan-tab').classList.remove('hidden');
        if (state.lastPlanResult) {
            renderPlanItinerary(state.lastPlanResult);
        }
    } else if (tabName === 'dest-hotels') {
        document.getElementById('dest-hotels-tab').classList.remove('hidden');
        renderTabbedSearchView('hotel');
    } else if (tabName === 'dest-restaurants') {
        document.getElementById('dest-restaurants-tab').classList.remove('hidden');
        renderTabbedSearchView('restaurant');
    } else if (tabName === 'dest-attractions') {
        document.getElementById('dest-attractions-tab').classList.remove('hidden');
        renderTabbedSearchView('experience');
    }
    
    // Update history state and URL query string to preserve active subtab
    const currentState = window.history.state;
    if (currentState && currentState.viewId === 'destination') {
        const url = `?view=destination&city=${encodeURIComponent(state.currentCity)}&subtab=${encodeURIComponent(tabName)}`;
        window.history.replaceState({
            ...currentState,
            activeSubtab: tabName
        }, '', url);
    }
}

// Fallback arrays to guarantee presentation results for college assignment
function populateFallbackVenues(city) {
    state.venues.hotel = getFallbackHotels(city);
    state.venues.restaurant = getFallbackRestaurants(city);
    state.venues.experience = getFallbackExperiences(city);
}

function renderSampleLists() {
    if (state.venues.experience) {
        state.venues.experience.sort((a, b) => {
            const costA = a.original_cost === undefined ? (a.cost || 0) : a.original_cost;
            const costB = b.original_cost === undefined ? (b.cost || 0) : b.original_cost;
            if (costA === 0 && costB !== 0) return -1;
            if (costA !== 0 && costB === 0) return 1;
            return 0;
        });
    }
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
        const escName = escapeForOnclick(item.name);
        
        let costLabel = `₹${item.cost ? item.cost.toLocaleString('en-IN') : '0'}`;
        let nameWithBadge = item.name;
        if (type === 'experience') {
            costLabel = item.original_cost === 0 ? "Free Entry" : `₹${item.original_cost}`;
            if (item.original_cost === 0 || item.cost === 0) {
                nameWithBadge += `<span style="background:#10B981; color:#fff; font-size:0.65rem; font-weight:800; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FREE</span>`;
            }
        }
        
        return `
            <div class="card-item-el" onclick="navigateToDetail('${escName}', '${type}')">
                <div class="card-img-container">
                    <img src="${getVenuePhoto(item.name, type, state.currentCity)}" alt="${item.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${escName}', '${type}', '', ${item.lat}, ${item.lon}); this.innerHTML = isVenueFavorite('${escName}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="card-details">
                    <span class="card-category-label">${item.sub_type || type}</span>
                    <strong class="card-item-title">${nameWithBadge}</strong>
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
        const content = document.getElementById('hotel-results-view-content');
        if (container && content && content.parentNode !== container) {
            container.innerHTML = '';
            container.appendChild(content);
        }
        document.getElementById('results-city-name-label').textContent = state.currentCity;
        loadCategoryResults('hotel', state.currentCity);
    } else if (category === 'restaurant') {
        const container = document.getElementById('dest-restaurants-tab');
        const content = document.getElementById('restaurant-results-view-content');
        if (container && content && content.parentNode !== container) {
            container.innerHTML = '';
            container.appendChild(content);
        }
        document.getElementById('rest-city-name-label').textContent = state.currentCity;
        loadCategoryResults('restaurant', state.currentCity);
    } else if (category === 'experience') {
        const container = document.getElementById('dest-attractions-tab');
        const content = document.getElementById('experience-results-view-content');
        if (container && content && content.parentNode !== container) {
            container.innerHTML = '';
            container.appendChild(content);
        }
        document.getElementById('exp-city-name-label').textContent = state.currentCity;
        loadCategoryResults('experience', state.currentCity);
    }
}

// --- FILTERING & SEARCH RESULTS LISTS ---
function loadCategoryResults(type, city) {
    const cityKey = city.toLowerCase().trim();
    if (state.loadedCity !== cityKey) {
        if (state.cityDataCache && state.cityDataCache[cityKey]) {
            const cached = state.cityDataCache[cityKey];
            state.venues.hotel = cached.hotels;
            state.venues.restaurant = cached.restaurants;
            state.venues.experience = cached.experiences;
        } else {
            populateFallbackVenues(city);
            // Cache fallback
            state.cityDataCache = state.cityDataCache || {};
            state.cityDataCache[cityKey] = {
                hotels: [...state.venues.hotel],
                restaurants: [...state.venues.restaurant],
                experiences: [...state.venues.experience]
            };
        }
        state.loadedCity = cityKey;
    }
    // Sync current lists to filtered lists
    state.filteredVenues[type] = [...state.venues[type]];
    
    // Sort & Render
    applySearchFilters(type);
}

function applySearchFilters(type) {
    let source = [...state.venues[type]];
    
    // Resolve current sort dropdown selection
    let sortVal = 'recommended';
    if (type === 'hotel') {
        sortVal = document.getElementById('results-sort-select')?.value || 'recommended';
    } else if (type === 'restaurant') {
        sortVal = document.getElementById('rest-sort-select')?.value || 'recommended';
    } else if (type === 'experience') {
        sortVal = document.getElementById('exp-sort-select')?.value || 'recommended';
    }

    if (sortVal === 'cost_asc') {
        source.sort((a, b) => (a.cost || a.original_cost || 0) - (b.cost || b.original_cost || 0));
    } else if (sortVal === 'cost_desc') {
        source.sort((a, b) => (b.cost || b.original_cost || 0) - (a.cost || a.original_cost || 0));
    } else if (sortVal === 'rating') {
        source.sort((a, b) => (b.stars || b.rating || 4.5) - (a.stars || a.rating || 4.5));
    } else {
        // Recommend by rating (high to low) and budget (low to high), placing FREE items first for experiences
        source.sort((a, b) => {
            if (type === 'experience') {
                const costA = a.original_cost === undefined ? (a.cost || 0) : a.original_cost;
                const costB = b.original_cost === undefined ? (b.cost || 0) : b.original_cost;
                if (costA === 0 && costB !== 0) return -1;
                if (costA !== 0 && costB === 0) return 1;
            }
            const ratingA = a.stars || a.rating || 4.0;
            const ratingB = b.stars || b.rating || 4.0;
            if (ratingB !== ratingA) {
                return ratingB - ratingA;
            }
            const costA = a.cost || a.original_cost || 0;
            const costB = b.cost || b.original_cost || 0;
            return costA - costB;
        });
    }
    
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
            source = source.filter(r => {
                const nameL = r.name.toLowerCase();
                const subL = (r.sub_type || 'restaurant').toLowerCase();
                return checkedCuisines.some(c => {
                    if (c === 'indian') {
                        return subL === 'indian' || nameL.includes('dhaba') || nameL.includes('mishthan') || nameL.includes('bhandar') || nameL.includes('resort') || nameL.includes('dining') || (!nameL.includes('cafe') && !nameL.includes('pizza') && !nameL.includes('chinese'));
                    }
                    if (c === 'cafe') {
                        return subL === 'cafe' || nameL.includes('cafe') || nameL.includes('coffee') || nameL.includes('bakery') || nameL.includes('bake');
                    }
                    if (c === 'chinese') {
                        return subL === 'chinese' || nameL.includes('chinese') || nameL.includes('wok') || nameL.includes('noodle') || nameL.includes('asian');
                    }
                    if (c === 'italian') {
                        return subL === 'italian' || nameL.includes('pizza') || nameL.includes('pasta') || nameL.includes('italian');
                    }
                    return false;
                });
            });
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
    
    // Sort hotels so that hostels are at the top
    const hotels = [...state.filteredVenues.hotel];
    const isHostel = (name) => {
        const n = name.toLowerCase();
        return n.includes("hostel") || n.includes("zostel") || n.includes("backpack") || n.includes("dorm") || n.includes("bunk");
    };
    
    hotels.sort((a, b) => {
        const isAHostel = isHostel(a.name);
        const isBHostel = isHostel(b.name);
        if (isAHostel && !isBHostel) return -1;
        if (!isAHostel && isBHostel) return 1;
        return 0;
    });

    document.getElementById('results-count-label').textContent = `Showing ${hotels.length} stays`;
    
    if (hotels.length === 0) {
        list.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--text-muted);">No stays match your active filter selections. Try clearing filters.</div>`;
        return;
    }
    
    list.innerHTML = hotels.map(h => {
        const isHearted = isVenueFavorite(h.name);
        const heartIcon = isHearted ? "❤️" : "🤍";
        const escName = escapeForOnclick(h.name);
        
        const isBackpacker = isHostel(h.name);
        const backpackerTag = isBackpacker ? `<span style="background:#8B5CF6; color:#FFF; font-size:0.68rem; font-weight:800; padding:0.15rem 0.4rem; border-radius:4px; margin-left:0.5rem; display:inline-block; vertical-align:middle;">🎒 Backpacker Friendly</span>` : '';
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${escName}', 'hotel')">
                <div class="row-card-img">
                    <img src="${getVenuePhoto(h.name, 'hotel', h.city || state.currentCity)}" alt="${h.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${escName}', 'hotel', '', ${h.lat}, ${h.lon}); this.innerHTML = isVenueFavorite('${escName}') ? '❤️' : '🤍';">${heartIcon}</button>
                </div>
                <div class="row-card-content">
                    <div>
                        <h4 style="font-size:1.1rem; margin-bottom:0.25rem; display:flex; align-items:center; flex-wrap:wrap;">
                            <span>${h.name}</span>
                            ${backpackerTag}
                        </h4>
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
                    <button class="view-deal-btn" onclick="event.stopPropagation(); openPartnerComparisonDrawer('${escName}')">View Deal</button>
                    <a href="#" class="compare-prices-link" style="font-size:0.72rem; margin-top:0.4rem; text-decoration:none;" onclick="event.stopPropagation(); openPartnerComparisonDrawer('${escName}')">Compare 4 prices</a>
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
        const escName = escapeForOnclick(r.name);
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${escName}', 'restaurant')">
                <div class="row-card-img" style="width:200px;">
                    <img src="${getVenuePhoto(r.name, 'restaurant', r.city || state.currentCity)}" alt="${r.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${escName}', 'restaurant', '', ${r.lat}, ${r.lon}); this.innerHTML = isVenueFavorite('${escName}') ? '❤️' : '🤍';">${heartIcon}</button>
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
        const escName = escapeForOnclick(e.name);
        
        return `
            <div class="row-card-item" onclick="navigateToDetail('${escName}', 'experience')">
                <div class="row-card-img" style="width:200px;">
                    <img src="${getVenuePhoto(e.name, 'experience', e.city || state.currentCity)}" alt="${e.name}">
                    <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${escName}', 'experience', '', ${e.lat}, ${e.lon}); this.innerHTML = isVenueFavorite('${escName}') ? '❤️' : '🤍';">${heartIcon}</button>
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
    applySearchFilters(type);
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
    const cityCap = capitalizeFirstLetter(state.currentCity || 'Delhi');
    
    // Update breadcrumbs
    document.querySelectorAll('.back-city-name-lbl').forEach(el => {
        el.textContent = cityCap;
    });

    const isInd = isIndianCity(state.currentCity);
    state.selectedItemId = name;
    state.selectedCategory = category;

    // Find the item details in list caches
    let item = state.venues[category].find(v => v.name === name);
    if (!item) {
        // Check if it's a famous homepage recommendation
        const FAMOUS_PLACES_COORDINATES = {
            "jaipur tuktuk street food guided safari": { lat: 26.9124, lon: 75.7873, city: "Jaipur", country: "India" },
            "private taj mahal day trip by gatimaan express train": { lat: 27.1751, lon: 78.0421, city: "Agra", country: "India" },
            "old delhi spice market & rickshaw ride heritage walk": { lat: 28.6562, lon: 77.2309, city: "Delhi", country: "India" },
            "amber palace elephants sanctuary eco tour": { lat: 26.9856, lon: 75.8512, city: "Jaipur", country: "India" },
            "taj rambagh palace jaipur": { lat: 26.8981, lon: 75.8122, city: "Jaipur", country: "India" },
            "umaid bhawan palace jodhpur": { lat: 26.2798, lon: 73.0482, city: "Jodhpur", country: "India" },
            "trident hotel udaipur": { lat: 24.5764, lon: 73.6738, city: "Udaipur", country: "India" }
        };
        const matchKey = name.toLowerCase().trim();
        const coordData = FAMOUS_PLACES_COORDINATES[matchKey];
        
        let fallbackLat = 28.6139; // Delhi center default instead of Jaipur
        let fallbackLon = 77.2090;
        let fallbackCity = state.currentCity || "Delhi";
        
        if (coordData) {
            fallbackLat = coordData.lat;
            fallbackLon = coordData.lon;
            fallbackCity = coordData.city;
            state.currentCity = coordData.city;
        } else if (state.currentCity) {
            const cityLookup = {
                'jaipur': { lat: 26.9124, lon: 75.7873 },
                'goa': { lat: 15.3005, lon: 74.0855 },
                'delhi': { lat: 28.6139, lon: 77.2090 },
                'mumbai': { lat: 18.9750, lon: 72.8258 }
            };
            const cKey = state.currentCity.toLowerCase().trim();
            if (cityLookup[cKey]) {
                fallbackLat = cityLookup[cKey].lat;
                fallbackLon = cityLookup[cKey].lon;
            }
        }
        
        // Build mock properties if not found
        item = {
            name: name,
            cost: 14000,
            original_cost: 1500,
            stars: 4.8,
            sub_type: category === 'hotel' ? 'Luxury Stay' : category === 'restaurant' ? 'Cafe & Dining' : 'Sights & Tour',
            lat: fallbackLat,
            lon: fallbackLon,
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
        document.getElementById('detail-hotel-address').textContent = addressFallback || item.address || `${item.name} Central Area, ${cityCap}`;
        
        // Description
        document.getElementById('detail-overview-description').textContent = item.enrichment?.description || `${item.name} offers travelers a comfortable, premium stay inside modern rooms and suites. It features outstanding service, signature amenities, and premium dining options.`;
        
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
        document.getElementById('detail-rest-address').textContent = addressFallback || item.address || `${item.name} Bazaar, ${cityCap}`;
        document.getElementById('detail-rest-cuisine-label').textContent = item.sub_type ? item.sub_type.toUpperCase() : (isInd ? 'INDIAN TRADITIONAL' : 'CONTINENTAL');
        
        document.getElementById('detail-rest-overview-description').textContent = `${item.name} is one of the most popular dining destinations in this area. It specializes in delicious local signature dishes and drinks.`;
        
        // Menu list
        const mlist = document.getElementById('rest-signature-dishes-list');
        if (isInd) {
            mlist.innerHTML = `
                <li>✔️ Special Maharaja Thali (Keri Sangri, Dal Bati) — <strong>₹450</strong></li>
                <li>✔️ Crispy Pyaaz Kachori (Heritage recipe) — <strong>₹90</strong></li>
                <li>✔️ Kesar Lassi (Sweet saffron curd drink) — <strong>₹120</strong></li>
            `;
        } else {
            mlist.innerHTML = `
                <li>✔️ Chef's Signature Steak & Fries — <strong>₹1,450</strong></li>
                <li>✔️ Crispy Chicken Caesar Salad — <strong>₹850</strong></li>
                <li>✔️ Classic Lemon Mint Iced Tea — <strong>₹250</strong></li>
            `;
        }
        
        // Amenities
        const amens = document.getElementById('detail-rest-amenities-strip');
        amens.innerHTML = `
            <span class="amenity-pill-icon">${isInd ? '🌿 Vegetarian Options' : '🥩 Premium Cuts'}</span>
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
        document.getElementById('detail-exp-address').textContent = addressFallback || item.address || `${item.name} Gates, ${cityCap}`;
        
        document.getElementById('detail-exp-overview-description').textContent = `${item.name} offers tourists a magnificent, historic look into legacy buildings, watchtowers, and stunning architecture. Hire local guides for details.`;
        
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
    
    // TripAdvisor dynamic gallery photos based on type pools
    const hotelPool = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1582719478250-c89cae4db85b?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=400&q=80"
    ];
    const restPool = [
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80"
    ];
    const expPool = [
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1508349937151-22b68b72d5b1?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1603262110263-fb0112e7cc33?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=400&q=80"
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    
    let pool = expPool;
    if (containerId.startsWith('hotel')) pool = hotelPool;
    else if (containerId.startsWith('rest')) pool = restPool;
    
    const startIdx = hash % (pool.length - 4);
    const imgs = pool.slice(startIdx, startIdx + 5);
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

function showLoader(msg) {
  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loader-text");
  if (loader && loaderText) {
    loader.style.display = "block";
    loaderText.textContent = msg;
  }
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.display = "none";
  }
}

function renderPlan(data) {
  if (!data || data.status === "failed" || data.status === "exceeded" || !data.success || !data.options || data.options.length === 0) {
    const dataDiv = document.getElementById("plan-data");
    const placeholder = document.getElementById("plan-placeholder");
    if (placeholder) placeholder.classList.add("hidden");
    if (dataDiv) {
        dataDiv.classList.remove("hidden");
        dataDiv.innerHTML = `
          <div style="text-align:center; padding:2rem; color:#888;">
            <h3>😕 Couldn't build a plan</h3>
            <p>${data?.message || "No venues found for this city. Try a different destination or increase your budget."}</p>
          </div>
        `;
    }
    return false;
  }
  return true;
}

// --- TRIP PLANS & TRIP SPLIT BUDGET OPTIMIZER WIDGETS ---
async function runTripPlannerOptimization(params) {
    showLoader("Finding best hotels, meals & attractions...");
    try {
        const reqBudget = params.budgetType === "per_person" ? (params.budget * params.people) : params.budget;
        const res = await fetch(`/api/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                city: params.destination,
                budget: reqBudget,
                days: params.days,
                people: params.people,
                origin_city: params.origin || "Delhi",
                add_travel: true,
                travel_mode: params.transport === "flexible" ? "train_3ac" : (params.transport || "train_3ac"),
                budget_type: "total",
                travel_month: params.month || "August",
                pace: params.pace || "balanced",
                transport_pref: params.transport || "flexible",
                accommodation_pref: params.stayType || "flexible",
                interests: params.interests || "no preference"
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            if (!renderPlan(data)) {
                return;
            }
            // Store options
            state.tripOptions = data.options;
                state.selectedOptionIndex = 0; // Default to Best Overall
                state.originalBudgetLimit = params.budget;
                state.originalBudgetType = params.budgetType || "total";
                state.originalPeopleCount = params.people;
                state.originalDaysCount = params.days;
                state.currentCity = data.city;
                
                // Show plan tab & data
                const placeholder = document.getElementById("plan-placeholder");
                const dataDiv = document.getElementById("plan-data");
                if (placeholder) placeholder.classList.add("hidden");
                if (dataDiv) dataDiv.classList.remove("hidden");
                
                // Set slider value
                const slider = document.getElementById("tripsplit-budget-slider");
                if (slider) {
                    slider.value = params.budget;
                    document.getElementById("slider-budget-label").textContent = `₹${params.budget.toLocaleString('en-IN')}`;
                }
                
                // Initialize map
                initializeItineraryMap();
                
                // Render chosen option
                renderSelectedTripOption();
                
                // Switch to plan tab
                switchDestSubtab('dest-plan');
        } else {
            const errText = await res.text();
            renderPlan({ success: false, status: "failed", message: errText || "Backend optimizer failed." });
        }
    } catch(e) {
        console.error(e);
        renderPlan({ success: false, status: "failed", message: "Failed to connect to TripSplit optimizer backend solver." });
    } finally {
        hideLoader();
    }
}

function initializeItineraryMap() {
    if (state.itineraryMap) {
        try {
            state.itineraryMap.remove();
        } catch(e) {
            console.warn("Error removing previous itinerary map instance:", e);
        }
        state.itineraryMap = null;
    }
    
    const mapContainer = document.getElementById('itinerary-leaflet-map');
    if (!mapContainer) return;
    
    state.itineraryMap = L.map('itinerary-leaflet-map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.itineraryMap);
    
    state.itineraryMarkers = [];
    state.itineraryRouteLine = null;
    
    setTimeout(() => {
        if (state.itineraryMap) {
            state.itineraryMap.invalidateSize();
        }
    }, 200);
}

function plotPinsOnItineraryMap(opt) {
    if (!state.itineraryMap) return;
    
    if (!state.itineraryMarkers) {
        state.itineraryMarkers = [];
    }
    
    // Clear previous markers
    state.itineraryMarkers.forEach(m => state.itineraryMap.removeLayer(m));
    state.itineraryMarkers = [];
    
    if (state.itineraryRouteLine) {
        state.itineraryMap.removeLayer(state.itineraryRouteLine);
        state.itineraryRouteLine = null;
    }
    
    if (!opt.stops || opt.stops.length === 0) return;
    
    const latlngs = [];
    
    opt.stops.forEach(stop => {
        // 1. Plot Hotel
        const hotel = stop.hotel;
        if (hotel && hotel.lat && hotel.lon) {
            const hotelLatLng = [parseFloat(hotel.lat), parseFloat(hotel.lon)];
            const markerIcon = L.divIcon({
                className: 'custom-map-hotel-pin',
                html: `<div style="background:#7C3AED; color:#fff; font-weight:800; font-size:0.75rem; padding:4px 8px; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.25); white-space:nowrap; border:2px solid #fff;">🏨 Stay: ${hotel.name.slice(0, 15)}...</div>`,
                iconSize: [120, 24],
                iconAnchor: [60, 12]
            });
            const m = L.marker(hotelLatLng, { icon: markerIcon }).addTo(state.itineraryMap);
            m.bindPopup(`<b>🏨 Hotel stay: ${hotel.name} (${stop.city})</b>`);
            state.itineraryMarkers.push(m);
            latlngs.push(hotelLatLng);
        }
        
        // 2. Plot Sightseeing Attractions
        const sights = stop.all_sightseeing || [];
        sights.forEach(a => {
            if (a.optimized && a.lat && a.lon) {
                const sightLatLng = [parseFloat(a.lat), parseFloat(a.lon)];
                const markerIcon = L.divIcon({
                    className: 'custom-map-sight-pin',
                    html: `<div style="background:#10B981; color:#fff; font-weight:700; font-size:0.7rem; padding:3px 6px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.2); white-space:nowrap; border:1.5px solid #fff;">📍 ${a.name.slice(0, 15)}...</div>`,
                    iconSize: [100, 22],
                    iconAnchor: [50, 11]
                });
                const m = L.marker(sightLatLng, { icon: markerIcon }).addTo(state.itineraryMap);
                m.bindPopup(`<b>📍 Attraction: ${a.name} (${stop.city})</b>`);
                state.itineraryMarkers.push(m);
                latlngs.push(sightLatLng);
            }
        });
    });
    
    // 3. Draw route lines connecting them
    if (latlngs.length > 1) {
        state.itineraryRouteLine = L.polyline(latlngs, {
            color: '#7C3AED',
            weight: 3,
            dashArray: '5, 8',
            opacity: 0.8
        }).addTo(state.itineraryMap);
        
        state.itineraryMap.fitBounds(latlngs, { padding: [40, 40] });
    } else if (latlngs.length === 1) {
        state.itineraryMap.setView(latlngs[0], 13);
    }
}

function selectTripOptionStyle(idx) {
    state.selectedOptionIndex = idx;
    renderSelectedTripOption();
}

function handleBudgetSliderInput(val) {
    const label = document.getElementById("slider-budget-label");
    if (label) {
        label.textContent = `₹${parseFloat(val).toLocaleString('en-IN')}`;
    }
}

function handleBudgetSliderChange(val) {
    const budget = parseFloat(val);
    if (isNaN(budget)) return;
    
    runTripPlannerOptimization({
        destination: state.currentCity,
        budget: budget,
        days: state.originalDaysCount || 3,
        people: state.originalPeopleCount || 2,
        origin: document.getElementById("opt-home-origin")?.value || "Delhi"
    });
}

function showPerPersonSplitCard() {
    if (!state.tripOptions || state.tripOptions.length === 0) return;
    const opt = state.tripOptions[state.selectedOptionIndex];
    const people = state.originalPeopleCount || 1;
    
    const modal = document.getElementById("split-it-modal");
    const body = document.getElementById("split-it-modal-body");
    
    if (modal && body) {
        body.innerHTML = `
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">💸</div>
            <h3 style="font-size:1.25rem; font-weight:800; color:var(--text-primary); margin-bottom:1rem;">Per-Person Cost Split</h3>
            
            <div style="background:#FAF9F6; border:1px solid var(--border); border-radius:12px; padding:1.25rem; margin-bottom:1.25rem; text-align:left;">
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                    <span>Total Group Cost:</span>
                    <strong style="color:var(--text-primary);">₹${Math.round(opt.total_cost).toLocaleString('en-IN')}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                    <span>Total Travelers:</span>
                    <strong style="color:var(--text-primary);">${people}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:1rem; border-top:1px dashed var(--border); padding-top:0.75rem; font-weight:800; color:var(--accent);">
                    <span>Individual Share:</span>
                    <span>₹${Math.round(opt.cost_per_person).toLocaleString('en-IN')}</span>
                </div>
            </div>
            
            <h4 style="font-size:0.78rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; text-align:left; margin-bottom:0.6rem; letter-spacing:0.5px;">Itemized Cost Breakdown (Per Person)</h4>
            <div style="display:flex; flex-direction:column; gap:0.6rem; text-align:left; margin-bottom:1.5rem;">
                ${Object.entries(opt.budget_split).map(([category, cost]) => `
                    <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:var(--text-secondary);">
                        <span>${category}:</span>
                        <span>₹${Math.round(cost / people).toLocaleString('en-IN')}</span>
                    </div>
                `).join("")}
            </div>
        `;
        modal.classList.remove("hidden");
    }
}

function closeSplitItModal() {
    const modal = document.getElementById("split-it-modal");
    if (modal) modal.classList.add("hidden");
}

function toggleComparisonMode() {
    if (!state.tripOptions || state.tripOptions.length === 0) return;
    
    const modal = document.getElementById("comparison-modal");
    const body = document.getElementById("comparison-modal-body");
    
    if (modal && body) {
        let tableRows = state.tripOptions.map((o, idx) => {
            const stop = o.stops[0];
            const hotelName = stop && stop.hotel ? stop.hotel.name : "N/A";
            const stars = stop && stop.hotel && stop.hotel.stars ? `⭐ ${stop.hotel.stars}` : "N/A";
            
            return `
                <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;">
                    <td style="padding: 1rem; font-weight:800; color: ${idx === state.selectedOptionIndex ? 'var(--accent)' : 'var(--text-primary)'};">
                        ${o.style_name} ${idx === state.selectedOptionIndex ? '⚡' : ''}
                    </td>
                    <td style="padding: 1rem; color: var(--accent); font-weight:700;">
                        ₹${Math.round(o.total_cost).toLocaleString('en-IN')}
                    </td>
                    <td style="padding: 1rem; color: var(--text-secondary);">
                        ₹${Math.round(o.cost_per_person).toLocaleString('en-IN')}
                    </td>
                    <td style="padding: 1rem; color: var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${hotelName}">
                        ${hotelName} <span style="font-size: 0.75rem; color: var(--text-muted);">${stars}</span>
                    </td>
                    <td style="padding: 1rem; color: var(--text-secondary); text-transform: capitalize;">
                        ${(o.travel_mode || 'flexible').replace('_', ' ')}
                    </td>
                    <td style="padding: 1rem; font-size: 0.78rem; color: var(--text-muted); max-width: 240px; line-height: 1.4;">
                        ${o.why_fits}
                    </td>
                    <td style="padding: 1rem; text-align: center;">
                        <button class="btn-primary" style="font-size:0.75rem; padding:0.4rem 0.8rem; border-radius:6px;" onclick="selectTripOptionStyle(${idx}); closeComparisonModal();">
                            Select
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
        
        body.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                <thead>
                    <tr style="background: #FAF9F6; border-bottom: 2px solid var(--border);">
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Style Option</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Group Price</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Per Person</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Hotel Stay</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Transit</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary);">Strategy</th>
                        <th style="padding: 1rem; font-weight: 800; color: var(--text-primary); text-align: center;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
        modal.classList.remove("hidden");
    }
}

function closeComparisonModal() {
    const modal = document.getElementById("comparison-modal");
    if (modal) modal.classList.add("hidden");
}

function exportItineraryCSV() {
    if (!state.tripOptions || state.tripOptions.length === 0) return;
    const opt = state.tripOptions[state.selectedOptionIndex];
    const people = state.originalPeopleCount || 1;
    
    let csvRows = [];
    csvRows.push([
        "Day", 
        "Destination", 
        "Recommended Stay", 
        "Stay Maps Link", 
        "Transit Mode", 
        "Est. Cost Per Person (INR)", 
        "Day Summary", 
        "Details"
    ].map(c => `"${c.replace(/"/g, '""')}"`).join(","));
    
    opt.itinerary.forEach(day => {
        const stayName = day.stay_name || "Local Stay";
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stayName + " " + state.currentCity)}`;
        const transitMode = day.transport_mode || "Flexible";
        const cost = day.transport_cost || 0;
        
        csvRows.push([
            day.day,
            state.currentCity.toUpperCase(),
            stayName,
            mapsLink,
            transitMode,
            Math.round(cost),
            day.summary,
            day.details
        ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TripSplit_${state.currentCity.replace(/\s+/g, '_')}_Itinerary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleDayDetailsPane(header) {
    const card = header.closest('.day-collapsible-card');
    if (!card) return;
    const body = card.querySelector('.day-card-body');
    const arrow = header.querySelector('.day-collapse-arrow');
    if (body) {
        const isHidden = body.classList.contains('hidden');
        if (isHidden) {
            body.classList.remove('hidden');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            body.classList.add('hidden');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    }
}

function renderVenueCardHtml(v, category, isRecommended = false) {
    const isHearted = isVenueFavorite(v.name);
    const heartIcon = isHearted ? "❤️" : "🤍";
    const optBadge = isRecommended ? `<span class="recommended-badge">⭐ Recommended Choice</span>` : "";
    const starsHtml = v.stars ? getBubbleRatingHtml(v.stars) : (v.utility ? getBubbleRatingHtml(Math.min(5, Math.ceil(v.utility / 30))) : "");
    const subTypeLabel = v.sub_type ? v.sub_type.toUpperCase() : category.toUpperCase();
    
    let costText = "";
    if (category === "hotel") {
        costText = `Est. Nightly: ₹${(v.cost / (state.lastPlanResult?.days || 3) || 8000).toLocaleString('en-IN')}`;
    } else if (category === "restaurant" || category === "bar") {
        costText = `Est. Meal: ₹${(v.cost || 1200).toLocaleString('en-IN')}`;
    } else {
        costText = v.original_cost === 0 ? "Free Entry" : `Est. Fee: ₹${(v.original_cost || 500).toLocaleString('en-IN')}`;
        if (v.original_cost === 0 || v.cost === 0) {
            nameWithBadge += `<span style="background:#10B981; color:#fff; font-size:0.65rem; font-weight:800; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FREE</span>`;
        }
    }
    
    const imgUrl = getVenuePhoto(v.name, category, v.city || state.currentCity);
    const escapedName = v.name.replace(/'/g, "\\'");
    
    return `
        <div class="card-item-el ${isRecommended ? 'recommended-border' : ''}" style="width:280px; flex:0 0 auto; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #FFF; transition: transform 0.2s; position: relative;" onclick="navigateToDetail('${escapedName}', '${category === 'bar' ? 'experience' : category}')">
            ${optBadge}
            <div class="card-img-container" style="height: 140px; position: relative; background: #E5E7EB;">
                <img src="${imgUrl}" alt="${v.name}" style="width:100%; height:100%; object-fit:cover;">
                <button class="card-heart-btn" onclick="event.stopPropagation(); toggleFavoriteVenue('${escapedName}', '${category}', '', ${v.lat}, ${v.lon}); this.innerHTML = isVenueFavorite('${escapedName}') ? '❤️' : '🤍';" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.9); border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${heartIcon}</button>
            </div>
            <div class="card-details" style="padding: 0.75rem;">
                <span class="card-category-label" style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">${subTypeLabel}</span>
                <strong class="card-item-title" style="display: block; font-size: 0.88rem; margin: 0.2rem 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 100%;">${nameWithBadge}</strong>
                <div class="card-rating-row" style="margin-top: 0.2rem;">
                    ${starsHtml}
                </div>
                <div class="card-price-row" style="margin-top: 0.4rem; font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${costText}</div>
            </div>
        </div>
    `;
}

function renderSelectedTripOption() {
    if (!state.tripOptions || state.tripOptions.length === 0) return;
    const opt = state.tripOptions[state.selectedOptionIndex];
    
    // Render Pills
    const pillsContainer = document.getElementById("tripsplit-option-pills");
    if (pillsContainer) {
        pillsContainer.innerHTML = state.tripOptions.map((o, idx) => `
            <button class="pill-tag ${idx === state.selectedOptionIndex ? 'active' : ''}" onclick="selectTripOptionStyle(${idx})" style="padding:0.4rem 0.85rem; font-size:0.8rem; font-weight:700; border-radius:20px; cursor:pointer; outline:none;">
                ${o.style_name}
            </button>
        `).join("");
    }
    
    // Confidence badge
    const confContainer = document.getElementById("tripsplit-confidence-container");
    if (confContainer) {
        let confColor = "#10B981"; // Green
        if (opt.confidence === "Tight Budget") confColor = "#EF4444"; // Red
        else if (opt.confidence === "Moderate Confidence") confColor = "#F59E0B"; // Amber
        
        confContainer.innerHTML = `
            <span style="font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Confidence:</span>
            <span style="background:${confColor}; color:#FFFFFF; padding:0.25rem 0.65rem; border-radius:100px; font-size:0.75rem; font-weight:800;">${opt.confidence}</span>
        `;
    }
    
    // Why fits card
    const whyFitsEl = document.getElementById("why-fits-text");
    if (whyFitsEl) whyFitsEl.textContent = opt.why_fits;
    
    // Trade-offs
    const tradeoffsEl = document.getElementById("tradeoffs-list");
    if (tradeoffsEl) {
        tradeoffsEl.innerHTML = opt.tradeoffs.map(t => `
            <li style="margin-bottom:0.35rem;">${t}</li>
        `).join("");
    }
    
    // What Could Go Wrong Amber Card
    const wrongListEl = document.getElementById("wrong-flags-list");
    if (wrongListEl) {
        const warnings = [];
        const month = document.getElementById("opt-home-month")?.value || "August";
        if (month === "July" || month === "August") {
            warnings.push("🌧️ <strong>Monsoon Warning:</strong> High risk of landslides/road closures on travel routes. paragliding is likely suspended.");
        } else if (month === "December" || month === "January") {
            warnings.push("❄️ <strong>Winter Freeze:</strong> Rohtang Pass is closed. Stays require heavy heating; budget rooms may lack insulation.");
        }
        warnings.push(`💸 <strong>Strict Budget constraint:</strong> Transport accounts for ${Math.round((opt.budget_split.Transportation / opt.total_cost) * 100)}% of total cost. Local backup options are mandatory.`);
        warnings.push("📅 <strong>Stay booking window:</strong> Room rates increase rapidly close to weekend dates. Advance booking is highly recommended.");
        
        wrongListEl.innerHTML = warnings.map(w => `<div style="display:flex; gap:0.4rem; align-items:start;"><span>•</span><div>${w}</div></div>`).join("");
    }
    
    // Render Budget Strip (Left Column)
    const totalCost = opt.total_cost;
    const split = opt.budget_split;
    const categories = Object.keys(split);
    
    const colors = {
        "Transportation": "#3B82F6",
        "Stay": "#10B981",
        "Food": "#F59E0B",
        "Local Travel": "#8B5CF6",
        "Activities": "#EC4899",
        "Buffer": "#6B7280"
    };
    
    categories.forEach(cat => {
        const amt = split[cat];
        const pct = totalCost > 0 ? (amt / totalCost) * 100 : 0;
        const segment = document.getElementById(`budget-strip-${cat.toLowerCase().replace(' ', '')}`);
        if (segment) {
            segment.style.height = `${pct}%`;
            segment.title = `${cat}: ₹${Math.round(amt).toLocaleString('en-IN')} (${Math.round(pct)}%)`;
        }
    });
    
    // Budget breakdown list below the strip
    const breakdownEl = document.getElementById("budget-labels-breakdown");
    if (breakdownEl) {
        breakdownEl.innerHTML = categories.map(cat => {
            const amt = split[cat];
            const pct = totalCost > 0 ? (amt / totalCost) * 100 : 0;
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--border); padding-bottom:0.4rem; margin-bottom:0.25rem;">
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${colors[cat]};"></span>
                        <strong style="color:var(--text-secondary); font-size:0.8rem;">${cat}</strong>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:var(--text-primary);">₹${Math.round(amt).toLocaleString('en-IN')}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">${Math.round(pct)}%</div>
                    </div>
                </div>
            `;
        }).join("") + `
            <div style="margin-top:1rem; padding-top:0.75rem; border-top:1.5px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.85rem; color:var(--text-primary);">Total Cost:</strong>
                <strong style="font-size:1.15rem; color:var(--accent);">₹${Math.round(totalCost).toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                <span style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">Per Traveler share:</span>
                <span style="font-size:0.85rem; color:var(--text-primary); font-weight:700;">₹${Math.round(opt.cost_per_person).toLocaleString('en-IN')}</span>
            </div>
        `;
    }
    
    // Check constraints warning banner
    const banner = document.getElementById("tripsplit-deficit-banner");
    const diff = opt.total_cost - state.originalBudgetLimit;
    if (diff > 100) {
        if (banner) {
            banner.classList.remove("hidden");
            document.getElementById("deficit-banner-text").textContent = `This version exceeds your budget by ₹${Math.round(diff).toLocaleString('en-IN')}`;
        }
    } else {
        if (banner) banner.classList.add("hidden");
    }
    
    // Read checkbox toggle states
    const showStays = document.getElementById("toggle-itin-stays") ? document.getElementById("toggle-itin-stays").checked : true;
    const showDining = document.getElementById("toggle-itin-dining") ? document.getElementById("toggle-itin-dining").checked : true;
    const showBars = document.getElementById("toggle-itin-bars") ? document.getElementById("toggle-itin-bars").checked : true;
    const showSights = document.getElementById("toggle-itin-sights") ? document.getElementById("toggle-itin-sights").checked : true;

    // Render Itinerary daycards (Center Column)
    const wrapper = document.getElementById("plan-details-wrapper");
    if (wrapper) {
        let globalAttrIdx = 0; // Sequential slot assignment across days

        wrapper.innerHTML = opt.itinerary.map((day, idx) => {
            const hasStay  = day.stay_name && day.stay_name !== "None";
            const dayCity  = day.city || opt.stops[0].city;
            const stop     = opt.stops.find(s => s.city.toLowerCase() === dayCity.toLowerCase()) || opt.stops[0];
            const sights   = day.sights || [];

            /* Transport */
            const tMode = (day.transport_mode || '').toLowerCase();
            const tIcon = tMode.includes('flight') ? '✈️' : tMode.includes('train') ? '🚂' : tMode.includes('cab') ? '🚗' : '🚌';
            const isFirstOrLast = (day.day === 1 || day.day === opt.itinerary.length);

            const tPill = isFirstOrLast
                ? `<span class="itin-transport-pill">${tIcon} ${day.transport_mode} · ₹${Math.round(day.transport_cost).toLocaleString('en-IN')}</span>`
                : '';

            /* Helper: render one activity row */
            const actRow = (timeKey, timeLabel, typeClass, icon, name, sub, tags = []) => `
                <div class="itin-row ${timeKey}">
                    <div class="itin-row-dot"></div>
                    <div class="itin-row-time">${timeLabel}</div>
                    <div class="itin-activity type-${typeClass}">
                        <div class="itin-activity-icon">${icon}</div>
                        <div class="itin-activity-body">
                            <div class="itin-activity-name">${name}</div>
                            ${sub ? `<div class="itin-activity-sub">${sub}</div>` : ''}
                            ${tags.length ? `<div class="itin-activity-tags">${tags.map(t => `<span class="itin-activity-tag">${t}</span>`).join('')}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;

            /* Build timeline rows */
            let timelineRows = '';

            // Hotel check-in (morning, day 1 only)
            if (showStays && hasStay && day.day === 1) {
                const ratingStars = getBubbleRatingHtml(day.stay_rating || 4);
                timelineRows += `
                    <div class="itin-row morning">
                        <div class="itin-row-dot"></div>
                        <div class="itin-row-time">☀️ Morning · Check-in</div>
                        <div class="itin-activity type-hotel">
                            <div class="itin-activity-icon">🏨</div>
                            <div class="itin-activity-body" style="flex:1;min-width:0;">
                                <div class="itin-activity-name">${day.stay_name}</div>
                                <div style="margin-top:0.25rem;">${ratingStars}</div>
                            </div>
                            <button class="itin-swap-btn" onclick="openSwapStayModal(${idx})">Swap</button>
                        </div>
                    </div>
                `;
            }

            // Distribute sights sequentially into Morning, Afternoon, Evening
            const daySightsBySlot = { morning: [], afternoon: [], evening: [] };
            sights.forEach((s) => {
                const slot = globalAttrIdx % 3;
                const slotKey = slot === 0 ? 'morning' : slot === 1 ? 'afternoon' : 'evening';
                daySightsBySlot[slotKey].push(s);
                globalAttrIdx++;
            });

            // 1. Morning Attractions
            daySightsBySlot.morning.forEach(s => {
                const isFree = (s.original_cost === 0 || s.cost === 0);
                const nameWithBadge = s.name + (isFree ? `<span style="background:#10B981; color:#fff; font-size:0.65rem; font-weight:800; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FREE</span>` : '');
                const tags = [s.vibe || 'Scenic'];
                if (s.entry_fee) tags.push(`₹${s.entry_fee} entry`);
                if (s.duration) tags.push(s.duration);
                timelineRows += actRow('morning', '☀️ Morning', 'sight', '🏛️', nameWithBadge, s.description || 'Popular sightseeing spot.', tags);
            });

            // 2. Afternoon Attractions
            daySightsBySlot.afternoon.forEach(s => {
                const isFree = (s.original_cost === 0 || s.cost === 0);
                const nameWithBadge = s.name + (isFree ? `<span style="background:#10B981; color:#fff; font-size:0.65rem; font-weight:800; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FREE</span>` : '');
                const tags = [s.vibe || 'Scenic'];
                if (s.entry_fee) tags.push(`₹${s.entry_fee} entry`);
                if (s.duration) tags.push(s.duration);
                timelineRows += actRow('afternoon', '🌤 Afternoon', 'sight', '🏛️', nameWithBadge, s.description || 'Popular sightseeing spot.', tags);
            });

            // 3. Lunch (Afternoon Meal)
            if (showDining && stop.all_restaurants && stop.all_restaurants.length > 0) {
                const r = stop.all_restaurants[idx % stop.all_restaurants.length];
                const sub = [r.cuisine ? r.cuisine + ' cuisine' : null, r.price_for_two ? '₹' + r.price_for_two + ' for two' : null].filter(Boolean).join(' · ');
                const tags = [];
                if (r.rating) tags.push(`⭐ ${r.rating}`);
                if (r.specialty) tags.push(r.specialty);
                timelineRows += actRow('afternoon', '🌤 Afternoon · Lunch', 'food', '🍽️', r.name, sub, tags);
            }

            // 4. Evening Attractions
            daySightsBySlot.evening.forEach(s => {
                const isFree = (s.original_cost === 0 || s.cost === 0);
                const nameWithBadge = s.name + (isFree ? `<span style="background:#10B981; color:#fff; font-size:0.65rem; font-weight:800; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FREE</span>` : '');
                const tags = [s.vibe || 'Scenic'];
                if (s.entry_fee) tags.push(`₹${s.entry_fee} entry`);
                if (s.duration) tags.push(s.duration);
                timelineRows += actRow('evening', '🌙 Evening', 'sight', '🏛️', nameWithBadge, s.description || 'Popular sightseeing spot.', tags);
            });

            // 5. Dinner (Evening Meal)
            if (showDining && stop.all_restaurants && stop.all_restaurants.length > 0) {
                const rIdx = (idx + 1) % stop.all_restaurants.length;
                const r = stop.all_restaurants[rIdx];
                const sub = [r.cuisine ? r.cuisine + ' cuisine' : null, r.price_for_two ? '₹' + r.price_for_two + ' for two' : null].filter(Boolean).join(' · ');
                const tags = [];
                if (r.rating) tags.push(`⭐ ${r.rating}`);
                if (r.specialty) tags.push(r.specialty);
                timelineRows += actRow('evening', '🌙 Evening · Dinner', 'food', '🍽️', r.name, sub, tags);
            }

            // 6. Bars (Evening Nightlife)
            if (showBars && stop.all_bars && stop.all_bars.length > 0) {
                const b = stop.all_bars[idx % stop.all_bars.length];
                const sub = [b.vibe, b.avg_drink_cost ? '₹' + b.avg_drink_cost + ' avg drink' : null].filter(Boolean).join(' · ');
                timelineRows += actRow('night', 'Night', 'bar', '🍹', b.name, sub);
            }

            /* Stat sub-line */
            const statParts = [
                day.city ? `📍 ${day.city}` : null,
                sights.length ? `${sights.length} sights` : null,
                hasStay       ? 'Stay included' : null,
                isFirstOrLast ? tIcon + ' ' + day.transport_mode : null
            ].filter(Boolean);
            const statsHtml = statParts.map(s => `<span class="itin-day-stat">${s}</span>`).join('');

            /* Cab upgrade */
            const isPrivateCabEnabled = opt.travel_mode === "private_cab";
            const cabUpgrade = isFirstOrLast ? `
                <div class="itin-cab-upgrade">
                    <span>${tIcon} <strong>${day.transport_mode}</strong> — ₹${Math.round(day.transport_cost).toLocaleString('en-IN')}</span>
                    <label>
                        <input type="checkbox" ${isPrivateCabEnabled ? 'checked' : ''} onchange="togglePrivateCabTransport(this.checked)">
                        Upgrade to private cab (+₹6,000)
                    </label>
                </div>
            ` : '';

            return `
                <div class="itin-day-card" id="itin-card-${idx}">
                    <div class="itin-day-header" onclick="toggleItinCard(${idx})">
                        <div class="itin-day-num">${day.day}</div>
                        <div class="itin-day-sep"></div>
                        <div class="itin-day-meta">
                            <h5>${day.summary}</h5>
                            <div class="itin-day-meta-sub">${statsHtml}</div>
                        </div>
                        <div class="itin-day-chevron">▾</div>
                    </div>
                    <div class="itin-day-body">
                        <div class="itin-body-inner">
                            <p class="itin-day-desc">${day.details}</p>
                            ${tPill}
                            <div class="itin-timeline">${timelineRows}</div>
                            ${cabUpgrade}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Open first card by default
        const first = document.getElementById('itin-card-0');
        if (first) first.classList.add('open');
    }

    // Plot route line on map (Right Column)
    plotPinsOnItineraryMap(opt);
}

function toggleItinCard(idx) {
    const card = document.getElementById(`itin-card-${idx}`);
    if (card) card.classList.toggle('open');
}





function renderMiniVenueCard(v, category, isRecommended = false) {
    const starsHtml = getBubbleRatingHtml(v.stars || v.utility / 30 || 4.2);
    const escName = v.name.replace(/'/g, "\\'");
    
    let costText = "";
    if (category === "hotel") {
        costText = `Est: ₹${(v.cost).toLocaleString('en-IN')}`;
    } else if (category === "restaurant" || category === "bar") {
        costText = `Est: ₹${(v.cost || 1200).toLocaleString('en-IN')}`;
    } else {
        costText = v.original_cost === 0 ? "Free" : `Fee: ₹${(v.original_cost || 500).toLocaleString('en-IN')}`;
    }
    
    return `
        <div class="card-item-el" onclick="navigateToDetail('${escName}', '${category === 'bar' ? 'experience' : (category === 'sightseeing' ? 'experience' : category)}')" style="width:calc(33.33% - 0.5rem); min-width:140px; flex-grow:1; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #FFF; transition: transform 0.2s; cursor:pointer; font-size:0.78rem; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="height: 80px; position: relative; background: #E5E7EB;">
                <img src="${getVenuePhoto(v.name, category === 'sightseeing' ? 'attractions' : category, state.currentCity)}" alt="${v.name}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap:0.15rem; flex-grow:1;">
                <strong style="display: block; font-size: 0.8rem; margin: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; color:var(--text-primary);">${v.name}</strong>
                <div style="display: flex; align-items:center; gap:0.25rem;">
                    ${starsHtml}
                </div>
                <div style="font-weight: 700; color: var(--accent); margin-top: auto;">${costText}</div>
            </div>
        </div>
    `;
}

function handleItineraryToggleChange() {
    renderSelectedTripOption();
}

function toggleOptimalPlanType() {
    if (!state.lastPlanResult) return;
    
    const toggleBtn = document.getElementById("toggle-backup-btn");
    if (state.activePlanType === "primary" && state.lastPlanResult.backup) {
        state.activePlanType = "backup";
        if (toggleBtn) toggleBtn.textContent = "Switch to Optimal Option";
        renderPlanItinerary(state.lastPlanResult.backup);
    } else {
        state.activePlanType = "primary";
        if (toggleBtn) toggleBtn.textContent = "Switch to Economy Option";
        renderPlanItinerary(state.lastPlanResult);
    }
}

function exportPlanToPDF() {
    window.print();
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

function getVenuePhoto(name, type, city = '') {
    const n = name.toLowerCase();
    const c = (city || state.currentCity || '').toLowerCase().trim();
    
    // City-specific high-vibe Unsplash photo pools
    const cityPools = {
        'goa': {
            hotel: [
                "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80"
            ],
            restaurant: [
                "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80",
                "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80"
            ],
            experience: [
                "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80", // beach
                "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=400&q=80", // aguada
                "https://images.unsplash.com/photo-1432405972618-c6b0cfba8793?auto=format&fit=crop&w=400&q=80" // falls
            ]
        }
    };
    
    // --- JAIPUR ---
    if (n.includes("rambagh")) return "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=400&q=80";
    if (n.includes("rajvilas")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("pearl palace")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("samode")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mishthan") || n.includes("lmb")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("peacock")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("chokhi")) return "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80";
    if (n.includes("tapri")) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80";
    if (n.includes("suvarna")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("amber") || n.includes("amer")) return "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=400&q=80";
    if (n.includes("hawa mahal")) return "https://images.unsplash.com/photo-1603262110263-fb0112e7cc33?auto=format&fit=crop&w=400&q=80";
    if (n.includes("nahargarh")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jal mahal")) return "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jantar mantar")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("albert hall")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    
    // --- HIMACHAL / SHIMLA / MANALI ---
    if (n.includes("wildflower hall")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("oberoi cecil")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("johnson")) return "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80";
    if (n.includes("snow valley")) return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("manu allaya")) return "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=400&q=80";
    if (n.includes("combermere")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("cafe 1947")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("baljees")) return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("wake & bake") || n.includes("wake and bake")) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80";
    if (n.includes("cafe simla")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("hide out")) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80";
    if (n.includes("hidimba") || n.includes("hadimba")) return "https://images.unsplash.com/photo-1626621331169-5f34be280ed9?auto=format&fit=crop&w=400&q=80";
    if (n.includes("solang")) return "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("rohtang")) return "https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=400&q=80";
    if (n.includes("ridge") || n.includes("mall road")) return "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jakhu") || n.includes("jakhoo")) return "https://images.unsplash.com/photo-1626621331169-5f34be280ed9?auto=format&fit=crop&w=400&q=80";
    if (n.includes("kufri")) return "https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=400&q=80";
    if (n.includes("triund")) return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jogini")) return "https://images.unsplash.com/photo-1432405972618-c6b0cfba8793?auto=format&fit=crop&w=400&q=80";
    if (n.includes("beas") && n.includes("raft")) return "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("christ church")) return "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=400&q=80";
    if (n.includes("drifter")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("lazy dog")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("il forno")) return "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80";
    if (n.includes("himalayan resort")) return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("hotel beas")) return "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80";
    if (n.includes("old manali")) return "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?auto=format&fit=crop&w=400&q=80";
    
    // --- GOA ---
    if (n.includes("aguada")) return "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=400&q=80";
    if (n.includes("leela") && n.includes("goa")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("w goa")) return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("fontainhas") || n.includes("panjim inn") || n.includes("old quarter")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("gunpowder")) return "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80";
    if (n.includes("thalassa")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("curlies")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    if (n.includes("martin")) return "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80";
    if (n.includes("basilica") || n.includes("bom jesus")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("dudhsagar")) return "https://images.unsplash.com/photo-1432405972618-c6b0cfba8793?auto=format&fit=crop&w=400&q=80";
    if (n.includes("anjuna")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    if (n.includes("calangute") || n.includes("palolem")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    
    // --- DELHI ---
    if (n.includes("imperial") && n.includes("delhi")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("lalit")) return "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80";
    if (n.includes("broadway") && n.includes("delhi")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("karim")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("bukhara")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("indian accent")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("paranthe wali")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("big chill")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("red fort") || n.includes("lal qila")) return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("qutub") || n.includes("qutb")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("india gate") || n.includes("rajpath")) return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("humayun")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("chandni chowk")) return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("lodhi garden") || n.includes("lodi garden")) return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80";
    if (n.includes("akshardham")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    
    // --- MUMBAI ---
    if (n.includes("taj mahal palace")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("oberoi") && n.includes("mumbai")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("itc maratha")) return "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80";
    if (n.includes("abode bombay")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("leopold")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("britannia")) return "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80";
    if (n.includes("trishna")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("bademiya")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mondegar")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("gateway of india")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("marine drive")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("elephanta")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("shivaji terminus") || n.includes("cst")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("juhu") || n.includes("chowpatty")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    if (n.includes("dharavi")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("haji ali")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    
    // --- VARANASI ---
    if (n.includes("nadesar")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("brijrama")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("blue lassi")) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80";
    if (n.includes("kashi") && n.includes("chat")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("vaatika")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("dashashwamedh") || n.includes("ghat aarti")) return "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=400&q=80";
    if (n.includes("boat ride") && n.includes("ganges")) return "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=400&q=80";
    if (n.includes("sarnath")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("vishwanath")) return "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=400&q=80";
    if (n.includes("manikarnika")) return "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=400&q=80";
    
    // --- UDAIPUR ---
    if (n.includes("lake palace")) return "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80";
    if (n.includes("udaivilas")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jagat niwas")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("ambrai")) return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("savage garden")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("1559")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("millets of mewar")) return "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("pichola")) return "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80";
    if (n.includes("jagdish")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("saheliyon")) return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80";
    if (n.includes("monsoon palace")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    
    // --- AGRA ---
    if (n.includes("amarvilas")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("itc mughal")) return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("pinch of spice")) return "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80";
    if (n.includes("esphahan")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("taj mahal") && !n.includes("palace")) return "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=400&q=80";
    if (n.includes("agra fort")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mehtab bagh")) return "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=400&q=80";
    if (n.includes("fatehpur sikri")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("itimad")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    
    // --- BANGALORE ---
    if (n.includes("leela") && n.includes("bengal")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("taj west end")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("ritz-carlton") || n.includes("ritz carlton")) return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mtr") || n.includes("mavalli")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("vidyarthi bhavan")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("toit")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("koshy")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("nagarjuna")) return "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80";
    if (n.includes("bangalore palace")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    if (n.includes("lalbagh")) return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80";
    if (n.includes("cubbon")) return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80";
    if (n.includes("iskcon")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("nandi hills")) return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("commercial street")) return "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80";
    
    // --- KOLKATA ---
    if (n.includes("oberoi grand")) return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
    if (n.includes("taj bengal")) return "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80";
    if (n.includes("the park") && n.includes("kolkata")) return "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80";
    if (n.includes("peter cat")) return "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80";
    if (n.includes("flurys")) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80";
    if (n.includes("ballygunge")) return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("arsalan")) return "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80";
    if (n.includes("victoria memorial")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    if (n.includes("howrah")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("indian museum")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("dakshineswar")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("kumartuli")) return "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80";
    
    // --- GENERIC KEYWORD MATCHING ---
    // Cities
    if (n.includes("delhi")) return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mumbai")) return "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&w=400&q=80";
    if (n.includes("goa")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    if (n.includes("shimla") || n.includes("manali") || n.includes("himachal")) return "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?auto=format&fit=crop&w=400&q=80";
    
    // Venue type keywords
    if (n.includes("zostel") || n.includes("hostel")) return "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("oyo") || n.includes("flagship")) return "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80";
    if (n.includes("temple") || n.includes("mandir") || n.includes("church") || n.includes("cathedral") || n.includes("dargah") || n.includes("mosque")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("fort") || n.includes("palace") || n.includes("haveli") || n.includes("castle")) return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80";
    if (n.includes("waterfall") || n.includes("falls")) return "https://images.unsplash.com/photo-1432405972618-c6b0cfba8793?auto=format&fit=crop&w=400&q=80";
    if (n.includes("beach") || n.includes("shore") || n.includes("coast")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80";
    if (n.includes("mountain") || n.includes("hill") || n.includes("trek") || n.includes("valley") || n.includes("peak") || n.includes("pass")) return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("lake") || n.includes("river") || n.includes("backwater")) return "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80";
    if (n.includes("garden") || n.includes("park") || n.includes("botanical")) return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80";
    if (n.includes("museum") || n.includes("memorial") || n.includes("monument")) return "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80";
    if (n.includes("market") || n.includes("bazaar") || n.includes("shopping")) return "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80";
    if (n.includes("cafe") || n.includes("coffee") || n.includes("bakery")) return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80";
    if (n.includes("dhaba") || n.includes("street food") || n.includes("chaat") || n.includes("lassi")) return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80";
    if (n.includes("bar") || n.includes("pub") || n.includes("lounge") || n.includes("brew")) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80";
    if (n.includes("fine dining") || n.includes("luxury")) return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80";
    if (n.includes("sunset") || n.includes("sunrise") || n.includes("viewpoint") || n.includes("view")) return "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=400&q=80";
    if (n.includes("walk") || n.includes("heritage") || n.includes("tour")) return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=400&q=80";
    if (n.includes("adventure") || n.includes("sport") || n.includes("raft")) return "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=400&q=80";
    if (n.includes("snow") || n.includes("ice") || n.includes("ski")) return "https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=400&q=80";
    if (n.includes("boat") || n.includes("ferry") || n.includes("kayak") || n.includes("cruise")) return "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=400&q=80";
    
    // Deterministic photo pools as final fallback
    const hotelPics = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=400&q=80"
    ];
    
    const restPics = [
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?auto=format&fit=crop&w=400&q=80"
    ];
    
    const expPics = [
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?auto=format&fit=crop&w=400&q=80"
    ];
    
    // Deterministic indexing based on name to get unique images per venue
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    
    if (type === 'hotel') return hotelPics[hash % hotelPics.length];
    if (type === 'restaurant') return restPics[hash % restPics.length];
    return expPics[hash % expPics.length];
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



// --- GROUP EXPENSE SPLITTER LEDGER LOGIC ---
state.ledgerExpenses = JSON.parse(localStorage.getItem('ta_expenses') || '[]');
if (state.ledgerExpenses.length === 0) {
    state.ledgerExpenses = [
        { id: 101, desc: "Hotel Stay Deposit", amount: 12000, paidBy: "Somya", category: "Stay", splitType: "equal", shares: { "Somya": 3000, "Amit": 3000, "Priya": 3000, "Rohan": 3000 } },
        { id: 102, desc: "Local Tour Guide Guide", amount: 3200, paidBy: "Amit", category: "Sights", splitType: "equal", shares: { "Somya": 800, "Amit": 800, "Priya": 800, "Rohan": 800 } },
        { id: 103, desc: "Group Dinner Feast", amount: 4800, paidBy: "Priya", category: "Food", splitType: "equal", shares: { "Somya": 1200, "Amit": 1200, "Priya": 1200, "Rohan": 1200 } }
    ];
}
state.groupMembers = localStorage.getItem('ta_members') ? localStorage.getItem('ta_members').split(',').map(m => m.trim()) : ['Somya', 'Amit', 'Priya', 'Rohan'];
state.charts = { pie: null, bar: null };

function switchLedgerSubtab(tabName) {
    document.querySelectorAll('.ledger-pane').forEach(pane => pane.style.display = 'none');
    document.querySelectorAll('.ledger-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = 'var(--text-muted)';
        btn.style.borderBottom = 'none';
        btn.style.marginBottom = '0';
    });

    const activePane = document.getElementById(`pane-ledger-${tabName}`);
    if (activePane) activePane.style.display = 'flex';

    const activeBtn = document.getElementById(`btn-ledger-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.color = 'var(--text-primary)';
        activeBtn.style.borderBottom = '2px solid var(--accent)';
        activeBtn.style.marginBottom = '-0.85rem';
    }

    if (tabName === 'analytics') {
        renderLedgerCharts();
    }
}

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
    
    // Reset dynamic split fields pane
    handleSplitTypeChange('equal');
    const splitTypeSelect = document.getElementById('exp-split-type');
    if (splitTypeSelect) splitTypeSelect.value = 'equal';
    
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

function handleSplitTypeChange(type) {
    const panel = document.getElementById('dynamic-split-panel');
    const fields = document.getElementById('dynamic-split-fields');
    const title = document.getElementById('dynamic-split-title');
    if (!panel || !fields) return;

    if (type === 'equal' || type === 'self') {
        panel.style.display = 'none';
        fields.innerHTML = '';
        return;
    }

    panel.style.display = 'flex';
    
    if (type === 'selective') {
        title.textContent = 'Include Specific Members';
        fields.innerHTML = state.groupMembers.map(m => `
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.82rem; cursor:pointer;">
                <input type="checkbox" class="selective-split-cb" value="${m}" checked>
                <span>${m}</span>
            </label>
        `).join('');
    } else if (type === 'custom') {
        title.textContent = 'Exact Share per Member (₹)';
        fields.innerHTML = state.groupMembers.map(m => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; font-size:0.82rem;">
                <span>${m}</span>
                <input type="number" class="custom-split-val" data-name="${m}" min="0" placeholder="₹ 0" style="width:100px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; font-size:0.8rem;">
            </div>
        `).join('');
    } else if (type === 'ratio') {
        title.textContent = 'Weight Ratio per Member';
        fields.innerHTML = state.groupMembers.map(m => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; font-size:0.82rem;">
                <span>${m}</span>
                <input type="number" class="ratio-split-val" data-name="${m}" min="0" value="1" step="any" style="width:100px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; font-size:0.8rem;">
            </div>
        `).join('');
    }
}

function handleLogExpenseSubmit(e) {
    e.preventDefault();
    const desc = document.getElementById('exp-desc').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const paidBy = document.getElementById('exp-paid-by').value;
    const category = document.getElementById('exp-category').value;
    const splitType = document.getElementById('exp-split-type').value;
    
    const shares = {};
    
    if (splitType === 'equal') {
        const shareAmt = amount / state.groupMembers.length;
        state.groupMembers.forEach(m => shares[m] = shareAmt);
    } else if (splitType === 'self') {
        state.groupMembers.forEach(m => shares[m] = 0);
        shares[paidBy] = amount;
    } else if (splitType === 'selective') {
        const checked = Array.from(document.querySelectorAll('.selective-split-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) {
            alert("⚠️ Please select at least one member to split this bill!");
            return;
        }
        const shareAmt = amount / checked.length;
        state.groupMembers.forEach(m => shares[m] = 0);
        checked.forEach(m => shares[m] = shareAmt);
    } else if (splitType === 'custom') {
        let totalCustom = 0;
        const inputs = document.querySelectorAll('.custom-split-val');
        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            const name = input.dataset.name;
            shares[name] = val;
            totalCustom += val;
        });
        
        // Validation: Sum must equal total amount within ₹1 tolerance
        if (Math.abs(totalCustom - amount) > 1.5) {
            alert(`⚠️ The sum of individual shares (₹${totalCustom.toLocaleString()}) does not match the total logged amount (₹${amount.toLocaleString()})! Please align the numbers.`);
            return;
        }
    } else if (splitType === 'ratio') {
        let totalRatio = 0;
        const ratios = {};
        const inputs = document.querySelectorAll('.ratio-split-val');
        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            const name = input.dataset.name;
            ratios[name] = val;
            totalRatio += val;
        });
        
        if (totalRatio <= 0) {
            alert("⚠️ Ratio weights must add up to more than 0!");
            return;
        }
        
        state.groupMembers.forEach(m => {
            const w = ratios[m] || 0;
            shares[m] = (w / totalRatio) * amount;
        });
    }
    
    const exp = {
        id: Date.now(),
        desc: desc,
        amount: amount,
        paidBy: paidBy,
        category: category,
        splitType: splitType,
        shares: shares
    };
    
    state.ledgerExpenses.push(exp);
    localStorage.setItem('ta_expenses', JSON.stringify(state.ledgerExpenses));
    
    // Reset inputs
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('settlement-form-card').style.display = 'none';
    
    initializeLedgerView();
}

function handleDeleteExpense(id) {
    state.ledgerExpenses = state.ledgerExpenses.filter(e => e.id !== id);
    localStorage.setItem('ta_expenses', JSON.stringify(state.ledgerExpenses));
    document.getElementById('settlement-form-card').style.display = 'none';
    initializeLedgerView();
}

function handleClearLedger() {
    state.ledgerExpenses = [];
    localStorage.removeItem('ta_expenses');
    document.getElementById('settlement-form-card').style.display = 'none';
    initializeLedgerView();
}

function renderLedgerHistoryList() {
    const list = document.getElementById('ledger-history-list');
    if (!list) return;
    
    if (state.ledgerExpenses.length === 0) {
        list.innerHTML = `<li style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No bills logged in the ledger yet.</li>`;
        return;
    }
    
    list.innerHTML = state.ledgerExpenses.map(e => {
        let details = `Paid by <strong>${e.paidBy}</strong>`;
        if (e.category === 'Settle') {
            details = `Settlement transaction: <strong>${e.paidBy}</strong> paid debt`;
        } else {
            const splitNames = Object.keys(e.shares || {}).filter(m => e.shares[m] > 0.05);
            details += ` • Split: ${e.splitType || 'equal'} (${splitNames.join(', ')})`;
        }
        
        const catBadge = `<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; padding:0.15rem 0.45rem; border-radius:100px; margin-left:0.5rem; background:rgba(124, 58, 237, 0.1); color:var(--accent);">${e.category || 'Misc'}</span>`;
        
        return `
            <li style="border:1px solid var(--border); border-radius:8px; padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center; background:#FAF9F6; font-size:0.85rem;">
                <div>
                    <strong>${e.desc}</strong> ${catBadge}
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                        ${details}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <strong style="color:var(--text-primary);">₹${Math.round(e.amount).toLocaleString('en-IN')}</strong>
                    <button onclick="handleDeleteExpense(${e.id})" style="color:#DC2626; font-weight:700; font-size:1.1rem; line-height:1; border:none; background:none; cursor:pointer;" title="Delete Bill">&times;</button>
                </div>
            </li>
        `;
    }).reverse().join('');
}

function calculateSettleUpLedger() {
    const blist = document.getElementById('ledger-balances-list-tab');
    const rlist = document.getElementById('ledger-resolutions-list-tab');
    const sidebarBlist = document.getElementById('ledger-balances-list');
    const sidebarRlist = document.getElementById('ledger-resolutions-list');
    
    if (!blist || !rlist) return;
    
    // Initialize empty balances map
    const balances = {};
    state.groupMembers.forEach(m => balances[m] = 0);
    
    let totalSpend = 0;
    let billsCount = 0;
    
    // Calculate net credit/debit for each person
    state.ledgerExpenses.forEach(e => {
        // Exclude settlement entries from total spend metrics
        if (e.category !== 'Settle') {
            totalSpend += e.amount;
            billsCount++;
        }
        
        // Add full paid amount to payer credit balance
        if (balances[e.paidBy] !== undefined) {
            balances[e.paidBy] += e.amount;
        }
        
        // Subtract share from splitters debit balance
        const expenseShares = e.shares || {};
        state.groupMembers.forEach(m => {
            const share = expenseShares[m] || 0;
            if (balances[m] !== undefined) {
                balances[m] -= share;
            }
        });
    });
    
    // Update summary widget
    document.getElementById('ledger-summary-total').textContent = `₹${Math.round(totalSpend).toLocaleString('en-IN')}`;
    document.getElementById('ledger-summary-count').textContent = `${billsCount} bill${billsCount !== 1 ? 's' : ''}`;
    
    // Render balances lists (both tab sheet and sidebar)
    const balancesHtml = Object.keys(balances).map(m => {
        const bal = balances[m];
        const color = bal > 0.05 ? '#00AA6C' : bal < -0.05 ? '#DC2626' : 'var(--text-muted)';
        const sign = bal > 0.05 ? '+' : '';
        return `
            <li style="display:flex; justify-content:space-between; border-bottom:1.5px dashed var(--border); padding-bottom:2px;">
                <span>${m}</span>
                <strong style="color:${color};">${sign}₹${Math.round(bal).toLocaleString('en-IN')}</strong>
            </li>
        `;
    }).join('');
    
    blist.innerHTML = balancesHtml;
    if (sidebarBlist) sidebarBlist.innerHTML = balancesHtml;
    
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
    
    // Update Settlement status badge in summary
    const summaryStatus = document.getElementById('ledger-summary-status');
    if (summaryStatus) {
        if (transactions.length === 0) {
            summaryStatus.textContent = "Fully Settled";
            summaryStatus.style.color = "var(--success)";
        } else {
            summaryStatus.textContent = `${transactions.length} Payment${transactions.length !== 1 ? 's' : ''} Due`;
            summaryStatus.style.color = "var(--accent)";
        }
    }
    
    if (transactions.length === 0) {
        const emptyMsg = `<li style="color:var(--text-muted); font-size:0.85rem; font-weight:normal; text-align:center; padding:1.5rem 0;">🎉 Group is fully settled!</li>`;
        rlist.innerHTML = emptyMsg;
        if (sidebarRlist) sidebarRlist.innerHTML = emptyMsg;
        return;
    }
    
    // Render resolutions to tab view (with action settle button)
    rlist.innerHTML = transactions.map(t => `
        <li style="border:1.5px solid var(--border); background:#FAF9F6; border-radius:10px; padding:0.6rem 1rem; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;">
            <div>
                💸 <strong>${t.from}</strong> owes <strong>${t.to}</strong>: <span style="font-weight:800; color:var(--accent);">₹${t.amount.toLocaleString('en-IN')}</span>
            </div>
            <button onclick="promptSettlement('${t.from}', '${t.to}', ${t.amount})" class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:6px; font-weight:600;">Settle Up</button>
        </li>
    `).join('');
    
    // Render resolutions to sidebar list (no actions)
    if (sidebarRlist) {
        sidebarRlist.innerHTML = transactions.map(t => `
            <li style="border:1.5px solid var(--accent); background:#FAFBF9; border-radius:6px; padding:0.4rem 0.75rem; margin-bottom:0.35rem; font-size:0.82rem;">
                💸 <strong>${t.from}</strong> owes <strong>${t.to}</strong>: <span style="font-size:0.9rem;">₹${t.amount.toLocaleString('en-IN')}</span>
            </li>
        `).join('');
    }
}

function promptSettlement(from, to, amount) {
    const card = document.getElementById('settlement-form-card');
    if (!card) return;
    
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    document.getElementById('settle-from-hidden').value = from;
    document.getElementById('settle-to-hidden').value = to;
    document.getElementById('settle-amount-hidden').value = amount;
    
    document.getElementById('settlement-text-desc').innerHTML = `🤝 <strong>${from}</strong> will pay <strong>${to}</strong> an amount of <strong style="color:var(--accent);">₹${amount.toLocaleString()}</strong>`;
}

function handleSettlementSubmit(e) {
    e.preventDefault();
    const from = document.getElementById('settle-from-hidden').value;
    const to = document.getElementById('settle-to-hidden').value;
    const amount = parseFloat(document.getElementById('settle-amount-hidden').value);
    const method = document.getElementById('settle-method').value;
    
    if (!from || !to || !amount) return;
    
    // Record special settlement expense entry
    // Payer is the debtor ('from'), and the debtor pays for the creditor ('to')
    const shares = {};
    state.groupMembers.forEach(m => shares[m] = 0);
    shares[to] = amount; // Payer ('from') gets credited by amount. Creditor ('to') gets debited by amount.
    
    const exp = {
        id: Date.now(),
        desc: `Settlement: ${from} paid ${to}`,
        amount: amount,
        paidBy: from,
        category: "Settle",
        splitType: "self",
        shares: shares
    };
    
    state.ledgerExpenses.push(exp);
    localStorage.setItem('ta_expenses', JSON.stringify(state.ledgerExpenses));
    
    document.getElementById('settlement-form-card').style.display = 'none';
    initializeLedgerView();
    
    alert(`🎉 Settlement recorded! ${from} paid ₹${amount.toLocaleString()} to ${to} via ${method}.`);
}

function renderLedgerCharts() {
    if (typeof Chart === 'undefined') return;
    
    // 1. Spend by Category
    const catData = { Stay: 0, Food: 0, Travel: 0, Sights: 0, Drinks: 0, Misc: 0 };
    // 2. Share of Spend by Member (sum of individual shares owed)
    const memberData = {};
    state.groupMembers.forEach(m => memberData[m] = 0);
    
    state.ledgerExpenses.forEach(e => {
        if (e.category === 'Settle') return; // Skip settlements
        
        catData[e.category || 'Misc'] += e.amount;
        
        const shares = e.shares || {};
        state.groupMembers.forEach(m => {
            memberData[m] += (shares[m] || 0);
        });
    });
    
    // Category Pie Chart
    const pieCtx = document.getElementById('expense-pie-chart')?.getContext('2d');
    if (pieCtx) {
        if (state.charts.pie) state.charts.pie.destroy();
        
        const labels = Object.keys(catData).filter(c => catData[c] > 0);
        const data = labels.map(c => catData[c]);
        
        const colors = {
            Stay: '#7C3AED',
            Food: '#F59E0B',
            Travel: '#3B82F6',
            Sights: '#10B981',
            Drinks: '#EF4444',
            Misc: '#6B7280'
        };
        const bgColors = labels.map(c => colors[c] || '#6B7280');
        
        if (labels.length === 0) {
            labels.push("No Expenses Logged");
            data.push(1);
            bgColors.push('#E5E7EB');
        }
        
        state.charts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, font: { size: 10, family: 'Plus Jakarta Sans' } }
                    }
                }
            }
        });
    }
    
    // Member Bar Chart
    const barCtx = document.getElementById('member-bar-chart')?.getContext('2d');
    if (barCtx) {
        if (state.charts.bar) state.charts.bar.destroy();
        
        const labels = Object.keys(memberData);
        const data = labels.map(m => Math.round(memberData[m]));
        
        state.charts.bar = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Individual Spend Share (₹)',
                    data: data,
                    backgroundColor: 'rgba(124, 58, 237, 0.75)',
                    borderColor: '#7C3AED',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 9 } }
                    },
                    x: {
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}

function exportLedgerCSV() {
    if (state.ledgerExpenses.length === 0) {
        alert("No bills logged to export.");
        return;
    }
    
    let csv = "ID,Description,Amount,PaidBy,Category,SplitType,SharesDetails\r\n";
    state.ledgerExpenses.forEach(e => {
        const shareStrs = [];
        const shares = e.shares || {};
        Object.keys(shares).forEach(m => {
            if (shares[m] > 0) shareStrs.push(`${m}:${Math.round(shares[m])}`);
        });
        
        csv += `${e.id},"${e.desc.replace(/"/g, '""')}",${e.amount},"${e.paidBy}","${e.category || 'Misc'}","${e.splitType || 'equal'}","${shareStrs.join(';')}"\r\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `TripSplit_Ledger_${state.currentCity || 'Trip'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportLedgerPDF() {
    if (state.ledgerExpenses.length === 0) {
        alert("No bills logged to export.");
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const billsHtml = state.ledgerExpenses.map(e => `
        <tr>
            <td>${e.desc}</td>
            <td><strong>${e.category || 'Misc'}</strong></td>
            <td>${e.paidBy}</td>
            <td>${e.splitType || 'equal'}</td>
            <td><strong>₹${Math.round(e.amount).toLocaleString('en-IN')}</strong></td>
        </tr>
    `).join('');
    
    printWindow.document.write(`
        <html>
        <head>
            <title>TripSplit Ledger Invoice Summary - ${state.currentCity || 'Trip'}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 2.5rem; color: #1F2937; }
                h1 { margin-bottom: 0.5rem; font-size: 1.8rem; color: #7C3AED; }
                h2 { margin-top: 1.5rem; font-size: 1.2rem; }
                table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; margin-bottom: 2rem; }
                th, td { border: 1px solid #E5E7EB; padding: 0.75rem 1rem; text-align: left; font-size: 0.88rem; }
                th { background: #FAF9F6; font-weight: bold; }
                .footer { font-size: 0.75rem; color: #6B7280; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 1.5rem; margin-top: 3rem; }
            </style>
        </head>
        <body>
            <h1>⚖️ TripSplit Group Ledger Invoice</h1>
            <p>Generated for group trip: <strong>${state.currentCity ? state.currentCity.toUpperCase() : 'Global Explore'}</strong></p>
            <p>Group Members: <strong>${state.groupMembers.join(', ')}</strong></p>
            
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Paid By</th>
                        <th>Split Method</th>
                        <th>Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${billsHtml}
                </tbody>
            </table>
            
            <div class="footer">
                Thank you for using TripSplit. Plan, split, and explore worldwide!
            </div>
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- HOMEPAGE BUDGET OPTIMIZER & AUTOCOMPLETE ROUTINES ---
state.homeOptPending = null;

function setupHomeOptimizerAutocomplete() {
    const input = document.getElementById('opt-home-destination');
    const dropdown = document.getElementById('opt-home-autocomplete');
    if (!input || !dropdown) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }
        
        const items = [
            { label: 'Jaipur', sub: 'Rajasthan, India' },
            { label: 'Goa', sub: 'India' },
            { label: 'Delhi', sub: 'National Capital Territory, India' },
            { label: 'Mumbai', sub: 'Maharashtra, India' },
            { label: 'Shimla', sub: 'Himachal Pradesh, India' },
            { label: 'Manali', sub: 'Himachal Pradesh, India' }
        ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
        
        let htmlContent = '';
        if (items.length > 0) {
            htmlContent = items.map(item => `
                <div class="autocomplete-item" onclick="selectHomeOptAutocomplete('${item.label.replace(/'/g, "\\'")}')" style="padding:0.5rem 0.75rem; cursor:pointer; font-size:0.85rem; display:flex; flex-direction:column;">
                    <strong style="color:var(--text-primary);">${item.label}</strong>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${item.sub}</span>
                </div>
            `).join('');
        }
        
        // Always append a clickable option to search/use the custom typed query
        const queryEscaped = query.replace(/'/g, "\\'");
        htmlContent += `
            <div class="autocomplete-item" onclick="selectHomeOptAutocomplete('${queryEscaped}')" style="padding:0.5rem 0.75rem; cursor:pointer; font-size:0.85rem; border-top: 1px solid var(--border); display:flex; flex-direction:column; background: #fafafa;">
                <strong style="color:var(--accent);">🔍 Use "${query}"</strong>
                <span style="font-size:0.7rem; color:var(--text-muted);">Explore custom location</span>
            </div>
        `;
        
        dropdown.innerHTML = htmlContent;
        dropdown.classList.remove('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#home-optimizer-form')) {
            dropdown.classList.add('hidden');
        }
    });
}

function showHomeOptAutocomplete() {
    const input = document.getElementById('opt-home-destination');
    const dropdown = document.getElementById('opt-home-autocomplete');
    if (input && input.value.trim().length > 0) {
        dropdown.classList.remove('hidden');
    }
}

function selectHomeOptAutocomplete(label) {
    const input = document.getElementById('opt-home-destination');
    const dropdown = document.getElementById('opt-home-autocomplete');
    if (input) input.value = label;
    if (dropdown) dropdown.classList.add('hidden');
}

function handleHomeOptimizerSubmit(event) {
    event.preventDefault();
    const city = document.getElementById('opt-home-destination').value.trim();
    const origin = document.getElementById('opt-home-origin').value.trim() || "Delhi";
    const budget = parseFloat(document.getElementById('opt-home-budget').value) || 30000;
    const budgetType = document.getElementById('opt-home-budget-type').value;
    const days = parseInt(document.getElementById('opt-home-days').value) || 5;
    const people = parseInt(document.getElementById('opt-home-people').value) || 5;
    
    const month = document.getElementById('opt-home-month').value;
    const pace = document.getElementById('opt-home-pace').value;
    const transport = document.getElementById('opt-home-transport').value;
    const stayType = document.getElementById('opt-home-stay').value;
    const interests = document.getElementById('opt-home-interests').value;
    
    if (!city) return;
    
    // Store optimization state variables
    state.homeOptPending = {
        destination: city,
        origin: origin,
        budget: budget,
        budgetType: budgetType,
        days: days,
        people: people,
        month: month,
        pace: pace,
        transport: transport,
        stayType: stayType,
        interests: interests
    };
    
    state.lastHomePreferences = state.homeOptPending;
    
    // Route to destination page and load
    navigateToDestinationOverview(city, "India");
}

function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function isIndianCity(city) {
    const indCities = ['jaipur', 'delhi', 'mumbai', 'goa', 'bangalore', 'bengaluru', 'kolkata', 'chennai', 'hyderabad', 'pune', 'agra', 'udaipur', 'himachal pradesh', 'shimla', 'manali', 'dharamshala', 'kerala', 'kochi', 'varanasi', 'rishikesh', 'mysore', 'mysuru', 'amritsar', 'jodhpur', 'jaisalmer', 'ooty', 'kodaikanal', 'darjeeling', 'gangtok', 'leh', 'ladakh', 'andaman', 'pondicherry', 'pushkar', 'mount abu', 'nainital', 'mussoorie', 'coorg', 'munnar', 'alleppey', 'hampi', 'khajuraho', 'lucknow', 'bhopal', 'chandigarh', 'srinagar', 'dehradun', 'haridwar'];
    return indCities.includes(city.toLowerCase().trim());
}

function getCountryForCity(city) {
    return "India";
}

// City-specific real fallback databases with accurate names, coordinates, and costs
const CITY_FALLBACK_DB = {
    'himachal pradesh': {
        hotels: [
            { id:'h1', name:'The Oberoi Wildflower Hall, Shimla', cost:28000, stars:5, sub_type:'Resort', lat:31.1048, lon:77.1734, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Oberoi Cecil, Shimla', cost:18000, stars:5, sub_type:'Hotel', lat:31.1048, lon:77.1734, wifi:true, pool:false, parking:true, bar:true },
            { id:'h3', name:'Johnson Lodge & Spa, Manali', cost:5500, stars:4, sub_type:'Hotel', lat:32.2396, lon:77.1887, wifi:true, pool:false, parking:true, bar:true },
            { id:'h4', name:'Zostel Manali', cost:600, stars:3.5, sub_type:'Hostel', lat:32.2432, lon:77.1893, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'Snow Valley Resorts, Shimla', cost:7200, stars:4, sub_type:'Resort', lat:31.1080, lon:77.1620, wifi:true, pool:true, parking:true, bar:true },
            { id:'h6', name:'Manu Allaya Spa Resort, Manali', cost:9500, stars:4.5, sub_type:'Resort', lat:32.2290, lon:77.1780, wifi:true, pool:true, parking:true, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'Cafe 1947, Old Manali', cost:500, stars:4.6, sub_type:'cafe', price_tier:2, lat:32.2510, lon:77.1870 },
            { id:'r2', name:'Johnson\'s Cafe, Manali', cost:700, stars:4.5, sub_type:'cafe', price_tier:2, lat:32.2396, lon:77.1887 },
            { id:'r3', name:'Hidimba Devi Dhaba, Manali', cost:300, stars:4.3, sub_type:'indian', price_tier:1, lat:32.2420, lon:77.1880 },
            { id:'r4', name:'Baljees Restaurant, Shimla', cost:600, stars:4.4, sub_type:'indian', price_tier:2, lat:31.1048, lon:77.1734 },
            { id:'r5', name:'Wake & Bake Cafe, Dharamkot', cost:400, stars:4.7, sub_type:'cafe', price_tier:2, lat:32.2470, lon:76.3210 }
        ],
        experiences: [
            { id:'e1', name:'Solang Valley Adventure Sports', original_cost:1500, stars:4.8, sub_type:'viewpoint', lat:32.3150, lon:77.1570 },
            { id:'e2', name:'Hadimba Temple, Manali', original_cost:0, stars:4.7, sub_type:'museum', lat:32.2434, lon:77.1890 },
            { id:'e3', name:'The Ridge & Mall Road Walk, Shimla', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:31.1048, lon:77.1734 },
            { id:'e4', name:'Rohtang Pass Snow Point', original_cost:600, stars:4.9, sub_type:'viewpoint', lat:32.3722, lon:77.2478 },
            { id:'e5', name:'Jakhu Temple & Hanuman Statue, Shimla', original_cost:0, stars:4.3, sub_type:'museum', lat:31.1118, lon:77.1793 },
            { id:'e6', name:'Triund Trek, Dharamshala', original_cost:0, stars:4.9, sub_type:'park', lat:32.2764, lon:76.3536 },
            { id:'e7', name:'Kufri Fun World & Snow Sports', original_cost:800, stars:4.2, sub_type:'park', lat:31.0980, lon:77.2620 }
        ]
    },
    'shimla': {
        hotels: [
            { id:'h1', name:'The Oberoi Wildflower Hall', cost:28000, stars:5, sub_type:'Resort', lat:31.1048, lon:77.1734, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Oberoi Cecil', cost:18000, stars:5, sub_type:'Hotel', lat:31.1048, lon:77.1734, wifi:true, pool:false, parking:true, bar:true },
            { id:'h3', name:'Hotel Combermere', cost:4500, stars:4, sub_type:'Hotel', lat:31.1040, lon:77.1730, wifi:true, pool:false, parking:true, bar:true },
            { id:'h4', name:'Snow Valley Resorts', cost:7200, stars:4, sub_type:'Resort', lat:31.1080, lon:77.1620, wifi:true, pool:true, parking:true, bar:true },
            { id:'h5', name:'Zostel Shimla', cost:700, stars:3.5, sub_type:'Hostel', lat:31.1060, lon:77.1740, wifi:true, pool:false, parking:false, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Baljees Restaurant', cost:600, stars:4.4, sub_type:'indian', price_tier:2, lat:31.1048, lon:77.1734 },
            { id:'r2', name:'Cafe Simla Times', cost:500, stars:4.5, sub_type:'cafe', price_tier:2, lat:31.1042, lon:77.1730 },
            { id:'r3', name:'Ashiana Restaurant at The Ridge', cost:800, stars:4.3, sub_type:'indian', price_tier:2, lat:31.1050, lon:77.1730 },
            { id:'r4', name:'Hide Out Cafe, Mall Road', cost:400, stars:4.2, sub_type:'cafe', price_tier:1, lat:31.1045, lon:77.1735 }
        ],
        experiences: [
            { id:'e1', name:'The Ridge & Mall Road Walk', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:31.1048, lon:77.1734 },
            { id:'e2', name:'Jakhu Temple & Hanuman Statue', original_cost:0, stars:4.3, sub_type:'museum', lat:31.1118, lon:77.1793 },
            { id:'e3', name:'Christ Church Heritage Visit', original_cost:0, stars:4.6, sub_type:'museum', lat:31.1042, lon:77.1730 },
            { id:'e4', name:'Kufri Fun World & Snow Sports', original_cost:800, stars:4.2, sub_type:'park', lat:31.0980, lon:77.2620 },
            { id:'e5', name:'Jakhoo Hill Sunset Point', original_cost:0, stars:4.4, sub_type:'viewpoint', lat:31.1118, lon:77.1793 },
            { id:'e6', name:'Shimla State Museum', original_cost:20, stars:4.0, sub_type:'museum', lat:31.1060, lon:77.1740 }
        ]
    },
    'manali': {
        hotels: [
            { id:'h1', name:'The Himalayan Resort & Spa', cost:12000, stars:4.5, sub_type:'Resort', lat:32.2396, lon:77.1887, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'Manu Allaya Spa Resort', cost:9500, stars:4.5, sub_type:'Resort', lat:32.2290, lon:77.1780, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'Johnson Lodge & Spa', cost:5500, stars:4, sub_type:'Hotel', lat:32.2396, lon:77.1887, wifi:true, pool:false, parking:true, bar:true },
            { id:'h4', name:'Zostel Manali', cost:600, stars:3.5, sub_type:'Hostel', lat:32.2432, lon:77.1893, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'Hotel Beas, Mall Road', cost:3200, stars:3.5, sub_type:'Hotel', lat:32.2410, lon:77.1890, wifi:true, pool:false, parking:true, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Cafe 1947, Old Manali', cost:500, stars:4.6, sub_type:'cafe', price_tier:2, lat:32.2510, lon:77.1870 },
            { id:'r2', name:'Johnson\'s Cafe', cost:700, stars:4.5, sub_type:'cafe', price_tier:2, lat:32.2396, lon:77.1887 },
            { id:'r3', name:'Drifters\' Inn & Cafe', cost:400, stars:4.4, sub_type:'cafe', price_tier:2, lat:32.2480, lon:77.1860 },
            { id:'r4', name:'Lazy Dog Lounge, Old Manali', cost:600, stars:4.3, sub_type:'cafe', price_tier:2, lat:32.2500, lon:77.1870 },
            { id:'r5', name:'Il Forno Italian Pizzeria', cost:550, stars:4.4, sub_type:'italian', price_tier:2, lat:32.2440, lon:77.1880 }
        ],
        experiences: [
            { id:'e1', name:'Solang Valley Adventure Sports', original_cost:1500, stars:4.8, sub_type:'viewpoint', lat:32.3150, lon:77.1570 },
            { id:'e2', name:'Hadimba Temple', original_cost:0, stars:4.7, sub_type:'museum', lat:32.2434, lon:77.1890 },
            { id:'e3', name:'Old Manali Village Walk', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:32.2510, lon:77.1870 },
            { id:'e4', name:'Rohtang Pass Snow Point', original_cost:600, stars:4.9, sub_type:'viewpoint', lat:32.3722, lon:77.2478 },
            { id:'e5', name:'Jogini Waterfall Trek', original_cost:0, stars:4.6, sub_type:'park', lat:32.2530, lon:77.1860 },
            { id:'e6', name:'Beas River Rafting', original_cost:1200, stars:4.7, sub_type:'beach', lat:32.2250, lon:77.1850 }
        ]
    },
    'goa': {
        hotels: [
            { id:'h1', name:'Taj Fort Aguada Resort & Spa', cost:22000, stars:5, sub_type:'Resort', lat:15.4909, lon:73.7735, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Leela Goa', cost:18000, stars:5, sub_type:'Resort', lat:15.1763, lon:73.9408, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'W Goa', cost:15000, stars:5, sub_type:'Hotel', lat:15.1570, lon:73.9640, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:'Zostel Goa Anjuna', cost:500, stars:3.5, sub_type:'Hostel', lat:15.5835, lon:73.7418, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'Old Quarter by Jehan Numa, Fontainhas', cost:6500, stars:4.5, sub_type:'Guest House', lat:15.5010, lon:73.8280, wifi:true, pool:false, parking:true, bar:true },
            { id:'h6', name:'Panjim Inn Heritage Hotel', cost:4200, stars:4, sub_type:'Hotel', lat:15.4989, lon:73.8282, wifi:true, pool:false, parking:true, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'Gunpowder, Assagao', cost:800, stars:4.7, sub_type:'indian', price_tier:2, lat:15.5747, lon:73.7715 },
            { id:'r2', name:'Vinayak Family Restaurant, Assagao', cost:350, stars:4.3, sub_type:'indian', price_tier:1, lat:15.5750, lon:73.7720 },
            { id:'r3', name:'Thalassa, Vagator', cost:1200, stars:4.6, sub_type:'cafe', price_tier:3, lat:15.6015, lon:73.7363 },
            { id:'r4', name:'Curlies Beach Shack, Anjuna', cost:400, stars:4.2, sub_type:'cafe', price_tier:1, lat:15.5860, lon:73.7400 },
            { id:'r5', name:'Martin\'s Corner, Betalbatim', cost:700, stars:4.5, sub_type:'indian', price_tier:2, lat:15.3120, lon:73.9100 }
        ],
        experiences: [
            { id:'e1', name:'Basilica of Bom Jesus, Old Goa', original_cost:0, stars:4.8, sub_type:'museum', lat:15.5009, lon:73.9116 },
            { id:'e2', name:'Fort Aguada & Lighthouse', original_cost:0, stars:4.6, sub_type:'viewpoint', lat:15.4922, lon:73.7735 },
            { id:'e3', name:'Dudhsagar Waterfall Trek', original_cost:400, stars:4.9, sub_type:'park', lat:15.3144, lon:74.3143 },
            { id:'e4', name:'Anjuna Flea Market & Beach', original_cost:0, stars:4.3, sub_type:'beach', lat:15.5835, lon:73.7418 },
            { id:'e5', name:'Calangute Beach & Shacks', original_cost:0, stars:4.4, sub_type:'beach', lat:15.5437, lon:73.7554 },
            { id:'e6', name:'Fontainhas Latin Quarter Walk', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:15.5010, lon:73.8280 },
            { id:'e7', name:'Palolem Beach Sunset Point', original_cost:0, stars:4.7, sub_type:'beach', lat:15.0100, lon:74.0230 },
            { id:'e8', name:'Miramar Beach, Panaji', original_cost:0, stars:4.2, sub_type:'beach', lat:15.4850, lon:73.8050 },
            { id:'e9', name:'Baga Beach, North Goa', original_cost:0, stars:4.4, sub_type:'beach', lat:15.5560, lon:73.7517 },
            { id:'e10', name:'Vagator Beach & Chapora Fort', original_cost:0, stars:4.6, sub_type:'viewpoint', lat:15.6030, lon:73.7335 },
            { id:'e11', name:'Dona Paula Viewpoint', original_cost:0, stars:4.1, sub_type:'viewpoint', lat:15.4600, lon:73.8020 },
            { id:'e12', name:'Arambol Beach Sweet Lake', original_cost:0, stars:4.6, sub_type:'beach', lat:15.6880, lon:73.7020 },
            { id:'e13', name:'Colva Beach, South Goa', original_cost:0, stars:4.3, sub_type:'beach', lat:15.2780, lon:73.9210 },
            { id:'e14', name:'Reis Magos Fort', original_cost:50, stars:4.4, sub_type:'museum', lat:15.4980, lon:73.8080 }
        ]
    },
    'delhi': {
        hotels: [
            { id:'h1', name:'The Imperial New Delhi', cost:25000, stars:5, sub_type:'Hotel', lat:28.6260, lon:77.2200, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'Taj Palace, Chanakyapuri', cost:20000, stars:5, sub_type:'Hotel', lat:28.5927, lon:77.1780, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'The Lalit New Delhi', cost:12000, stars:5, sub_type:'Hotel', lat:28.6330, lon:77.2190, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:'Zostel South Delhi', cost:700, stars:3.5, sub_type:'Hostel', lat:28.5355, lon:77.2500, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'Hotel Broadway, Old Delhi', cost:3500, stars:3.5, sub_type:'Hotel', lat:28.6512, lon:77.2290, wifi:true, pool:false, parking:true, bar:true },
            { id:'h6', name:'Bloomrooms @ Link Road', cost:3000, stars:3.5, sub_type:'Hotel', lat:28.6350, lon:77.2100, wifi:true, pool:false, parking:false, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Karim\'s, Jama Masjid', cost:400, stars:4.7, sub_type:'indian', price_tier:2, lat:28.6507, lon:77.2334 },
            { id:'r2', name:'Bukhara, ITC Maurya', cost:3500, stars:4.9, sub_type:'indian', price_tier:3, lat:28.5930, lon:77.1733 },
            { id:'r3', name:'Indian Accent, The Lodhi', cost:4000, stars:4.8, sub_type:'indian', price_tier:3, lat:28.5930, lon:77.2240 },
            { id:'r4', name:'Paranthe Wali Gali, Chandni Chowk', cost:200, stars:4.5, sub_type:'indian', price_tier:1, lat:28.6568, lon:77.2292 },
            { id:'r5', name:'The Big Chill Cafe, Khan Market', cost:800, stars:4.4, sub_type:'cafe', price_tier:2, lat:28.6002, lon:77.2272 }
        ],
        experiences: [
            { id:'e1', name:'Red Fort (Lal Qila)', original_cost:35, stars:4.7, sub_type:'museum', lat:28.6562, lon:77.2410 },
            { id:'e2', name:'Qutub Minar Complex', original_cost:35, stars:4.8, sub_type:'museum', lat:28.5245, lon:77.1855 },
            { id:'e3', name:'India Gate & Rajpath', original_cost:0, stars:4.6, sub_type:'viewpoint', lat:28.6129, lon:77.2295 },
            { id:'e4', name:'Humayun\'s Tomb', original_cost:35, stars:4.7, sub_type:'museum', lat:28.5933, lon:77.2507 },
            { id:'e5', name:'Chandni Chowk Heritage Walk', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:28.6560, lon:77.2300 },
            { id:'e6', name:'Lodhi Garden Morning Walk', original_cost:0, stars:4.4, sub_type:'park', lat:28.5930, lon:77.2190 },
            { id:'e7', name:'Akshardham Temple', original_cost:0, stars:4.8, sub_type:'museum', lat:28.6127, lon:77.2773 }
        ]
    },
    'mumbai': {
        hotels: [
            { id:'h1', name:'Taj Mahal Palace, Colaba', cost:30000, stars:5, sub_type:'Hotel', lat:18.9217, lon:72.8332, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Oberoi Mumbai', cost:22000, stars:5, sub_type:'Hotel', lat:18.9260, lon:72.8230, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'ITC Maratha, Andheri', cost:12000, stars:5, sub_type:'Hotel', lat:19.0970, lon:72.8660, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:'Zostel Mumbai', cost:700, stars:3.5, sub_type:'Hostel', lat:19.0178, lon:72.8478, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'Abode Bombay, Fort', cost:5000, stars:4, sub_type:'Hotel', lat:18.9350, lon:72.8350, wifi:true, pool:false, parking:false, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'Leopold Cafe, Colaba', cost:600, stars:4.3, sub_type:'cafe', price_tier:2, lat:18.9230, lon:72.8320 },
            { id:'r2', name:'Britannia & Co., Fort', cost:500, stars:4.7, sub_type:'indian', price_tier:2, lat:18.9340, lon:72.8390 },
            { id:'r3', name:'Trishna, Fort', cost:1500, stars:4.6, sub_type:'indian', price_tier:3, lat:18.9330, lon:72.8340 },
            { id:'r4', name:'Bademiya, Colaba', cost:350, stars:4.4, sub_type:'indian', price_tier:1, lat:18.9200, lon:72.8340 },
            { id:'r5', name:'Cafe Mondegar, Colaba', cost:500, stars:4.2, sub_type:'cafe', price_tier:2, lat:18.9225, lon:72.8315 }
        ],
        experiences: [
            { id:'e1', name:'Gateway of India', original_cost:0, stars:4.6, sub_type:'museum', lat:18.9220, lon:72.8347 },
            { id:'e2', name:'Marine Drive Sunset Walk', original_cost:0, stars:4.7, sub_type:'viewpoint', lat:18.9440, lon:72.8230 },
            { id:'e3', name:'Elephanta Caves Ferry', original_cost:500, stars:4.5, sub_type:'museum', lat:18.9634, lon:72.9315 },
            { id:'e4', name:'Chhatrapati Shivaji Terminus', original_cost:0, stars:4.6, sub_type:'museum', lat:18.9400, lon:72.8354 },
            { id:'e5', name:'Juhu Beach & Chowpatty', original_cost:0, stars:4.2, sub_type:'beach', lat:19.0880, lon:72.8268 },
            { id:'e6', name:'Dharavi Walking Tour', original_cost:800, stars:4.8, sub_type:'viewpoint', lat:19.0430, lon:72.8550 },
            { id:'e7', name:'Haji Ali Dargah', original_cost:0, stars:4.5, sub_type:'museum', lat:18.9827, lon:72.8089 }
        ]
    },
    'jaipur': {
        hotels: [
            { id:'h1', name:'Taj Rambagh Palace', cost:38000, stars:5, sub_type:'Hotel', lat:26.8981, lon:75.8078, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Oberoi Rajvilas', cost:32000, stars:5, sub_type:'Resort', lat:26.8791, lon:75.8821, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'Zostel Jaipur', cost:600, stars:3.5, sub_type:'Hostel', lat:26.9212, lon:75.8234, wifi:true, pool:false, parking:false, bar:false },
            { id:'h4', name:'Pearl Palace Heritage Guest House', cost:3200, stars:4.5, sub_type:'Guest House', lat:26.9189, lon:75.7891, wifi:true, pool:false, parking:true, bar:true },
            { id:'h5', name:'Samode Haveli', cost:14000, stars:4.5, sub_type:'Hotel', lat:26.9240, lon:75.8200, wifi:true, pool:true, parking:true, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'Laxmi Mishthan Bhandar (LMB)', cost:450, stars:4.5, sub_type:'indian', price_tier:2, lat:26.9201, lon:75.8281 },
            { id:'r2', name:'Peacock Rooftop Cafe', cost:600, stars:4.7, sub_type:'cafe', price_tier:2, lat:26.9178, lon:75.7901 },
            { id:'r3', name:'Chokhi Dhani Village Resort', cost:1200, stars:4.8, sub_type:'indian', price_tier:3, lat:26.7681, lon:75.8456 },
            { id:'r4', name:'Tapri Central, C-Scheme', cost:300, stars:4.4, sub_type:'cafe', price_tier:1, lat:26.9100, lon:75.7900 },
            { id:'r5', name:'Suvarna Mahal, Rambagh Palace', cost:3000, stars:4.9, sub_type:'indian', price_tier:3, lat:26.8981, lon:75.8078 }
        ],
        experiences: [
            { id:'e1', name:'Amber Fort & Palace', original_cost:500, stars:4.9, sub_type:'museum', lat:26.9856, lon:75.8512 },
            { id:'e2', name:'Hawa Mahal (Palace of Winds)', original_cost:50, stars:4.7, sub_type:'viewpoint', lat:26.9239, lon:75.8267 },
            { id:'e3', name:'City Palace Museum', original_cost:500, stars:4.6, sub_type:'museum', lat:26.9260, lon:75.8235 },
            { id:'e4', name:'Jantar Mantar Observatory', original_cost:200, stars:4.5, sub_type:'museum', lat:26.9248, lon:75.8242 },
            { id:'e5', name:'Nahargarh Fort Sunset Point', original_cost:200, stars:4.8, sub_type:'viewpoint', lat:26.9379, lon:75.8161 },
            { id:'e6', name:'Jal Mahal (Water Palace)', original_cost:0, stars:4.3, sub_type:'viewpoint', lat:26.9530, lon:75.8461 },
            { id:'e7', name:'Albert Hall Museum', original_cost:150, stars:4.4, sub_type:'museum', lat:26.9116, lon:75.8070 }
        ]
    },
    'bangalore': {
        hotels: [
            { id:'h1', name:'The Leela Palace Bengaluru', cost:20000, stars:5, sub_type:'Hotel', lat:12.9611, lon:77.6472, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'Taj West End', cost:15000, stars:5, sub_type:'Hotel', lat:12.9699, lon:77.5798, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'The Ritz-Carlton Bangalore', cost:18000, stars:5, sub_type:'Hotel', lat:12.9700, lon:77.5960, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:'Zostel Bangalore', cost:600, stars:3.5, sub_type:'Hostel', lat:12.9340, lon:77.6140, wifi:true, pool:false, parking:false, bar:false },
            { id:'h5', name:'The Paul Bangalore', cost:8000, stars:4, sub_type:'Hotel', lat:12.9588, lon:77.6487, wifi:true, pool:true, parking:true, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'MTR (Mavalli Tiffin Room)', cost:250, stars:4.8, sub_type:'indian', price_tier:1, lat:12.9523, lon:77.5756 },
            { id:'r2', name:'Vidyarthi Bhavan, Basavanagudi', cost:150, stars:4.7, sub_type:'indian', price_tier:1, lat:12.9465, lon:77.5716 },
            { id:'r3', name:'Toit Brewpub, Indiranagar', cost:1000, stars:4.5, sub_type:'cafe', price_tier:2, lat:12.9784, lon:77.6408 },
            { id:'r4', name:'Koshy\'s, St. Marks Road', cost:600, stars:4.3, sub_type:'cafe', price_tier:2, lat:12.9738, lon:77.5971 },
            { id:'r5', name:'Nagarjuna, Residency Road', cost:500, stars:4.6, sub_type:'indian', price_tier:2, lat:12.9701, lon:77.6021 }
        ],
        experiences: [
            { id:'e1', name:'Bangalore Palace', original_cost:230, stars:4.4, sub_type:'museum', lat:12.9988, lon:77.5920 },
            { id:'e2', name:'Lalbagh Botanical Garden', original_cost:20, stars:4.6, sub_type:'park', lat:12.9507, lon:77.5848 },
            { id:'e3', name:'Cubbon Park Morning Walk', original_cost:0, stars:4.5, sub_type:'park', lat:12.9763, lon:77.5929 },
            { id:'e4', name:'ISKCON Temple Rajajinagar', original_cost:0, stars:4.7, sub_type:'museum', lat:13.0104, lon:77.5513 },
            { id:'e5', name:'Nandi Hills Sunrise Trip', original_cost:0, stars:4.8, sub_type:'viewpoint', lat:13.3702, lon:77.6835 },
            { id:'e6', name:'Commercial Street Shopping', original_cost:0, stars:4.2, sub_type:'viewpoint', lat:12.9810, lon:77.6070 }
        ]
    },
    'kolkata': {
        hotels: [
            { id:'h1', name:'The Oberoi Grand', cost:16000, stars:5, sub_type:'Hotel', lat:22.5640, lon:88.3500, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'Taj Bengal', cost:14000, stars:5, sub_type:'Hotel', lat:22.5300, lon:88.3450, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'The Park Kolkata', cost:6000, stars:4, sub_type:'Hotel', lat:22.5440, lon:88.3510, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:'Zostel Kolkata', cost:500, stars:3.5, sub_type:'Hostel', lat:22.5650, lon:88.3520, wifi:true, pool:false, parking:false, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Peter Cat, Park Street', cost:600, stars:4.6, sub_type:'indian', price_tier:2, lat:22.5510, lon:88.3530 },
            { id:'r2', name:'Flurys, Park Street', cost:500, stars:4.5, sub_type:'cafe', price_tier:2, lat:22.5512, lon:88.3528 },
            { id:'r3', name:'6 Ballygunge Place', cost:700, stars:4.7, sub_type:'indian', price_tier:2, lat:22.5280, lon:88.3650 },
            { id:'r4', name:'Arsalan, Park Circus', cost:400, stars:4.6, sub_type:'indian', price_tier:2, lat:22.5380, lon:88.3580 }
        ],
        experiences: [
            { id:'e1', name:'Victoria Memorial Hall', original_cost:30, stars:4.8, sub_type:'museum', lat:22.5448, lon:88.3426 },
            { id:'e2', name:'Howrah Bridge Walk', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:22.5851, lon:88.3468 },
            { id:'e3', name:'Indian Museum', original_cost:50, stars:4.4, sub_type:'museum', lat:22.5582, lon:88.3515 },
            { id:'e4', name:'Dakshineswar Kali Temple', original_cost:0, stars:4.7, sub_type:'museum', lat:22.6553, lon:88.3573 },
            { id:'e5', name:'Kumartuli Idol Makers Lane', original_cost:0, stars:4.6, sub_type:'viewpoint', lat:22.5960, lon:88.3640 }
        ]
    },
    'varanasi': {
        hotels: [
            { id:'h1', name:'Taj Nadesar Palace', cost:25000, stars:5, sub_type:'Hotel', lat:25.3176, lon:83.0100, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'BrijRama Palace, Darbhanga Ghat', cost:15000, stars:5, sub_type:'Hotel', lat:25.3000, lon:83.0100, wifi:true, pool:false, parking:true, bar:true },
            { id:'h3', name:'Zostel Varanasi', cost:500, stars:3.5, sub_type:'Hostel', lat:25.3100, lon:83.0120, wifi:true, pool:false, parking:false, bar:false },
            { id:'h4', name:'Hotel Ganges View, Assi Ghat', cost:4500, stars:4, sub_type:'Hotel', lat:25.2890, lon:83.0060, wifi:true, pool:false, parking:true, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Blue Lassi Shop', cost:100, stars:4.8, sub_type:'cafe', price_tier:1, lat:25.3120, lon:83.0110 },
            { id:'r2', name:'Kashi Chat Bhandar', cost:100, stars:4.6, sub_type:'indian', price_tier:1, lat:25.3110, lon:83.0100 },
            { id:'r3', name:'Pizzeria Vaatika Cafe', cost:400, stars:4.5, sub_type:'cafe', price_tier:2, lat:25.2920, lon:83.0050 },
            { id:'r4', name:'Dosa Cafe, Assi Ghat', cost:250, stars:4.3, sub_type:'indian', price_tier:1, lat:25.2890, lon:83.0060 }
        ],
        experiences: [
            { id:'e1', name:'Dashashwamedh Ghat Aarti', original_cost:0, stars:4.9, sub_type:'viewpoint', lat:25.3048, lon:83.0108 },
            { id:'e2', name:'Sunrise Boat Ride on Ganges', original_cost:300, stars:4.9, sub_type:'viewpoint', lat:25.3000, lon:83.0100 },
            { id:'e3', name:'Sarnath Buddhist Ruins', original_cost:20, stars:4.6, sub_type:'museum', lat:25.3814, lon:83.0225 },
            { id:'e4', name:'Kashi Vishwanath Temple', original_cost:0, stars:4.8, sub_type:'museum', lat:25.3109, lon:83.0107 },
            { id:'e5', name:'Manikarnika Ghat Walk', original_cost:0, stars:4.4, sub_type:'viewpoint', lat:25.3108, lon:83.0108 }
        ]
    },
    'udaipur': {
        hotels: [
            { id:'h1', name:'Taj Lake Palace', cost:45000, stars:5, sub_type:'Hotel', lat:24.5740, lon:73.6812, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'The Oberoi Udaivilas', cost:38000, stars:5, sub_type:'Resort', lat:24.5680, lon:73.6770, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'Zostel Udaipur', cost:500, stars:3.5, sub_type:'Hostel', lat:24.5800, lon:73.6830, wifi:true, pool:false, parking:false, bar:false },
            { id:'h4', name:'Jagat Niwas Palace Hotel', cost:4000, stars:4, sub_type:'Hotel', lat:24.5770, lon:73.6830, wifi:true, pool:false, parking:true, bar:true }
        ],
        restaurants: [
            { id:'r1', name:'Ambrai Restaurant', cost:800, stars:4.7, sub_type:'indian', price_tier:2, lat:24.5760, lon:73.6810 },
            { id:'r2', name:'Savage Garden', cost:600, stars:4.5, sub_type:'cafe', price_tier:2, lat:24.5780, lon:73.6820 },
            { id:'r3', name:'Upre by 1559 AD', cost:1200, stars:4.6, sub_type:'indian', price_tier:3, lat:24.5790, lon:73.6830 },
            { id:'r4', name:'Millets of Mewar', cost:400, stars:4.4, sub_type:'indian', price_tier:2, lat:24.5770, lon:73.6825 }
        ],
        experiences: [
            { id:'e1', name:'City Palace Museum', original_cost:300, stars:4.8, sub_type:'museum', lat:24.5764, lon:73.6834 },
            { id:'e2', name:'Lake Pichola Boat Ride', original_cost:400, stars:4.9, sub_type:'viewpoint', lat:24.5740, lon:73.6812 },
            { id:'e3', name:'Jagdish Temple', original_cost:0, stars:4.5, sub_type:'museum', lat:24.5775, lon:73.6830 },
            { id:'e4', name:'Saheliyon-ki-Bari Garden', original_cost:30, stars:4.3, sub_type:'park', lat:24.5875, lon:73.6810 },
            { id:'e5', name:'Monsoon Palace Sunset', original_cost:80, stars:4.7, sub_type:'viewpoint', lat:24.5580, lon:73.6530 }
        ]
    },
    'agra': {
        hotels: [
            { id:'h1', name:'The Oberoi Amarvilas', cost:35000, stars:5, sub_type:'Hotel', lat:27.1681, lon:78.0419, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:'ITC Mughal, A Luxury Collection', cost:15000, stars:5, sub_type:'Resort', lat:27.1567, lon:78.0390, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:'Zostel Agra', cost:500, stars:3.5, sub_type:'Hostel', lat:27.1750, lon:78.0200, wifi:true, pool:false, parking:false, bar:false },
            { id:'h4', name:'Hotel Sheela, Taj Ganj', cost:1500, stars:3, sub_type:'Hotel', lat:27.1645, lon:78.0440, wifi:true, pool:false, parking:true, bar:false }
        ],
        restaurants: [
            { id:'r1', name:'Pinch of Spice', cost:500, stars:4.5, sub_type:'indian', price_tier:2, lat:27.1860, lon:78.0100 },
            { id:'r2', name:'Mama Chicken Mama Franky', cost:200, stars:4.2, sub_type:'indian', price_tier:1, lat:27.1850, lon:78.0110 },
            { id:'r3', name:'Esphahan, Oberoi Amarvilas', cost:3000, stars:4.8, sub_type:'indian', price_tier:3, lat:27.1681, lon:78.0419 },
            { id:'r4', name:'Bon Barbecue, Fatehabad Road', cost:700, stars:4.3, sub_type:'indian', price_tier:2, lat:27.1700, lon:78.0300 }
        ],
        experiences: [
            { id:'e1', name:'Taj Mahal', original_cost:1100, stars:5.0, sub_type:'museum', lat:27.1751, lon:78.0421 },
            { id:'e2', name:'Agra Fort', original_cost:550, stars:4.7, sub_type:'museum', lat:27.1795, lon:78.0211 },
            { id:'e3', name:'Mehtab Bagh (Moonlight Garden)', original_cost:200, stars:4.5, sub_type:'park', lat:27.1823, lon:78.0422 },
            { id:'e4', name:'Fatehpur Sikri', original_cost:610, stars:4.6, sub_type:'museum', lat:27.0939, lon:77.6612 },
            { id:'e5', name:'Tomb of Itimad-ud-Daulah (Baby Taj)', original_cost:110, stars:4.4, sub_type:'museum', lat:27.1935, lon:78.0309 }
        ]
    }
};

// Alias common city name variants
CITY_FALLBACK_DB['bengaluru'] = CITY_FALLBACK_DB['bangalore'];
CITY_FALLBACK_DB['new delhi'] = CITY_FALLBACK_DB['delhi'];
CITY_FALLBACK_DB['panaji'] = CITY_FALLBACK_DB['goa'];
CITY_FALLBACK_DB['panjim'] = CITY_FALLBACK_DB['goa'];
CITY_FALLBACK_DB['kochi'] = {
    hotels: [
        { id:'h1', name:'Taj Malabar Resort & Spa, Cochin', cost:14000, stars:5, sub_type:'Resort', lat:9.9657, lon:76.2385, wifi:true, pool:true, parking:true, bar:true },
        { id:'h2', name:'Brunton Boatyard, Fort Kochi', cost:12000, stars:4.5, sub_type:'Hotel', lat:9.9650, lon:76.2400, wifi:true, pool:true, parking:true, bar:true },
        { id:'h3', name:'Zostel Kochi', cost:500, stars:3.5, sub_type:'Hostel', lat:9.9600, lon:76.2420, wifi:true, pool:false, parking:false, bar:false },
        { id:'h4', name:'Old Harbour Hotel, Fort Kochi', cost:6000, stars:4, sub_type:'Hotel', lat:9.9640, lon:76.2390, wifi:true, pool:true, parking:true, bar:true }
    ],
    restaurants: [
        { id:'r1', name:'Fusion Bay, Fort Kochi', cost:600, stars:4.5, sub_type:'indian', price_tier:2, lat:9.9650, lon:76.2390 },
        { id:'r2', name:'Kashi Art Cafe', cost:400, stars:4.6, sub_type:'cafe', price_tier:2, lat:9.9640, lon:76.2395 },
        { id:'r3', name:'Dal Roti, Fort Kochi', cost:350, stars:4.4, sub_type:'indian', price_tier:1, lat:9.9645, lon:76.2400 }
    ],
    experiences: [
        { id:'e1', name:'Chinese Fishing Nets, Fort Kochi', original_cost:0, stars:4.5, sub_type:'viewpoint', lat:9.9670, lon:76.2420 },
        { id:'e2', name:'Mattancherry Palace', original_cost:5, stars:4.3, sub_type:'museum', lat:9.9580, lon:76.2590 },
        { id:'e3', name:'Kerala Backwaters Houseboat', original_cost:5000, stars:4.9, sub_type:'viewpoint', lat:9.4981, lon:76.3388 },
        { id:'e4', name:'Jew Town Antique Shopping', original_cost:0, stars:4.2, sub_type:'viewpoint', lat:9.9575, lon:76.2595 }
    ]
};
CITY_FALLBACK_DB['kerala'] = CITY_FALLBACK_DB['kochi'];
CITY_FALLBACK_DB['mysore'] = {
    hotels: [
        { id:'h1', name:'Radisson Blu Plaza, Mysore', cost:8000, stars:4.5, sub_type:'Hotel', lat:12.3051, lon:76.6551, wifi:true, pool:true, parking:true, bar:true },
        { id:'h2', name:'The Windflower Resort & Spa', cost:6500, stars:4, sub_type:'Resort', lat:12.2958, lon:76.6394, wifi:true, pool:true, parking:true, bar:true },
        { id:'h3', name:'Zostel Mysore', cost:500, stars:3.5, sub_type:'Hostel', lat:12.3100, lon:76.6550, wifi:true, pool:false, parking:false, bar:false }
    ],
    restaurants: [
        { id:'r1', name:'Vinayaka Mylari, Nazarbad', cost:100, stars:4.7, sub_type:'indian', price_tier:1, lat:12.3070, lon:76.6550 },
        { id:'r2', name:'Hotel RRR, Gandhi Square', cost:200, stars:4.5, sub_type:'indian', price_tier:1, lat:12.3060, lon:76.6540 },
        { id:'r3', name:'Oyster Bay, Gokulam', cost:700, stars:4.3, sub_type:'indian', price_tier:2, lat:12.3120, lon:76.6450 }
    ],
    experiences: [
        { id:'e1', name:'Mysore Palace', original_cost:70, stars:4.9, sub_type:'museum', lat:12.3051, lon:76.6551 },
        { id:'e2', name:'Chamundi Hills & Temple', original_cost:0, stars:4.6, sub_type:'viewpoint', lat:12.2726, lon:76.6702 },
        { id:'e3', name:'Brindavan Gardens', original_cost:20, stars:4.4, sub_type:'park', lat:12.4213, lon:76.5726 },
        { id:'e4', name:'St. Philomena\'s Cathedral', original_cost:0, stars:4.5, sub_type:'museum', lat:12.3160, lon:76.6530 }
    ]
};
CITY_FALLBACK_DB['mysuru'] = CITY_FALLBACK_DB['mysore'];

function getFallbackHotels(city) {
    const key = city.toLowerCase().trim();
    if (CITY_FALLBACK_DB[key]) return CITY_FALLBACK_DB[key].hotels;
    
    const c = capitalizeFirstLetter(city);
    const isInd = isIndianCity(city);
    
    if (isInd) {
        return [
            { id:'h1', name:`Taj ${c} Palace`, cost:18000, stars:5, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:`The Oberoi ${c} Resorts`, cost:15000, stars:5, sub_type:'Resort', lat:0, lon:0, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:`Zostel ${c} Backpackers`, cost:600, stars:3.5, sub_type:'Hostel', lat:0, lon:0, wifi:true, pool:false, parking:false, bar:false },
            { id:'h4', name:`Pearl ${c} Heritage Inn`, cost:3200, stars:4.5, sub_type:'Guest House', lat:0, lon:0, wifi:true, pool:false, parking:true, bar:true },
            { id:'h5', name:`Hotel ${c} Grand Central`, cost:2500, stars:3.5, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:false, parking:true, bar:false }
        ];
    } else {
        // Global / Western style names
        return [
            { id:'h1', name:`The Ritz-Carlton, ${c}`, cost:32000, stars:5, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:true, parking:true, bar:true },
            { id:'h2', name:`The Plaza Hotel ${c}`, cost:28000, stars:5, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:true, parking:true, bar:true },
            { id:'h3', name:`${c} Downtown Marriott`, cost:15000, stars:4, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:true, parking:true, bar:true },
            { id:'h4', name:`The ${c} Boutique Inn`, cost:8500, stars:4, sub_type:'Hotel', lat:0, lon:0, wifi:true, pool:false, parking:true, bar:true },
            { id:'h5', name:`Central Backpackers Hostel ${c}`, cost:1800, stars:3.5, sub_type:'Hostel', lat:0, lon:0, wifi:true, pool:false, parking:false, bar:false }
        ];
    }
}

function getFallbackRestaurants(city) {
    const key = city.toLowerCase().trim();
    if (CITY_FALLBACK_DB[key]) return CITY_FALLBACK_DB[key].restaurants;
    
    const c = capitalizeFirstLetter(city);
    const isInd = isIndianCity(city);
    
    if (isInd) {
        return [
            { id:'r1', name:`Royal ${c} Dhaba`, cost:450, stars:4.5, sub_type:'indian', price_tier:2, lat:0, lon:0 },
            { id:'r2', name:`Peacock Rooftop Cafe, ${c}`, cost:600, stars:4.7, sub_type:'cafe', price_tier:2, lat:0, lon:0 },
            { id:'r3', name:`${c} Sweets & Mishthan Bhandar`, cost:200, stars:4.3, sub_type:'indian', price_tier:1, lat:0, lon:0 },
            { id:'r4', name:`The Spice Route Kitchen`, cost:800, stars:4.4, sub_type:'indian', price_tier:2, lat:0, lon:0 }
        ];
    } else {
        return [
            { id:'r1', name:`The ${c} Grill & Bistro`, cost:1500, stars:4.6, sub_type:'bistro', price_tier:2, lat:0, lon:0 },
            { id:'r2', name:`Le Cafe de ${c}`, cost:900, stars:4.5, sub_type:'cafe', price_tier:2, lat:0, lon:0 },
            { id:'r3', name:`${c} Pizzeria & Tavern`, cost:600, stars:4.4, sub_type:'italian', price_tier:1, lat:0, lon:0 },
            { id:'r4', name:`The Steakhouse ${c}`, cost:2500, stars:4.7, sub_type:'steakhouse', price_tier:3, lat:0, lon:0 }
        ];
    }
}

function getFallbackExperiences(city) {
    const key = city.toLowerCase().trim();
    if (CITY_FALLBACK_DB[key]) return CITY_FALLBACK_DB[key].experiences;
    
    const c = capitalizeFirstLetter(city);
    const isInd = isIndianCity(city);
    
    if (isInd) {
        return [
            { id:'e1', name:`${c} Palace Heritage Walk`, original_cost:500, stars:4.8, sub_type:'museum', lat:0, lon:0 },
            { id:'e2', name:`${c} Fort View Photo Point`, original_cost:0, stars:4.7, sub_type:'viewpoint', lat:0, lon:0 },
            { id:'e3', name:`Central Green Park of ${c}`, original_cost:0, stars:4.3, sub_type:'park', lat:0, lon:0 },
            { id:'e4', name:`Local Craft Market & Bazaar`, original_cost:0, stars:4.4, sub_type:'viewpoint', lat:0, lon:0 }
        ];
    } else {
        return [
            { id:'e1', name:`${c} Castle & History Museum`, original_cost:1200, stars:4.8, sub_type:'museum', lat:0, lon:0 },
            { id:'e2', name:`${c} Eye & City Observation Deck`, original_cost:2500, stars:4.6, sub_type:'viewpoint', lat:0, lon:0 },
            { id:'e3', name:`Central Public Park of ${c}`, original_cost:0, stars:4.5, sub_type:'park', lat:0, lon:0 },
            { id:'e4', name:`River Cruise & Sightseeing Tour`, original_cost:1800, stars:4.7, sub_type:'beach', lat:0, lon:0 }
        ];
    }
}

window.openSwapStayModal = function(dayIdx) {
    const plan = state.activePlanType === "backup" ? state.lastPlanResult.backup : state.lastPlanResult;
    if (!plan || !plan.itinerary) return;
    
    const day = plan.itinerary[dayIdx];
    if (!day) return;
    
    const dayCity = day.city || plan.stops[0].city;
    const stop = plan.stops.find(s => s.city.toLowerCase() === dayCity.toLowerCase()) || plan.stops[0];
    if (!stop || !stop.all_hotels) return;
    
    const modal = document.getElementById("swap-stay-modal");
    const body = document.getElementById("swap-stay-modal-body");
    if (!modal || !body) return;
    
    body.innerHTML = stop.all_hotels.map(h => {
        const ratingStars = getBubbleRatingHtml(h.stars || 4);
        const isCurrent = h.name === day.stay_name;
        return `
            <div style="background:#FFFFFF; border:1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}; border-radius:10px; padding:0.85rem; display:flex; gap:0.75rem; align-items:center;">
                <div style="font-size:1.5rem;">🏨</div>
                <div style="flex-grow:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.85rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${h.name}</div>
                    <div style="display:flex; align-items:center; gap:0.35rem; margin-top:0.15rem;">
                        ${ratingStars}
                    </div>
                    <div style="font-size:0.8rem; color:var(--accent); font-weight:700; margin-top:0.25rem;">₹${Math.round(h.cost).toLocaleString('en-IN')} total stay</div>
                </div>
                ${isCurrent ? `
                    <span style="color:var(--accent); font-weight:800; font-size:0.75rem; padding:0.25rem 0.5rem; background:#E8F5E9; border-radius:4px;">Active</span>
                ` : `
                    <button class="btn-primary" onclick="swapStayForDay(${dayIdx}, '${h.name.replace(/'/g, "\\'")}', ${h.cost}, ${h.stars || 4})" style="padding:0.35rem 0.75rem; font-size:0.75rem; font-weight:700; border-radius:6px;">
                        Select
                    </button>
                `}
            </div>
        `;
    }).join("");
    
    modal.classList.remove("hidden");
};

window.closeSwapStayModal = function() {
    const modal = document.getElementById("swap-stay-modal");
    if (modal) modal.classList.add("hidden");
};

window.swapStayForDay = function(dayIdx, hotelName, hotelCost, hotelStars) {
    const plan = state.activePlanType === "backup" ? state.lastPlanResult.backup : state.lastPlanResult;
    if (!plan || !plan.itinerary) return;
    
    const day = plan.itinerary[dayIdx];
    if (!day) return;
    
    // Update the stay name and rating for that day
    day.stay_name = hotelName;
    day.stay_rating = hotelStars;
    
    const dayCity = day.city || plan.stops[0].city;
    const stop = plan.stops.find(s => s.city.toLowerCase() === dayCity.toLowerCase()) || plan.stops[0];
    
    if (stop) {
        const newHotel = stop.all_hotels.find(h => h.name === hotelName);
        const oldHotel = stop.hotel;
        const oldHotelCost = oldHotel ? (oldHotel.cost || 0) : 0;
        
        if (newHotel) {
            stop.hotel = newHotel;
            // Mark as optimized
            stop.all_hotels.forEach(h => h.optimized = (h.name === hotelName));
        }
        
        // Recalculate stay cost across all stops
        let newTotalStayCost = 0;
        plan.stops.forEach(s => {
            if (s.hotel) {
                const hCost = s.hotel.cost || 0;
                newTotalStayCost += hCost;
            }
        });
        
        // Update plan.budget_split.Stay and total_cost
        const oldStaySplit = plan.budget_split.Stay || 0;
        const delta = newTotalStayCost - oldStaySplit;
        plan.budget_split.Stay = newTotalStayCost;
        plan.total_cost += delta;
        const people = Math.round(plan.total_cost / plan.cost_per_person) || 1;
        plan.cost_per_person = plan.total_cost / people;
    }
    
    closeSwapStayModal();
    renderSelectedTripOption();
};

window.updateBudgetLivePreview = function() {
    const budgetInput = document.getElementById('opt-home-budget');
    const budgetTypeSelect = document.getElementById('opt-home-budget-type');
    const peopleInput = document.getElementById('opt-home-people');
    const previewEl = document.getElementById('home-budget-preview');
    
    if (!budgetInput || !budgetTypeSelect || !peopleInput || !previewEl) return;
    
    const budget = parseFloat(budgetInput.value) || 0;
    const type = budgetTypeSelect.value;
    const people = parseInt(peopleInput.value) || 1;
    
    if (type === "total") {
        const perPerson = Math.round(budget / people);
        previewEl.textContent = `₹${budget.toLocaleString('en-IN')} total ÷ ${people} people = ₹${perPerson.toLocaleString('en-IN')} per person`;
    } else {
        const total = budget * people;
        previewEl.textContent = `₹${budget.toLocaleString('en-IN')} per person × ${people} people = ₹${total.toLocaleString('en-IN')} total`;
    }
};

window.checkSeasonalWarning = function(city) {
    const seasonal_warnings = {
        "leh": { avoid: [11,12,1,2], reason: "Roads closed due to snow" },
        "manali": { avoid: [12,1,2], reason: "Heavy snowfall, limited access" },
        "cherrapunji": { avoid: [6,7,8], reason: "Extreme rainfall, flooding risk" },
        "goa": { avoid: [6,7,8,9], reason: "Monsoon season, most beaches closed" },
        "spiti": { avoid: [11,12,1,2,3], reason: "Valley cut off in winter" },
        "andaman": { avoid: [5,6,7,8,9], reason: "Cyclone season" },
        "rajasthan": { avoid: [5,6,7], reason: "Extreme heat 45°C+" },
        "kerala": { avoid: [6,7,8], reason: "Heavy monsoon flooding" }
    };
    
    const banner = document.getElementById('seasonal-warning-banner');
    const warningText = document.getElementById('seasonal-warning-text');
    if (banner && warningText) {
        banner.classList.add('hidden');
        const cityLower = city.toLowerCase().trim();
        let matchedKey = Object.keys(seasonal_warnings).find(k => cityLower.includes(k));
        
        if (matchedKey) {
            const warningInfo = seasonal_warnings[matchedKey];
            const currentMonthNum = new Date().getMonth() + 1;
            if (warningInfo.avoid.includes(currentMonthNum)) {
                const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const currentMonthName = monthNames[currentMonthNum];
                warningText.innerHTML = `Heads up — <strong>${capitalizeFirstLetter(city)}</strong> in <strong>${currentMonthName}</strong> has <strong>${warningInfo.reason}</strong>. Consider planning for a different time.`;
                banner.classList.remove('hidden');
            }
        }
    }
};

window.copyPlanToClipboard = function() {
    if (!state.tripOptions || state.tripOptions.length === 0) return;
    const opt = state.tripOptions[state.selectedOptionIndex];
    if (!opt) return;
    
    let text = `✈️ TRIP SPLIT PLAN: ${opt.style_name.toUpperCase()} ✈️\n`;
    text += `Route: ${opt.route_label}\n`;
    text += `Duration: ${opt.itinerary.length} Days\n`;
    text += `Total Cost: ₹${Math.round(opt.total_cost).toLocaleString('en-IN')}\n`;
    text += `Per Person Share: ₹${Math.round(opt.cost_per_person).toLocaleString('en-IN')}\n\n`;
    
    text += `🏨 ACCOMMODATION:\n`;
    opt.stops.forEach(stop => {
        if (stop.hotel) {
            text += `- ${stop.city}: ${stop.hotel.name} (₹${Math.round(stop.hotel.cost).toLocaleString('en-IN')} total stay, ${stop.hotel.stars || 4}★)\n`;
        } else {
            text += `- ${stop.city}: No stay hotel selected\n`;
        }
    });
    text += `\n`;
    
    text += `🍽️ RESTAURANTS:\n`;
    opt.stops.forEach(stop => {
        text += `- ${stop.city}:\n`;
        const uniqueRests = new Set();
        (stop.all_restaurants || []).slice(0, 3).forEach(r => {
            if (!uniqueRests.has(r.name)) {
                uniqueRests.add(r.name);
                text += `  * ${r.name} (${r.cuisine || 'Local'} cuisine)\n`;
            }
        });
    });
    text += `\n`;
    
    text += `🏛️ KEY ATTRACTIONS:\n`;
    opt.stops.forEach(stop => {
        text += `- ${stop.city}:\n`;
        (stop.all_sightseeing || []).filter(a => a.optimized).forEach(a => {
            const costStr = a.original_cost === 0 ? "FREE" : `₹${a.original_cost}`;
            text += `  * ${a.name} (${costStr})\n`;
        });
    });
    text += `\n`;
    text += `Generated with TripSplit Budget Optimizer 🚀`;
    
    navigator.clipboard.writeText(text).then(() => {
        const tooltip = document.getElementById("share-copied-tooltip");
        if (tooltip) {
            tooltip.classList.remove("hidden");
            setTimeout(() => {
                tooltip.classList.add("hidden");
            }, 2000);
        }
    }).catch(err => {
        console.error("Could not copy text: ", err);
    });
};



