// ==================== js/app.js ====================
// Global state, theme application, navigation, event binding, initialization
let state = {
    transactions: [],
    houses: [...DEFAULT_HOUSES],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    payers: [...DEFAULT_PAYERS],
    budgets: {},           // NEW: { [userId]: { [category]: limit } } — per-user budgets
    currency: '₹',
    paymentModes: ['CASH', 'UPI', 'BANK', 'ICICI CARD', 'SCB CARD'],
    electricRate: 8,
    theme: window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    fontSize: '15',
    recurringTemplates: [],
    sortAscending: true,
    bulkSelectMode: false,
    selectedTxIds: new Set(),
    activeScreen: 'screenDashboard',
    lastUpdated: 0,
    hasUnsyncedChanges: false,
    appLock: { enabled: false, credentialId: null, pinHash: null },
    currentUser: null,
    userRole: 'user', // 'admin' or 'user'
    userProfile: null,  // { displayName, email } from Firebase profiles/{uid}
    userGroup: {        // NEW: household/family group concept
        id: 'default',
        name: 'My Household',
        members: []     // { uid, displayName, email }
    },
    deletedTxIds: []  // Track deleted transaction IDs across sessions
};
let deferredPrompt;

function pulseSyncDot() {
    const dot = document.getElementById('syncStatusDot');
    if (dot) {
        dot.animate([
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.5)', filter: 'brightness(1.5)' },
            { transform: 'scale(1)', filter: 'brightness(1)' }
        ], { duration: 400, easing: 'ease-out' });
    }
}

function resetState() {
    state.transactions = [];
    state.houses = [];
    state.categories = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)) : { expense: [], groceries: [] };
    state.payers = [];
    state.paymentModes = ['CASH', 'UPI', 'BANK', 'ICICI CARD', 'SCB CARD'];
    state.budgets = {};
    state.electricRate = 8;
    state.recurringTemplates = [];
    state.selectedTxIds = new Set();
    state.bulkSelectMode = false;
    state.lastUpdated = 0;
    state.hasUnsyncedChanges = false;
    state.deletedTxIds = [];
}

// Firebase Sync override (Replacing storage.js local storage logic)
let _saveStateTimer = null;
let _localStorageTimer = null;
function saveState() {
    // Only mark unsynced if there's a Firebase user to sync to (skip for PIN-only users)
    if (state.currentUser) {
        state.hasUnsyncedChanges = true;
    }
    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
    
    // Invalidate visible transactions cache
    if (typeof invalidateTxCache === 'function') invalidateTxCache();
    
    // OPTIMIZATION: Throttle localStorage writes to 2 seconds max frequency
    if (_localStorageTimer) clearTimeout(_localStorageTimer);
    _localStorageTimer = setTimeout(() => {
        _localStorageTimer = null;
        try {
            localStorage.setItem('home_finlytics_state', JSON.stringify(state));
        } catch (e) { console.warn('Local storage disabled'); }
    }, 2000);

    // Debounce Firebase writes to avoid rate limiting
    if (_saveStateTimer) clearTimeout(_saveStateTimer);
    _saveStateTimer = setTimeout(() => {
        _saveStateTimer = null;
        if (typeof window.saveStateToFirebase === 'function' && navigator.onLine && state.currentUser) {
            // Guard: don't push to cloud until we've pulled from cloud at least once
            if (!window._cloudSyncDone) {
                window._cloudSyncRetries = (window._cloudSyncRetries || 0) + 1;
                if (window._cloudSyncRetries <= 10) {
                    saveState(); // Re-schedule the write
                }
                return;
            }
            window._cloudSyncRetries = 0;
            const syncPromise = window.saveStateToFirebase(state);
            if (syncPromise && syncPromise.then) {
                syncPromise.then(() => {
                    state.hasUnsyncedChanges = false;
                    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                    try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                    if (typeof pulseSyncDot === 'function') pulseSyncDot();
                }).catch(() => { /* Remains unsynced */ });
            }
        }
    }, 500); // 500ms debounce for Firebase writes
}

function loadState() {
    try {
        const saved = localStorage.getItem('home_finlytics_state');
        if (saved) Object.assign(state, JSON.parse(saved));

        // Restore preserved PIN auth data (survives sign-out)
        try {
            const savedAuth = localStorage.getItem('home_finlytics_auth');
            if (savedAuth) {
                const authData = JSON.parse(savedAuth);
                if (authData.pinHash || authData.credentialId) {
                    state.appLock = { ...state.appLock, ...authData };
                }
            }
        } catch(e) { /* ignore */ }

        // Ensure core structures exist if localStorage returned nulls
        if (!state.transactions) state.transactions = [];
        if (!state.categories) state.categories = { expense: [], groceries: [] };
        
        if (state.categories.expense) state.categories.expense = Object.values(state.categories.expense).filter(Boolean);
        if (state.categories.groceries) state.categories.groceries = Object.values(state.categories.groceries).filter(Boolean);
        
        ['expense', 'groceries'].forEach(type => {
            if (state.categories[type]) {
                state.categories[type].forEach(cat => {
                    if (cat.subcategories) {
                        cat.subcategories = Object.values(cat.subcategories).filter(Boolean);
                    }
                });
            }
        });
        
        if (state.houses) state.houses = Object.values(state.houses).filter(Boolean);
        if (state.recurringTemplates) state.recurringTemplates = Object.values(state.recurringTemplates).filter(Boolean);
        if (state.payers) state.payers = Object.values(state.payers).filter(Boolean);
        
        if (!state.categories.expense || state.categories.expense.length === 0) state.categories.expense = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.expense)) : [];
        if (!state.categories.groceries || state.categories.groceries.length === 0) state.categories.groceries = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.groceries)) : [];
        
        // MIGRATION: Ensure Landing category exists for existing users
        if (state.categories.expense && state.categories.expense.length > 0 && typeof DEFAULT_CATEGORIES !== 'undefined') {
            if (!state.categories.expense.some(c => c.name === 'Landing')) {
                const defLanding = DEFAULT_CATEGORIES.expense.find(c => c.name === 'Landing');
                if (defLanding) state.categories.expense.push(defLanding);
            }
            // Remove 'Landing' from Miscellaneous Expenses subcategories
            const miscCat = state.categories.expense.find(c => c.name === 'Miscellaneous Expenses');
            if (miscCat && miscCat.subcategories) {
                miscCat.subcategories = miscCat.subcategories.filter(s => s !== 'Landing');
            }
        }
        
        if (!state.houses) state.houses = [];
        if (!state.payers) state.payers = [];
        
        if (!state.budgets) state.budgets = {};
        if (!state.recurringTemplates) state.recurringTemplates = [];
        if (!state.deletedTxIds) state.deletedTxIds = [];
        if (state.appLock && state.appLock.pinHash === undefined) {
            state.appLock.pinHash = null;
        }
    } catch (e) { console.warn('Local storage disabled'); }
    
    // CRITICAL: JSON serialization destroys Set objects — always reinitialize
    state.selectedTxIds = new Set();
}

function onFirebaseDataReceived(firebaseData) {
    const cloudWriteId = firebaseData._cloudWriteId;
    const cloudLastUpdated = firebaseData._cloudLastUpdated || 0;

    // Clean up internal props before merging into state
    delete firebaseData._cloudWriteId;
    delete firebaseData._cloudLastUpdated;

    // ECHO PREVENTION: Skip if this write originated from this client
    // Check against the set of pending write IDs from firebase-sync.js
    if (cloudWriteId && window._firebasePendingWriteIds && window._firebasePendingWriteIds.has(cloudWriteId)) {
        window._firebasePendingWriteIds.delete(cloudWriteId);
        // Still update localStorage with current state for consistency
        try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
        return;
    }

    // CLOUD-FIRST STRATEGY: When logged in, cloud data ALWAYS wins.
    // Only skip if we have NO cloud data (empty firebase) and local has real data.
    const cloudHasData = (firebaseData.transactions && firebaseData.transactions.length > 0) ||
                         (firebaseData.categories && (firebaseData.categories.expense || firebaseData.categories.groceries)) ||
                         (firebaseData.houses && firebaseData.houses.length > 0);
    
    // During Force Refresh, always accept cloud data even if incomplete
    if (window._forceCloudPull) {
        // Keep waiting for more complete data — only apply when we have transactions or after 3 seconds
        if (!cloudHasData && !window._forceCloudPullTimer) {
            window._forceCloudPullTimer = setTimeout(() => {
                window._forceCloudPull = false;
                window._forceCloudPullTimer = null;
                if (typeof showToast === 'function') showToast('Cloud data loaded!', 'check-circle');
                if (window._forceCloudPullDone) { window._forceCloudPullDone(); window._forceCloudPullDone = null; }
            }, 3000);
            return; // Wait for transactions to arrive
        }
        if (cloudHasData) {
            window._forceCloudPull = false;
            if (window._forceCloudPullTimer) { clearTimeout(window._forceCloudPullTimer); window._forceCloudPullTimer = null; }
            if (typeof showToast === 'function') showToast('Cloud data loaded!', 'check-circle');
            if (window._forceCloudPullDone) { window._forceCloudPullDone(); window._forceCloudPullDone = null; }
        }
    }
    
    if (!cloudHasData && state.transactions && state.transactions.length > 0) {
        // Cloud is empty but we have local data — push local to cloud instead
        if (typeof window.saveStateToFirebase === 'function' && state.currentUser) {
            const syncPromise = window.saveStateToFirebase(state);
            if (syncPromise && syncPromise.then) {
                syncPromise.then(() => {
                    state.hasUnsyncedChanges = false;
                    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                    try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                }).catch(()=>{});
            }
        }
        return;
    }

    // Cloud has data — OVERWRITE local state with cloud data
    // Preserve UI-only properties that don't come from Firebase
    const uiOnly = {
        theme: state.theme,
        fontSize: state.fontSize,
        activeScreen: state.activeScreen,
        bulkSelectMode: state.bulkSelectMode,
        selectedTxIds: state.selectedTxIds,
        appLock: state.appLock,
        sortAscending: state.sortAscending
    };

    // Preserve locally-modified budgets and payers before cloud overwrite
    // Always keep local data that doesn't exist in cloud
    const localBudgets = state.budgets ? JSON.parse(JSON.stringify(state.budgets)) : {};
    const localPayers = [...(state.payers || [])];
    const hadUnsynced = state.hasUnsyncedChanges;

    Object.assign(state, firebaseData);
    Object.assign(state, uiOnly);
    
    // Merge back local budgets that don't exist in cloud
    if (!state.budgets) state.budgets = {};
    let mergedBudgets = false;
    Object.keys(localBudgets).forEach(scope => {
        if (!state.budgets[scope]) {
            state.budgets[scope] = localBudgets[scope];
            mergedBudgets = true;
        } else {
            Object.keys(localBudgets[scope]).forEach(cat => {
                if (!(cat in state.budgets[scope])) {
                    state.budgets[scope][cat] = localBudgets[scope][cat];
                    mergedBudgets = true;
                }
            });
        }
    });
    
    // Merge back local payers
    const existingPayers = new Set((state.payers || []).map(p => p.toLowerCase()));
    let mergedPayers = false;
    localPayers.forEach(p => {
        if (!existingPayers.has(p.toLowerCase())) {
            if (!state.payers) state.payers = [];
            state.payers.push(p);
            mergedPayers = true;
        }
    });
    
    state.lastUpdated = cloudLastUpdated || Date.now();
    // Keep unsynced if we preserved local changes
    state.hasUnsyncedChanges = hadUnsynced || mergedBudgets || mergedPayers;

    // Ensure core structures exist if Firebase returned null (Firebase removes empty arrays/objects)
    if (!state.transactions) state.transactions = [];
    // Filter out any transactions that were locally deleted (survives cloud overwrite)
    if (state.deletedTxIds && state.deletedTxIds.length > 0) {
        state.transactions = state.transactions.filter(t => !state.deletedTxIds.includes(t.id));
    }
    if (!state.categories) state.categories = { expense: [], groceries: [] };
    
    if (state.categories.expense) state.categories.expense = Object.values(state.categories.expense).filter(Boolean);
    if (state.categories.groceries) state.categories.groceries = Object.values(state.categories.groceries).filter(Boolean);
    
    ['expense', 'groceries'].forEach(type => {
        if (state.categories[type]) {
            state.categories[type].forEach(cat => {
                if (cat.subcategories) {
                    cat.subcategories = Object.values(cat.subcategories).filter(Boolean);
                }
            });
        }
    });

    if (state.houses && typeof state.houses === 'object' && !Array.isArray(state.houses)) {
        state.houses = Object.values(state.houses).filter(Boolean);
    }
    if (!state.houses) state.houses = [];
    if (state.recurringTemplates && typeof state.recurringTemplates === 'object' && !Array.isArray(state.recurringTemplates)) {
        state.recurringTemplates = Object.values(state.recurringTemplates).filter(Boolean);
    }
    if (!state.recurringTemplates) state.recurringTemplates = [];
    if (state.payers && typeof state.payers === 'object' && !Array.isArray(state.payers)) {
        state.payers = Object.values(state.payers).filter(Boolean);
    }
    if (!state.payers) state.payers = [];

    if (!state.categories.expense || state.categories.expense.length === 0) state.categories.expense = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.expense)) : [];
    if (!state.categories.groceries || state.categories.groceries.length === 0) state.categories.groceries = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.groceries)) : [];
    
    if (!state.budgets) state.budgets = {};

    // MIGRATION: Convert old flat budgets {cat: limit} to new per-user format {uid: {cat: limit}}
    if (state.budgets && typeof state.budgets === 'object') {
        const firstKey = Object.keys(state.budgets)[0];
        if (firstKey && typeof state.budgets[firstKey] === 'number') {
            // Old format detected — migrate to current user's budget
            const oldBudgets = state.budgets;
            const currentUserId = getCurrentUserId();
            state.budgets = {};
            state.budgets[currentUserId] = oldBudgets;
        }
        
        // MIGRATION: Move Groceries and House Rent budgets from per-user to shared/house scopes
        let needsBudgetMigration = false;
        Object.keys(state.budgets).forEach(scope => {
            if (scope.startsWith('__')) return; // Already shared/house scope
            const scopeBudgets = state.budgets[scope];
            if (!scopeBudgets || typeof scopeBudgets !== 'object') return;
            
            // Move Groceries to shared
            if (scopeBudgets['Groceries'] !== undefined) {
                if (!state.budgets['__shared__']) state.budgets['__shared__'] = {};
                if (!state.budgets['__shared__']['Groceries']) {
                    state.budgets['__shared__']['Groceries'] = scopeBudgets['Groceries'];
                }
                delete scopeBudgets['Groceries'];
                needsBudgetMigration = true;
            }
            
            // Move House Rent to per-house scope if a house exists
            if (scopeBudgets['House Rent'] !== undefined) {
                const houses = state.houses || [];
                const userHouse = houses.find(h => 
                    h.linkedUsers && h.linkedUsers.some(lu => lu.toLowerCase() === scope.toLowerCase())
                ) || houses[0]; // Fallback to first house
                if (userHouse) {
                    const houseKey = '__house_' + userHouse.id;
                    if (!state.budgets[houseKey]) state.budgets[houseKey] = {};
                    if (!state.budgets[houseKey]['House Rent']) {
                        state.budgets[houseKey]['House Rent'] = scopeBudgets['House Rent'];
                    }
                }
                delete scopeBudgets['House Rent'];
                needsBudgetMigration = true;
            }
            
            // Clean up empty scope
            if (Object.keys(scopeBudgets).length === 0) {
                delete state.budgets[scope];
            }
        });
        if (needsBudgetMigration) saveState();
    }

    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();

    // Apply structural migrations for Groceries and House Rent
    if (state.categories && state.categories.expense && typeof DEFAULT_CATEGORIES !== 'undefined') {
        let needsSave = false;
        
        if (!state.categories.expense.some(c => c.name === 'Groceries')) {
            const defGroc = DEFAULT_CATEGORIES.expense.find(c => c.name === 'Groceries');
            if (defGroc) { state.categories.expense.push(defGroc); needsSave = true; }
        }
        
        if (!state.categories.expense.some(c => c.name === 'House Rent')) {
            const defRent = DEFAULT_CATEGORIES.expense.find(c => c.name === 'House Rent');
            if (defRent) { state.categories.expense.push(defRent); needsSave = true; }
            const utilCat = state.categories.expense.find(c => c.name === 'Utilities');
            if (utilCat && utilCat.subcategories) utilCat.subcategories = utilCat.subcategories.filter(s => s !== 'House Rent');
        }
        
        // MIGRATION: Add Landing as a standalone category (moved from Miscellaneous subcategory)
        if (!state.categories.expense.some(c => c.name === 'Landing')) {
            const defLanding = DEFAULT_CATEGORIES.expense.find(c => c.name === 'Landing');
            if (defLanding) { state.categories.expense.push(defLanding); needsSave = true; }
        }
        // Remove 'Landing' subcategory from Miscellaneous Expenses if it exists
        const miscCat = state.categories.expense.find(c => c.name === 'Miscellaneous Expenses');
        if (miscCat && miscCat.subcategories) {
            const hadLanding = miscCat.subcategories.includes('Landing');
            if (hadLanding) {
                miscCat.subcategories = miscCat.subcategories.filter(s => s !== 'Landing');
                needsSave = true;
            }
        }
        
        if (state.categories.groceries && state.categories.groceries.some(c => c.name === 'Vegetables')) {
            state.categories.groceries = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.groceries));
            needsSave = true;
        }

        if (state.transactions) {
            let txUpdated = false;
            state.transactions.forEach(tx => {
                if (tx.type === 'groceries' && tx.category !== 'Groceries') {
                    tx.subcategory = tx.subcategory ? `${tx.category}: ${tx.subcategory}` : tx.category;
                    tx.category = 'Groceries';
                    txUpdated = true;
                }
            });
            if (txUpdated) needsSave = true;
        }

        if (needsSave && state.userRole === 'admin') saveState();
    }

    // UPDATE LOCAL STORAGE to match cloud state
    try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}

    // Mark cloud sync as complete — allows Firebase writes to proceed
    window._cloudSyncDone = true;
    window._cloudSyncRetries = 0;

    // CRITICAL: JSON serialization destroys Set objects — always reinitialize
    state.selectedTxIds = new Set();

    if (typeof pulseSyncDot === 'function') pulseSyncDot();
    if (typeof refreshAll === 'function') refreshAll();
}
window.onFirebaseDataReceived = onFirebaseDataReceived;

window.updateDashboardSyncBadge = function() {
    const badge = document.getElementById('dashboardSyncBadge');
    if (badge) {
        // Only show sync badge when Firebase user is signed in; PIN-only users can't sync
        badge.style.display = (state.hasUnsyncedChanges && state.currentUser) ? 'flex' : 'none';
    }
};

window.triggerManualSync = function() {
    if (!navigator.onLine) {
        if (typeof showToast === 'function') showToast('You are currently offline.', 'wifi');
        return;
    }
    if (!state.currentUser) {
        if (typeof showToast === 'function') showToast('Sign in with Google to enable cloud sync.', 'cloud');
        return;
    }
    const icon = document.querySelector('#retrySyncBtn i');
    if (icon) icon.classList.add('fa-spin');
    
    // First push any pending changes to Firebase
    if (typeof window.saveStateToFirebase === 'function') {
        const syncPromise = window.saveStateToFirebase(state);
        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => {
                state.hasUnsyncedChanges = false;
                if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                if (typeof pulseSyncDot === 'function') pulseSyncDot();
                if (typeof showToast === 'function') showToast('Sync successful!', 'check-circle');
                
                // After successful push, detach and re-attach listeners to pull fresh data
                if (typeof window.detachFirebaseListeners === 'function') {
                    window.detachFirebaseListeners();
                }
                if (window._firebasePendingWriteIds) {
                    window._firebasePendingWriteIds.clear();
                }
                if (typeof window.listenToFirebaseState === 'function') {
                    window.listenToFirebaseState(window.onFirebaseDataReceived, state.userRole);
                }
            }).catch(() => {
                if (typeof showToast === 'function') showToast('Sync failed. Will retry later.', 'times-circle');
            }).finally(() => {
                if (icon) icon.classList.remove('fa-spin');
            });
        }
    }
};

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.setProperty('--font-size-base', state.fontSize+'px');
    document.documentElement.style.setProperty('--font-size-sm', (parseInt(state.fontSize)-2)+'px');
    document.documentElement.style.setProperty('--font-size-lg', (parseInt(state.fontSize)+2)+'px');
    document.documentElement.style.setProperty('--font-size-xl', (parseInt(state.fontSize)+5)+'px');
    document.documentElement.style.setProperty('--font-size-xxl', (parseInt(state.fontSize)+13)+'px');
    const track = document.getElementById('themeToggleTrack');
    if(track) track.classList.toggle('active', state.theme==='dark');
    const wrap = document.getElementById('themeToggleWrap');
    if(wrap) wrap.setAttribute('aria-checked', state.theme === 'dark' ? 'true' : 'false');
    applyRoleRestrictions();
}

function applyRoleRestrictions() {
    const isAdmin = state.userRole === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        // For <option> elements, use hidden attribute (CSS display:none doesn't work on options)
        if (el.tagName === 'OPTION') {
            el.hidden = !isAdmin;
            el.disabled = !isAdmin;
        } else {
            el.style.display = isAdmin ? '' : 'none';
        }
    });
}

// ==================== PROFILE MODAL ====================
function openProfileModal() {
    if (!state.currentUser) return;
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    
    document.getElementById('profileDisplayName').value = state.currentUser.name || '';
    document.getElementById('profileEmail').value = state.currentUser.email || '';
    document.getElementById('profileError').style.display = 'none';
    modal.style.display = 'flex';
    updateGoogleLinkUI();
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

async function saveProfile() {
    const displayName = document.getElementById('profileDisplayName').value.trim();
    const errEl = document.getElementById('profileError');
    errEl.style.display = 'none';
    
    if (!displayName) {
        errEl.textContent = 'Display name cannot be empty.';
        errEl.style.display = 'block';
        return;
    }
    
    if (!state.currentUser) return;
    
    // Save to Firebase
    if (typeof window.saveUserProfile === 'function') {
        try {
            await window.saveUserProfile(state.currentUser, { displayName });
        } catch (e) {
            errEl.textContent = 'Failed to save profile: ' + e.message;
            errEl.style.display = 'block';
            return;
        }
    }
    
    // Update local state
    state.currentUser.name = displayName;
    state.userProfile = { displayName, email: state.currentUser.email };
    
    // Update header
    const headerUserName = document.getElementById('headerUserName');
    if (headerUserName) headerUserName.textContent = displayName;
    
    closeProfileModal();
    if (typeof showToast === 'function') showToast('Profile updated!', 'check-circle');
    // Refresh spender breakdown in analytics if visible
    if (state.activeScreen === 'screenAnalytics' && typeof refreshAnalytics === 'function') {
        refreshAnalytics();
    }
}

function toggleTheme() {
    state.theme = state.theme==='dark'?'light':'dark';
    applyTheme(); saveState(); refreshAllCharts();
    showToast(`Theme: ${state.theme==='dark'?'Dark Mode':'Light Mode'}`,'palette');
}

function navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabBtn = document.querySelector(`.tab-btn[data-screen="${screenId}"]`);
    if(tabBtn) tabBtn.classList.add('active');
    state.activeScreen = screenId;
    if(screenId==='screenDashboard') { refreshDashboard(); if (typeof bindDashboardChipEvents === 'function') bindDashboardChipEvents(); }
    if(screenId==='screenTransactions' && typeof refreshTransactionList === 'function') {
        // Force invalidate cache and refresh immediately when navigating to transactions
        if (typeof invalidateTxCache === 'function') invalidateTxCache();
        // Bypass throttle for navigation-triggered refresh
        if (refreshTransactionList._throttle) clearTimeout(refreshTransactionList._throttle);
        refreshTransactionList._throttle = null;
        refreshTransactionList();
    }
    if(screenId==='screenAnalytics') refreshAnalytics();
    if(screenId==='screenSettings') refreshSettings();
    if(screenId==='screenAdd') {
        refreshAddForm();
        // Reset scroll to top
        const scrollEl = document.querySelector('#screenAdd .screen-scroll');
        if (scrollEl) scrollEl.scrollTop = 0;
        // Reset form
        const form = document.getElementById('addTransactionForm');
        if (form) {
            form.reset();
            form.dataset.editId = '';
            form.dataset.editTemplateIndex = '';
        }
        // Auto-focus amount field on mobile for quick entry
        setTimeout(() => {
            const amtInput = document.getElementById('addAmount');
            if (amtInput && window.innerWidth <= 768) {
                amtInput.focus();
            }
            // Reset sticky total
            updateStickyAddTotal();
        }, 300);
    }
    if(screenId==='screenReceipt') {
        refreshReceiptForm();
        const previewCard = document.getElementById('receiptPreviewCard');
        if (previewCard) previewCard.style.display = 'none';
    }
}

// FIX: Use requestAnimationFrame to batch refreshAll calls and reduce layout thrashing
let _refreshAllPending = false;
function refreshAll() {
    if (_refreshAllPending) return;
    _refreshAllPending = true;
    requestAnimationFrame(() => {
        _refreshAllPending = false;
        const scr = state.activeScreen;
        if(scr==='screenDashboard') refreshDashboard();
        else if(scr==='screenTransactions' && typeof refreshTransactionList === 'function') refreshTransactionList();
        else if(scr==='screenAnalytics') refreshAnalytics();
        else if(scr==='screenSettings') refreshSettings();
        else if(scr==='screenAdd') refreshAddForm();
        else if(scr==='screenReceipt') refreshReceiptForm();
    });
}

function refreshAllCharts() {
    if(state.activeScreen==='screenDashboard') renderDashboardCharts();
    if(state.activeScreen==='screenAnalytics') renderAnalyticsCharts();
}

// ==================== Event Binding ====================
function bindNavigationEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.screen === 'screenAdd') {
                const form = document.getElementById('addTransactionForm');
                if (form) {
                    form.dataset.editId = '';
                    form.dataset.editTemplateIndex = '';
                }
            }
            navigateTo(btn.dataset.screen);
        });
    });
    document.getElementById('settingsFloatingBtn')?.addEventListener('click', () => navigateTo('screenSettings'));
    document.getElementById('headerLogoLink')?.addEventListener('click', () => navigateTo('screenDashboard'));
}

function bindDashboardEvents() {
    // Bind filter chip events
    if (typeof bindDashboardChipEvents === 'function') bindDashboardChipEvents();
    
    document.getElementById('budgetOverviewList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.share-budget-btn');
        if (btn) {
            e.stopPropagation();
            const cat = btn.dataset.cat;
            const spent = btn.dataset.spent;
            const limit = btn.dataset.limit;
            const pct = Math.round((parseFloat(spent) / parseFloat(limit)) * 100);
            const text = `Budget update for ${cat}: Spent ${typeof formatCurrency === 'function' ? formatCurrency(spent) : spent} of ${typeof formatCurrency === 'function' ? formatCurrency(limit) : limit} (${pct}% used).`;
            
            if (navigator.share) {
                try {
                    await navigator.share({ title: 'Budget Update', text });
                } catch (err) {
                    navigator.clipboard.writeText(text).then(() => { if (typeof showToast === 'function') showToast('Copied to clipboard!', 'copy'); });
                }
            } else {
                navigator.clipboard.writeText(text).then(() => { if (typeof showToast === 'function') showToast('Copied to clipboard!', 'copy'); });
            }
        }
    });

    document.getElementById('retrySyncBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.triggerManualSync === 'function') window.triggerManualSync();
    });
}

function bindTransactionEvents() {
    document.getElementById('addCategory')?.addEventListener('change', updateSubcategoryDropdown);
    document.getElementById('addType')?.addEventListener('change', () => {
        refreshAddForm();
        updateSubcategoryDropdown();
    });
    // Show hint about linked users for rent form
    document.getElementById('addHouse')?.addEventListener('change', function() {
        const hint = document.getElementById('addHouseAdminHint');
        if (!hint) return;
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        const selectedHouse = houses.find(h => h.id === this.value);
        if (selectedHouse && selectedHouse.linkedUsers && selectedHouse.linkedUsers.length > 0) {
            const linkedNames = selectedHouse.linkedUsers.map(lu => getUserDisplayName(lu)).join(', ');
            hint.innerHTML = `<i class="fas fa-users"></i> Linked to: ${escapeHTML(linkedNames)}`;
            hint.style.display = 'block';
        } else if (selectedHouse) {
            hint.innerHTML = `<i class="fas fa-info-circle"></i> This house has no linked users. Rent will only be visible to you.`;
            hint.style.display = 'block';
        } else {
            hint.style.display = 'none';
        }
    });
    document.getElementById('addTransactionForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        const editId = this.dataset.editId;
        const editTemplateIndex = this.dataset.editTemplateIndex;
        const typeVal = document.getElementById('addType').value;   // FIX: undefined variable
        const splitWith = Array.from(document.querySelectorAll('#addSplitCheckboxes input:checked')).map(cb => cb.value);
        const txData = {
            type: typeVal,
            category: document.getElementById('addCategory').value,
            subcategory: document.getElementById('addSubcategory').value || '',
            amount: parseFloat(document.getElementById('addAmount').value),
            date: document.getElementById('addDate').value,
            notes: document.getElementById('addNotes').value || '',
            userId: getCurrentUserId(),  // Auto-set from current user
            payer: document.getElementById('addPayerOverride')?.value || (state.currentUser ? state.currentUser.name : 'Unknown'),
            paymentMethod: document.getElementById('addPaymentMethod')?.value || 'cash',
            splitWith: splitWith.length > 0 ? splitWith : null,
            // House/Rent tracking
            houseId: document.getElementById('addHouse')?.value || '',
            // Landing tracking fields
            borrower: document.getElementById('addBorrower')?.value || '',
            landingStatus: document.getElementById('addLandingStatus')?.value || 'active',
        };
            if (editTemplateIndex !== undefined && editTemplateIndex !== '') {
            const idx = parseInt(editTemplateIndex);
            state.recurringTemplates[idx] = {
                category: txData.category,
                subcategory: txData.subcategory,
                amount: txData.amount,
                type: txData.type,
                paymentMethod: txData.paymentMethod
            };
            saveState();
            this.dataset.editTemplateIndex = '';
            this.reset();
            refreshAddForm();
            showToast('Template updated!', 'check-circle');
            return;
        }
        if (editId) {
            const updated = updateTransaction(editId, txData);
            if (!updated) return; // Abort if update validation failed
            this.dataset.editId = '';
        } else {
            const tx = addTransaction(txData);
            if (!tx) return; // Abort if add validation failed
            if (document.getElementById('addIsRecurring')?.checked) {
                state.recurringTemplates.push({ category: txData.category, subcategory: txData.subcategory, amount: txData.amount, type: txData.type, paymentMethod: txData.paymentMethod });
                saveState();
            }
        }
        this.reset();
        refreshAddForm();
        navigateTo('screenTransactions');
        // Cleanup custom subcategory input
        setTimeout(() => {
            document.getElementById('addSubcategory').value = '';
            const row = document.getElementById('addCustomSubcatRow');
            if (row) row.style.display = 'none';
            const customInput = document.getElementById('addCustomSubcatInput');
            if (customInput) customInput.value = '';
        }, 10);
    });

    document.getElementById('recurringTemplatesList')?.addEventListener('click', function(e) {
        const loadBtn = e.target.closest('.load-template-btn');
        if (loadBtn) {
            const idx = parseInt(loadBtn.dataset.index);
            const t = state.recurringTemplates[idx];
            if (t) {
                document.getElementById('addType').value = t.type;
                refreshAddForm();
                document.getElementById('addCategory').value = t.category;
                if (typeof updateSubcategoryDropdown === 'function') updateSubcategoryDropdown();
                document.getElementById('addSubcategory').value = t.subcategory || '';
                document.getElementById('addAmount').value = t.amount;
                document.getElementById('addPaymentMethod').value = t.paymentMethod || 'cash';
                document.getElementById('addDate').value = new Date().toISOString().slice(0, 10);
                showToast('Template loaded!', 'redo');
            }
            return;
        }
        const editBtn = e.target.closest('.edit-template-btn');
        if (editBtn) {
            const idx = parseInt(editBtn.dataset.index);
            const t = state.recurringTemplates[idx];
            if (t) {
                const form = document.getElementById('addTransactionForm');
                form.dataset.editTemplateIndex = idx;
                document.getElementById('addType').value = t.type;
                refreshAddForm();
                document.getElementById('addCategory').value = t.category;
                if (typeof updateSubcategoryDropdown === 'function') updateSubcategoryDropdown();
                document.getElementById('addSubcategory').value = t.subcategory || '';
                document.getElementById('addAmount').value = t.amount;
                document.getElementById('addPaymentMethod').value = t.paymentMethod || 'cash';
                showToast('Editing template...', 'edit');
                document.querySelector('#screenAdd .screen-scroll').scrollTop = 0;
            }
            return;
        }
        const deleteBtn = e.target.closest('.delete-template-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            deleteRecurringTemplate(index);
        }
    });

    document.getElementById('addSubcategory')?.addEventListener('change', function() {
        const row = document.getElementById('addCustomSubcatRow');
        if (this.value === '__new__') {
            if (row) row.style.display = 'flex';
        } else {
            if (row) row.style.display = 'none';
        }
    });

    ['filterSearch', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', refreshTransactionList);
    });
    ['filterCategory', 'filterSubcategory', 'filterPayer', 'filterLandingStatus', 'filterDateFrom', 'filterDateTo', 'sortBy'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', refreshTransactionList);
    });
    
    // Toggle advanced filters on mobile
    document.getElementById('toggleFilterBtn')?.addEventListener('click', function() {
        const advanced = document.getElementById('filterAdvanced');
        if (advanced) {
            const isVisible = advanced.style.display !== 'none';
            advanced.style.display = isVisible ? 'none' : 'block';
            this.querySelector('i').className = isVisible ? 'fas fa-sliders-h' : 'fas fa-times';
            this.style.color = isVisible ? '' : 'var(--accent)';
        }
    });
    
    // filterType needs populateFilterCategories before refreshTransactionList
    document.getElementById('filterType')?.addEventListener('change', () => {
        populateFilterCategories();
        refreshTransactionList();
    });
    document.getElementById('sortToggleBtn')?.addEventListener('click', function() {
        state.sortAscending = !state.sortAscending;
        this.querySelector('i').className = state.sortAscending ? 'fas fa-arrow-down' : 'fas fa-arrow-up';
        refreshTransactionList();
    });
    
    const clearAllFilters = function() {
        ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterLandingStatus', 'filterSearch', 'filterDateFrom', 'filterDateTo', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
        });
        // Hide landing status filter when clearing
        const landingFilter = document.getElementById('filterLandingStatus');
        if (landingFilter) landingFilter.style.display = 'none';
        refreshTransactionList();
    };
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);
    document.getElementById('floatingClearFiltersBtn')?.addEventListener('click', clearAllFilters);
    
    document.getElementById('bulkSelectToggleBtn')?.addEventListener('click', function() {
        state.bulkSelectMode = !state.bulkSelectMode;
        state.selectedTxIds.clear();
        this.textContent = state.bulkSelectMode ? 'Cancel Select' : 'Select';
        refreshTransactionList();
    });
    document.getElementById('bulkCancelBtn')?.addEventListener('click', function() {
        state.bulkSelectMode = false;
        state.selectedTxIds.clear();
        document.getElementById('bulkSelectToggleBtn').textContent = 'Select';
        refreshTransactionList();
    });
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', function() {
        if (state.selectedTxIds.size > 0) {
            showConfirm('Delete Selected', `Delete ${state.selectedTxIds.size} transactions?`, 'trash-alt', () => {
                deleteMultipleTransactions(new Set(state.selectedTxIds));
                state.bulkSelectMode = false;
                document.getElementById('bulkSelectToggleBtn').textContent = 'Select';
            });
        }
    });
}

function bindSettingsEvents() {
    // Theme & font size
    document.getElementById('themeToggleWrap')?.addEventListener('click', toggleTheme);
    document.getElementById('themeToggleWrap')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTheme(); }
    });
    document.getElementById('fontSizeSelect')?.addEventListener('change', function() {
        state.fontSize = this.value; applyTheme(); saveState(); refreshAllCharts();
    });

    // Currency & Rates
    document.getElementById('currencySelect')?.addEventListener('change', function() {
        state.currency = this.value; saveState(); refreshAll(); showToast('Currency updated to ' + this.value, 'coins');
    });

    // Categories & Subcategories
    document.getElementById('settingsCatType')?.addEventListener('change', function() {
        const type = this.value;
        refreshSettingsCatList(type);
        populateSettingsCategorySelect(type);
        // FIX: Reset subcategory list since category selection may no longer be valid
        const subcatContainer = document.getElementById('subcatList');
        if (subcatContainer) subcatContainer.innerHTML = '<p style="color:var(--text-tertiary);">Select a category to manage subcategories.</p>';
    });
    document.getElementById('settingsCategorySelect')?.addEventListener('change', function() {
        const type = document.getElementById('settingsCatType')?.value || 'expense';
        refreshSubcategoryList(type);
    });

    document.getElementById('addSubcatBtn')?.addEventListener('click', () => {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        const type = document.getElementById('settingsCatType').value;
        const catName = document.getElementById('settingsCategorySelect').value;
        const subName = document.getElementById('newSubcatName').value.trim();
        const subIcon = document.getElementById('newSubcatIcon')?.value || '';
        if (!catName || !subName) return showToast('Select category and enter subcategory name', 'exclamation-triangle');
        
        // Find and update the category in ALL type collections (sync Groceries across expense + groceries)
        let found = false;
        ['expense', 'groceries'].forEach(t => {
            if (!state.categories?.[t]) return;
            const cats = Object.values(state.categories[t]).filter(Boolean);
            const cat = cats.find(c => c.name === catName);
            if (cat) {
                if (!cat.subcategories) cat.subcategories = [];
                if (!cat.subcategoryIcons) cat.subcategoryIcons = {};
                if (!cat.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
                    cat.subcategories.push(subName);
                    if (subIcon) cat.subcategoryIcons[subName] = subIcon;
                    found = true;
                }
            }
        });
        if (!found) return showToast('Category not found', 'exclamation-triangle');
        
        saveState();
        refreshSubcategoryList(type);
        document.getElementById('newSubcatName').value = '';
        if (document.getElementById('newSubcatIcon')) document.getElementById('newSubcatIcon').value = '';
        showToast('Subcategory added!', 'check-circle');
    });

    document.getElementById('subcatList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-subcat-btn');
        if (!btn) return;
        if (state.userRole !== 'admin') return;
        const catName = btn.dataset.cat;
        const sub = btn.dataset.sub;
        const type = document.getElementById('settingsCatType').value;
        
        // Remove from ALL type collections to keep copies in sync
        ['expense', 'groceries'].forEach(t => {
            if (!state.categories?.[t]) return;
            const cats = Object.values(state.categories[t]).filter(Boolean);
            const cat = cats.find(c => c.name === catName);
            if (cat && cat.subcategories) {
                cat.subcategories = cat.subcategories.filter(s => s !== sub);
            }
        });
        saveState();
        refreshSubcategoryList(type);
        showToast('Subcategory removed.', 'trash-alt');
    });

    // Category Color & Emoji Picker Injection
    const newCatColorInput = document.getElementById('newCatColor');
    if (newCatColorInput && !document.getElementById('randomCatColorBtn')) {
        const rndBtn = document.createElement('button');
        rndBtn.id = 'randomCatColorBtn';
        rndBtn.type = 'button';
        rndBtn.className = 'btn btn-sm btn-secondary';
        rndBtn.innerHTML = '<i class="fas fa-dice"></i>';
        rndBtn.title = 'Choose Random Color';
        rndBtn.style.marginLeft = '8px';
        
        rndBtn.addEventListener('click', () => {
            const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            newCatColorInput.value = randomColor;
        });
        
        newCatColorInput.parentNode.insertBefore(rndBtn, newCatColorInput.nextSibling);

        const iconWrap = document.createElement('div');
        iconWrap.style.position = 'relative';
        iconWrap.style.display = 'inline-block';
        iconWrap.style.marginRight = '8px';

        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.id = 'newCatIcon';
        iconInput.placeholder = '😀';
        iconInput.className = 'form-input';
        iconInput.style.width = '60px';
        iconInput.style.textAlign = 'center';
        iconInput.style.cursor = 'pointer';
        iconInput.style.fontSize = '1.2rem';
        iconInput.readOnly = true;

        const picker = document.createElement('div');
        picker.id = 'emojiPickerModal';
        picker.style.cssText = 'display:none; position:absolute; top:120%; left:0; width:260px; background:var(--bg-glass); backdrop-filter:blur(10px); border:1px solid var(--divider); border-radius:8px; padding:8px; z-index:1000; box-shadow:0 8px 24px rgba(0,0,0,0.2); flex-wrap:wrap; gap:4px; max-height:160px; overflow-y:auto;';
        
        const commonEmojis = ["💰","💸","🍔","🍜","🚌","🚗","🎬","🎮","💡","🏠","🛍️","🏥","💊","📚","💆","💳","📦","🥬","🍎","🐟","💧","🥩","🥛","🍚","🍪","☕","🧂","🧼","🐶","🐱","✈️","📱","💻","🎉","⚽","🎵","👔","🔧","🛠️","🪴","🍕","🌮","🍣","🧁","🛵","🚲","🎸","🎯","💅","🧘","📝","🏦","🪙","🌈","⭐"];
        commonEmojis.forEach(em => {
            const span = document.createElement('span');
            span.textContent = em;
            span.style.cssText = 'font-size:1.4rem; cursor:pointer; padding:6px; border-radius:4px; transition:background 0.2s; display:inline-block; line-height:1;';
            span.onmouseover = () => span.style.background = 'rgba(128,128,128,0.2)';
            span.onmouseout = () => span.style.background = 'transparent';
            span.onclick = () => {
                iconInput.value = em;
                picker.style.display = 'none';
            };
            picker.appendChild(span);
        });

        iconInput.onclick = (e) => {
            e.stopPropagation();
            if (picker.style.display === 'flex') {
                picker.style.display = 'none';
                return;
            }
            // Move to body to escape stacking context
            if (picker.parentNode !== document.body) document.body.appendChild(picker);
            const rect = iconInput.getBoundingClientRect();
            picker.style.position = 'fixed';
            picker.style.top = (rect.bottom + 4) + 'px';
            picker.style.left = rect.left + 'px';
            picker.style.display = 'flex';
        };

        document.addEventListener('click', (e) => {
            if (e.target !== iconInput && !picker.contains(e.target)) {
                picker.style.display = 'none';
            }
            if (e.target !== subcatIconInput && !subcatPicker.contains(e.target)) {
                subcatPicker.style.display = 'none';
            }
        });

        iconWrap.appendChild(iconInput);
        iconWrap.appendChild(picker);
        newCatColorInput.parentNode.insertBefore(iconWrap, newCatColorInput);
    }

    // Subcategory emoji picker initialization
    const subcatIconInput = document.getElementById('newSubcatIcon');
    const subcatPicker = document.getElementById('subcatEmojiPicker');
    if (subcatIconInput && subcatPicker) {
        const subcatEmojis = [
            // Food & Dining
            "🥦","🍎","🐟","🥩","🥛","🌾","🍿","🥤","🧂","🧹","🍽️","🍔","🥪","☕","🍕","🌮","🍣","🥗","🧁","🍩","🥐","🍜","🍝","🧀","🥚","🍚","🥜","🍯","🧃","🍺","🍷","🥂","🐔","🍗",
            // Transport
            "🚌","🚗","⛽","✈️","🅿️","🚲","🛵","🚂","🚢","🚁","🛴","🏍️","🚖","🚊","🛞",
            // Shopping & Retail
            "🛍️","👕","💻","🛋️","🍳","🎁","⌚","👟","👜","👗","🧥","📱","💡","🪑","🖼️","🧸","📦",
            // Healthcare & Wellness
            "🩺","💊","🏋️","🦷","👓","🧘","🏥","🩹","💉","🧬","🫁","🩻",
            // Entertainment & Hobbies
            "🎬","🎮","🎪","📺","🎨","🎵","🎤","🎸","🎯","🎲","♟️","📷","🎭","🕹️",
            // Household & Utilities
            "💧","🌐","🔥","🗑️","⚡","🪣","🧴","🧼","🧻","🪥","🫧",
            // Personal Care
            "💇","💄","✨","🧖","💅","🪒","🧬","🫦","👄",
            // Education & Office
            "📖","📚","🎓","✏️","📝","🖊️","📐","🔬","🎒","📋","💼",
            // Finance & Money
            "💳","💰","🔑","💸","🪙","📊","🏦","🧾","💵",
            // Travel & Places
            "🏠","🏛️","🚚","🏨","🏖️","⛺","🗽","🌍","🏔️",
            // Nature & Weather
            "🌧️","❄️","🌈","🌙","⭐","🔥","💐","🌻","🍀",
            // People & Social
            "👥","🤝","🗣️","❤️","👨‍👩‍👧‍👦","💬","📞","📧",
            // Symbols
            "⚠️","✅","❌","⭐","🔴","🟢","🔵","📌","📍","🏷️","📤","🔄","➕","➖"
        ];
        subcatEmojis.forEach(em => {
            const span = document.createElement('span');
            span.textContent = em;
            span.style.cssText = 'font-size:1.4rem;cursor:pointer;padding:4px;border-radius:4px;transition:background 0.2s;display:inline-block;line-height:1;';
            span.onmouseover = () => span.style.background = 'rgba(128,128,128,0.2)';
            span.onmouseout = () => span.style.background = 'transparent';
            span.onclick = () => { subcatIconInput.value = em; subcatPicker.style.display = 'none'; };
            subcatPicker.appendChild(span);
        });
        subcatIconInput.onclick = (e) => {
            e.stopPropagation();
            if (subcatPicker.style.display === 'flex') {
                subcatPicker.style.display = 'none';
                return;
            }
            // Move to body to escape stacking context
            if (subcatPicker.parentNode !== document.body) document.body.appendChild(subcatPicker);
            const rect = subcatIconInput.getBoundingClientRect();
            subcatPicker.style.position = 'fixed';
            subcatPicker.style.top = (rect.bottom + 4) + 'px';
            subcatPicker.style.left = rect.left + 'px';
            subcatPicker.style.display = 'flex';
        };
    }

    document.getElementById('addCatBtn')?.addEventListener('click', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        const type = document.getElementById('settingsCatType')?.value || 'expense';
        const name = document.getElementById('newCatName').value.trim();
        const color = document.getElementById('newCatColor').value;
        const icon = document.getElementById('newCatIcon')?.value || '📁';
        if (!name) { showToast('Enter a category name', 'exclamation-triangle'); return; }
        if (!state.categories) state.categories = {};
        if (!state.categories[type]) state.categories[type] = [];
        if (state.categories[type].find(c => c.name.toLowerCase() === name.toLowerCase())) {
            showToast('Category already exists', 'exclamation-triangle');
            return;
        }
        state.categories[type].push({ name, icon, color, subcategories: [] });
        saveState();
        document.getElementById('newCatName').value = '';
        if (document.getElementById('newCatIcon')) document.getElementById('newCatIcon').value = '';
        if (document.getElementById('newCatColor')) document.getElementById('newCatColor').value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        refreshSettingsCatList(type);
        populateSettingsCategorySelect(type); // Refresh the "Select Category to Manage" dropdown
        refreshAll();
        showToast('Category added!', 'check-circle');
    });

    document.getElementById('settingsCatList')?.addEventListener('click', function(e) {
        const btn = e.target.closest('.remove-cat-btn');
        if (btn) {
            if (state.userRole !== 'admin') return;
            const type = btn.dataset.type;
            const name = btn.dataset.name;
            if (state.categories?.[type]) state.categories[type] = state.categories[type].filter(c => c.name !== name);
            saveState();
            refreshSettingsCatList();
            refreshAll();
            showToast('Category removed!', 'trash-alt');
        }
    });

    document.getElementById('restoreDefaultCatsBtn')?.addEventListener('click', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        showConfirm('Restore Defaults', 'Are you sure you want to restore default categories? Any custom categories or subcategories you created will be lost.', 'undo', () => {
            if (typeof DEFAULT_CATEGORIES !== 'undefined') {
                state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
                saveState();
                const type = document.getElementById('settingsCatType')?.value || 'expense';
                if (typeof refreshSettingsCatList === 'function') refreshSettingsCatList(type);
                if (typeof populateSettingsCategorySelect === 'function') populateSettingsCategorySelect(type);
                if (typeof refreshSubcategoryList === 'function') refreshSubcategoryList(type);
                if (typeof refreshAll === 'function') refreshAll();
                showToast('Default categories restored!', 'check-circle');
            }
        });
    });

    // Payers - all users can manage household members
    document.getElementById('addPayerBtn')?.addEventListener('click', () => {
        const name = document.getElementById('newPayerName').value.trim();
        if (!name) return showToast('Enter a name', 'exclamation-triangle');
        if (state.payers.some(p => p.toLowerCase() === name.toLowerCase())) return showToast('Name already exists', 'exclamation-triangle');
        state.payers.push(name);
        saveState();
        renderPayerList();
        document.getElementById('newPayerName').value = '';
        showToast('Member added!', 'check-circle');
    });
    document.getElementById('payerList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-payer-btn');
        if (!btn) return;
        const index = parseInt(btn.dataset.index);
        state.payers.splice(index, 1);
        saveState();
        renderPayerList();
        showToast('Member removed.', 'trash-alt');
    });

    // Payment Modes
    document.getElementById('addPaymentModeBtn')?.addEventListener('click', () => {
        const name = document.getElementById('newPaymentMode').value.trim().toUpperCase();
        if (!name) return showToast('Enter a payment mode', 'exclamation-triangle');
        if (!state.paymentModes) state.paymentModes = ['CASH', 'UPI', 'BANK', 'ICICI CARD', 'SCB CARD'];
        if (state.paymentModes.includes(name)) return showToast('Payment mode already exists', 'exclamation-triangle');
        state.paymentModes.push(name);
        saveState();
        if (typeof renderPaymentModeList === 'function') renderPaymentModeList();
        if (typeof refreshPaymentModeSelects === 'function') refreshPaymentModeSelects();
        document.getElementById('newPaymentMode').value = '';
        showToast('Payment mode added!', 'credit-card');
    });
    document.getElementById('paymentModeList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-payment-mode-btn');
        if (!btn) return;
        const index = parseInt(btn.dataset.index);
        if (!state.paymentModes) state.paymentModes = ['CASH', 'UPI', 'BANK', 'ICICI CARD', 'SCB CARD'];
        state.paymentModes.splice(index, 1);
        saveState();
        if (typeof renderPaymentModeList === 'function') renderPaymentModeList();
        if (typeof refreshPaymentModeSelects === 'function') refreshPaymentModeSelects();
        showToast('Payment mode removed.', 'trash-alt');
    });

    // Budgets - three-tier: shared groceries, per-house rent, per-user
    document.getElementById('addBudgetBtn')?.addEventListener('click', function() {
        const cat = document.getElementById('budgetCatSelect').value;
        const limit = parseFloat(document.getElementById('budgetLimitInput').value);
        const selectedScope = document.getElementById('budgetForUser')?.value || getCurrentUserId();
        if (!cat || isNaN(limit) || limit <= 0) { showToast('Enter valid limit', 'exclamation-triangle'); return; }
        // Initialize budgets structure if needed
        if (!state.budgets) state.budgets = {};
        if (!state.budgets[selectedScope]) state.budgets[selectedScope] = {};
        state.budgets[selectedScope][cat] = limit;
        saveState();
        document.getElementById('budgetLimitInput').value = '';
        document.getElementById('budgetCatSelect').value = '';
        refreshSettings();
        // Show contextual toast
        let scopeLabel = 'budget';
        if (selectedScope === '__shared__') scopeLabel = 'shared groceries budget';
        else if (selectedScope.startsWith('__house_')) scopeLabel = 'house rent budget';
        else scopeLabel = 'budget for ' + getUserDisplayName(selectedScope);
        showToast('Set ' + scopeLabel + ': ' + cat, 'bullseye');
    });
    document.getElementById('budgetSettingsList')?.addEventListener('click', function(e) {
        const btn = e.target.closest('.remove-budget-btn');
        if (btn) {
            const scope = btn.dataset.scope || btn.dataset.user || getCurrentUserId();
            const cat = btn.dataset.cat;
            if (state.budgets?.[scope]) {
                delete state.budgets[scope][cat];
                if (Object.keys(state.budgets[scope]).length === 0) {
                    delete state.budgets[scope];
                }
            }
            saveState();
            refreshSettings();
            showToast('Budget removed.', 'trash-alt');
        }
    });
    // Refresh budget list when scope selector changes
    document.getElementById('budgetForUser')?.addEventListener('change', function() {
        refreshBudgetSettingsList();
    });

    // Houses
    document.getElementById('addHouseBtn')?.addEventListener('click', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        
        // Check if we're editing an existing house
        const editingId = this.dataset.editingHouseId;
        if (editingId) {
            if (typeof updateHouse === 'function') updateHouse(editingId);
            return;
        }
        
        // Collect linked users from checkboxes
        const linkedUsers = [];
        document.querySelectorAll('.house-linked-user-cb:checked').forEach(cb => {
            linkedUsers.push(cb.value);
        });
        
        const h = {
            id: 'h' + Date.now(),
            houseNo: document.getElementById('newHouseNo').value.trim(),
            address: document.getElementById('newHouseAddress').value.trim(),
            tenant: document.getElementById('newHouseTenant').value.trim(),
            owner: document.getElementById('newHouseOwner').value.trim(),
            rent: parseFloat(document.getElementById('newHouseRent').value) || 0,
            waterBill: parseFloat(document.getElementById('newHouseWater')?.value) || 0,
            motorBill: parseFloat(document.getElementById('newHouseMotor')?.value) || 0,
            electricRate: parseFloat(document.getElementById('newHouseElecRate')?.value) || 0,
            linkedUsers: linkedUsers,
        };
        if (!h.houseNo || !h.tenant) { showToast('Fill House No. and Tenant', 'exclamation-triangle'); return; }
        state.houses.push(h);
        saveState();
        ['newHouseNo', 'newHouseAddress', 'newHouseTenant', 'newHouseOwner', 'newHouseRent', 'newHouseWater', 'newHouseMotor', 'newHouseElecRate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.querySelectorAll('.house-linked-user-cb').forEach(cb => cb.checked = false);
        refreshSettings();
        refreshAll();
        showToast('House added!', 'home');
    });
    document.getElementById('settingsHouseList')?.addEventListener('click', function(e) {
        // Edit house
        const editBtn = e.target.closest('.edit-house-btn');
        if (editBtn) {
            if (state.userRole !== 'admin') return;
            const houseId = editBtn.dataset.id;
            editHouseUI(houseId);
            return;
        }
        // Remove house
        const btn = e.target.closest('.remove-house-btn');
        if (state.userRole !== 'admin') return;
        if (btn) {
            state.houses = state.houses.filter(h => h.id !== btn.dataset.id);
            saveState();
            refreshSettings();
            refreshAll();
            showToast('House removed.', 'trash-alt');
        }
    });

    // Data Management - available to all authenticated users
    document.getElementById('exportDataBtn')?.addEventListener('click', function() {
        if (!state.currentUser) return showToast('Sign in to export data', 'exclamation-triangle');
        const blob = new Blob([JSON.stringify({
            transactions: getVisibleTransactions(),
            houses: state.houses,
            categories: state.categories,
            budgets: state.budgets,
            currency: state.currency,
            recurringTemplates: state.recurringTemplates,
        }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'home_finlytics_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported!', 'download');
    });
    document.getElementById('exportCSVBtn')?.addEventListener('click', function() {
        if (!state.currentUser) return showToast('Sign in to export data', 'exclamation-triangle');
        const headers = ['Date', 'Type', 'Category', 'Subcategory', 'Amount', 'Currency', 'Payer', 'Payment Method', 'Notes', 'House ID'];
        const rows = getVisibleTransactions().map(t => [t.date, t.type, t.category, t.subcategory, t.amount, state.currency, t.payer || '', t.paymentMethod || '', (t.notes || '').replace(/,/g, ';'), t.houseId || '' ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'home_finlytics_transactions.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported!', 'file-csv');
    });
    document.getElementById('importDataBtn')?.addEventListener('click', function() {
        if (!state.currentUser) return showToast('Sign in to import data', 'exclamation-triangle');
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', function() {
        if (!state.currentUser) return showToast('Sign in to import data', 'exclamation-triangle');
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.transactions) state.transactions = data.transactions;
                if (data.houses) state.houses = data.houses;
                if (data.categories) state.categories = data.categories;
                if (data.budgets) state.budgets = data.budgets;
                if (data.currency) state.currency = data.currency;
                if (data.recurringTemplates) state.recurringTemplates = data.recurringTemplates;
                saveState();
                refreshAll();
                showToast('Data imported successfully!', 'upload');
            } catch (err) {
                showToast('Invalid file format', 'exclamation-triangle');
            }
        };
        reader.readAsText(file);
    });
    document.getElementById('importCSVBtn')?.addEventListener('click', function() {
        if (!state.currentUser) return showToast('Sign in to import data', 'exclamation-triangle');
        document.getElementById('importCSVInput').click();
    });
    document.getElementById('importCSVInput')?.addEventListener('change', function() {
        if (!state.currentUser) return showToast('Sign in to import data', 'exclamation-triangle');
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(l => l.trim() !== '');
                if (lines.length <= 1) return showToast('CSV is empty or invalid', 'exclamation-triangle');
                
                const newTxs = [];
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',');
                    if (cols.length < 5) continue;
                    
                    newTxs.push({
                        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        date: cols[0],
                        type: cols[1],
                        category: cols[2],
                        subcategory: cols[3],
                        amount: parseFloat(cols[4]),
                        payer: cols[6] || '',
                        paymentMethod: cols[7] || '',
                        notes: cols[8] ? cols[8].replace(/;/g, ',') : '',
                        houseId: cols[9] || '',
                        createdAt: new Date().toISOString()
                    });
                }
                if (newTxs.length > 0) {
                    state.transactions = [...newTxs, ...state.transactions];
                    state.transactions.sort((a, b) => b.date.localeCompare(a.date));
                    saveState();
                    refreshAll();
                    showToast(`${newTxs.length} transactions imported from CSV!`, 'upload');
                }
            } catch (err) {
                showToast('Failed to parse CSV', 'exclamation-triangle');
            }
        };
        reader.readAsText(file);
    });
    document.getElementById('clearAllDataBtn')?.addEventListener('click', function() {
        if (!state.currentUser) return showToast('Sign in to manage data', 'exclamation-triangle');
        showConfirm('Clear All Data',
            'This will delete ALL transactions and reset settings. This cannot be undone.', 'exclamation-triangle', () => {
                resetState();
                saveState();
                refreshAll();
                navigateTo('screenDashboard');
                showToast('All data cleared.', 'trash-alt');
        }, 'DELETE');
    });

    // App Lock (Biometrics + PIN)
    document.getElementById('appLockToggleWrap')?.addEventListener('click', async () => {
        if (state.appLock?.enabled) {
            state.appLock = { enabled: false, credentialId: null, pinHash: null };
            saveState();
            refreshSettings();
            showToast('App Lock disabled.', 'unlock');
        } else {
            // Try biometrics if available, but still enable app lock even without it
            if (window.PublicKeyCredential) {
                try {
                    const challenge = new Uint8Array(32);
                    crypto.getRandomValues(challenge);
                    const userId = new Uint8Array(16);
                    crypto.getRandomValues(userId);

                    const pubKey = {
                        challenge,
                        rp: { name: "Home Finlytics" },
                        user: { id: userId, name: "User", displayName: "User" },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        timeout: 60000,
                        attestation: "none"
                    };
                    const cred = await navigator.credentials.create({ publicKey: pubKey });
                    state.appLock = { enabled: true, credentialId: btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId))), pinHash: state.appLock?.pinHash || null };
                    saveState();
                    refreshSettings();
                    showToast('App Lock enabled with biometrics!', 'lock');
                    return;
                } catch (err) {
                    // Biometrics setup failed — fall through to enable with PIN only
                    console.warn('Biometrics setup failed:', err);
                }
            }
            // Enable with PIN only (no biometrics available/failed)
            state.appLock = { enabled: true, credentialId: null, pinHash: state.appLock?.pinHash || null };
            saveState();
            refreshSettings();
            if (state.appLock?.pinHash) {
                showToast('App Lock enabled with PIN!', 'lock');
            } else {
                showToast('App Lock enabled. Set a PIN below.', 'lock');
            }
        }
    });
    document.getElementById('appLockToggleWrap')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { 
            e.preventDefault(); 
            document.getElementById('appLockToggleWrap').click(); 
        }
    });
    
    // PIN Setup
    document.getElementById('pinSetupSaveBtn')?.addEventListener('click', () => {
        const pin = document.getElementById('pinSetupInput')?.value || '';
        const status = document.getElementById('pinSetupStatus');
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            if (status) status.textContent = 'Please enter exactly 4 digits.';
            return;
        }
        if (!state.appLock) state.appLock = { enabled: false, credentialId: null, pinHash: null };
        state.appLock.pinHash = simpleHash(pin);
        state.appLock.enabled = true;
        // Store linked account info for PIN login
        if (state.currentUser) {
            state.appLock.linkedEmail = state.currentUser.email || '';
            state.appLock.linkedDisplayName = state.currentUser.name || '';
        }
        saveState();
        refreshSettings();
        if (status) status.textContent = '✅ PIN set successfully! You can now login with this PIN.';
        document.getElementById('pinSetupInput').value = '';
        showToast('PIN set! You can now login with PIN.', 'check-circle');
    });
    
    document.getElementById('pinSetupClearBtn')?.addEventListener('click', () => {
        if (state.appLock) {
            state.appLock.pinHash = null;
            // If no biometrics either, disable app lock
            if (!state.appLock.credentialId) {
                state.appLock.enabled = false;
            }
            saveState();
            refreshSettings();
            document.getElementById('pinSetupInput').value = '';
            document.getElementById('pinSetupStatus').textContent = 'PIN removed.';
            showToast('PIN cleared.', 'trash-alt');
        }
    });

    // App Installation
    document.getElementById('installAppBtn')?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                if (typeof showToast === 'function') showToast('App installed successfully!', 'check-circle');
            }
            deferredPrompt = null;
            const installCard = document.getElementById('installAppCard');
            if (installCard) installCard.style.display = 'none';
        } else {
            // Show instructions based on platform
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const isAndroid = /Android/.test(navigator.userAgent);
            if (isIOS) {
                showToast('Tap Safari Share icon ⎙ → Add to Home Screen', 'share-square');
            } else if (isAndroid) {
                showToast('Tap Chrome menu ⋮ → Add to Home Screen', 'mobile-alt');
            } else {
                showToast('Use browser menu → Add to Home Screen', 'mobile-alt');
            }
        }
    });

    // Clear App Cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        showConfirm('Clear Cache', 'This will wipe the stored app files and reload. You must have an internet connection to download the latest updates. Continue?', 'broom', async () => {
            try {
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                }
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (let r of regs) await r.unregister();
                }
                if (typeof showToast === 'function') showToast('Cache cleared! Reloading...', 'check-circle');
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('Failed to clear cache.', 'times-circle');
            }
        });
    });

    // Force Refresh from Cloud — pulls latest data from Firebase without clearing cache
    document.getElementById('forceRefreshCloudBtn')?.addEventListener('click', async () => {
        if (!navigator.onLine) {
            if (typeof showToast === 'function') showToast('You are currently offline.', 'wifi');
            return;
        }
        if (!state.currentUser) {
            if (typeof window.showLoginUI === 'function') window.showLoginUI();
            return;
        }
        const btn = document.getElementById('forceRefreshCloudBtn');
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing from Cloud...';
        }
        
        try {
            // Use direct get() calls — works reliably on mobile (no listener dependency)
            if (typeof window.forcePullFromCloud === 'function') {
                const cloudData = await window.forcePullFromCloud();
                if (cloudData) {
                    // Directly apply cloud data — bypass echo prevention entirely
                    window.onFirebaseDataReceived(cloudData);
                    if (typeof showToast === 'function') showToast('Cloud data loaded!', 'check-circle');
                } else {
                    if (typeof showToast === 'function') showToast('No cloud data found.', 'exclamation-triangle');
                }
            } else {
                // Fallback: re-attach listeners (old method)
                window._forceCloudPull = true;
                if (typeof window.detachFirebaseListeners === 'function') window.detachFirebaseListeners();
                if (window._firebasePendingWriteIds) window._firebasePendingWriteIds.clear();
                window._lastWrittenSettings = null;
                if (typeof window.listenToFirebaseState === 'function') {
                    window.listenToFirebaseState(window.onFirebaseDataReceived, state.userRole);
                }
                if (typeof showToast === 'function') showToast('Pulling latest data from cloud...', 'cloud-download-alt');
            }
        } catch (e) {
            console.error('Force refresh error:', e);
            if (typeof showToast === 'function') showToast('Refresh failed: ' + (e.message || 'Unknown error'), 'times-circle');
        }
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    });
}

function bindAnalyticsEvents() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.period-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
            refreshAnalytics();
        });
    });

    // Export Analytics as PDF (triggers browser print with analytics-only styles)
    document.getElementById('exportAnalyticsPDFBtn')?.addEventListener('click', () => {
        document.body.classList.add('printing-analytics');
        setTimeout(() => {
            window.print();
        }, 300);
    });
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('printing-analytics');
    });

    document.getElementById('analyticsSplitBalances')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.share-balance-btn');
        if (btn) {
            e.stopPropagation();
            const debtor = btn.dataset.debtor;
            const creditor = btn.dataset.creditor;
            const amt = btn.dataset.amount;
            const text = `${debtor} owes ${creditor} ${typeof formatCurrency === 'function' ? formatCurrency(amt) : amt}. Please settle this balance.`;
            
            if (navigator.share) {
                try {
                    await navigator.share({ title: 'Split Balance', text });
                } catch (err) {
                    // Fallback to clipboard if sharing is aborted or unsupported
                    navigator.clipboard.writeText(text).then(() => { if (typeof showToast === 'function') showToast('Copied to clipboard!', 'copy'); });
                }
            } else {
                navigator.clipboard.writeText(text).then(() => { if (typeof showToast === 'function') showToast('Copied to clipboard!', 'copy'); });
            }
        }
    });
}

// Extracted global receipt total function
function updateReceiptTotal() {
    // Delegate to new live preview function (bill toggle cards)
    if (typeof updateLiveReceiptPreview === 'function') updateLiveReceiptPreview();
}
window.updateReceiptTotal = updateReceiptTotal;

function bindReceiptEvents() {
    // House change → auto-fill rent, water, motor, and previous electric units
    document.getElementById('receiptHouse')?.addEventListener('change', function() {
        const house = (state.houses || []).find(h => h.id === this.value);
        if (house) {
            document.getElementById('receiptRent').value = house.rent || '';
            // Auto-fill water/motor from house defaults
            if (house.waterBill) {
                document.getElementById('billCardWater')?.classList.add('active');
                document.getElementById('waterBillAmount').value = house.waterBill;
            }
            if (house.motorBill) {
                document.getElementById('billCardMotor')?.classList.add('active');
                document.getElementById('motorBillAmount').value = house.motorBill;
            }
            // Auto-fetch previous electric units
            if (typeof autoFetchPreviousElectricUnits === 'function') {
                autoFetchPreviousElectricUnits(house.id);
            }
            // Update electric rate label to reflect house-specific rate
            const rateLabel = document.getElementById('electricRateLabel');
            if (rateLabel) {
                const houseRate = house.electricRate || 8;
                rateLabel.textContent = (state.currency || '₹') + houseRate;
            }
        }
        updateLiveReceiptPreview();
    });
    
    // Rent, period, date changes → update live preview
    ['receiptRent', 'receiptMonth', 'receiptIssueDate'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateLiveReceiptPreview);
        document.getElementById(id)?.addEventListener('change', updateLiveReceiptPreview);
    });

    // Adjustment +/- toggle buttons (event delegation)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.adj-toggle-btn');
        if (!btn) return;
        const toggle = btn.closest('.adj-toggle');
        if (!toggle) return;
        const hiddenId = toggle.dataset.hidden;
        if (!hiddenId) return;
        e.preventDefault();
        // Update active state
        toggle.querySelectorAll('.adj-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update hidden input
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = btn.dataset.val;
        // Update live preview
        if (typeof updateLiveReceiptPreview === 'function') updateLiveReceiptPreview();
    });

    // This is the single receipt form submit – generateReceipt() lives in receiptGenerator.js
    document.getElementById('receiptForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        generateReceipt();
    });
}

function bindEvents() {
    bindNavigationEvents();
    bindDashboardEvents();
    bindTransactionEvents();
    bindSettingsEvents();
    bindAnalyticsEvents();
    bindReceiptEvents();
    bindProfileEvents();
    bindPinLoginEvents();
    bindLockScreenEvents();
}

// ==================== PROFILE EVENT BINDING ====================
function bindProfileEvents() {
    document.getElementById('profileSave')?.addEventListener('click', saveProfile);
    document.getElementById('profileCancel')?.addEventListener('click', closeProfileModal);
    // Close on backdrop click
    document.getElementById('profileModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeProfileModal();
    });
    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.getElementById('profileModal')?.style.display === 'flex') {
            closeProfileModal();
        }
    });
    
    // Google Link/Unlink
    document.getElementById('profileLinkGoogleBtn')?.addEventListener('click', async function() {
        if (typeof window.linkGoogleAccount !== 'function') {
            if (typeof showToast === 'function') showToast('Google linking not available', 'times-circle');
            return;
        }
        try {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';
            await window.linkGoogleAccount();
            if (typeof showToast === 'function') showToast('Google account linked!', 'check-circle');
            updateGoogleLinkUI();
        } catch (e) {
            if (e.code === 'auth/credential-already-in-use') {
                if (typeof showToast === 'function') showToast('That Google account is already linked to another user. Delete the duplicate account from Firebase Console first.', 'exclamation-triangle');
            } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
                if (typeof showToast === 'function') showToast(e.message, 'times-circle');
            }
        } finally {
            this.disabled = false;
            this.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Link Google Account';
        }
    });
    
    document.getElementById('profileUnlinkGoogleBtn')?.addEventListener('click', async function() {
        if (typeof window.unlinkGoogleAccount !== 'function') return;
        if (!confirm('Unlink your Google account? You will need to use email/password to log in.')) return;
        try {
            await window.unlinkGoogleAccount();
            if (typeof showToast === 'function') showToast('Google account unlinked.', 'check-circle');
            updateGoogleLinkUI();
        } catch (e) {
            if (typeof showToast === 'function') showToast(e.message, 'times-circle');
        }
    });
}

// Update Google link UI based on current link status
function updateGoogleLinkUI() {
    const linked = typeof window.hasGoogleLinked === 'function' ? window.hasGoogleLinked() : false;
    const linkBtn = document.getElementById('profileLinkGoogleBtn');
    const unlinkBtn = document.getElementById('profileUnlinkGoogleBtn');
    const status = document.getElementById('profileGoogleStatus');
    
    if (linkBtn) linkBtn.style.display = linked ? 'none' : 'flex';
    if (unlinkBtn) unlinkBtn.style.display = linked ? 'block' : 'none';
    if (status) {
        status.textContent = linked 
            ? '✅ Google account is linked — you can sign in with either method.'
            : 'Link your Google account to sign in with Google on any device.';
    }
}

// ==================== PULL TO REFRESH ====================
function setupPullToRefresh() {
    const content = document.getElementById('appContent');
    const indicator = document.getElementById('ptrIndicator');
    const icon = indicator?.querySelector('i');
    if (!content || !indicator) return;

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isRefreshing = false;
    let activeScreen = null;

    content.addEventListener('touchstart', (e) => {
        activeScreen = document.querySelector('.screen.active');
        // Only allow pull if the user is perfectly at the top of the screen
        if (activeScreen && activeScreen.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
            indicator.style.transition = 'none';
        }
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing || !activeScreen) return;
        currentY = e.touches[0].clientY;
        const pullDistance = currentY - startY;

        if (pullDistance > 0 && activeScreen.scrollTop <= 0) {
            const translate = Math.min(pullDistance * 0.4, 60); // Resistance factor
            indicator.style.transform = `translateY(${translate}px)`;
            if (icon) icon.style.transform = `rotate(${translate * 3}deg)`;
        }
    }, { passive: true });

    content.addEventListener('touchend', () => {
        if (!isPulling || isRefreshing) return;
        isPulling = false;
        indicator.style.transition = 'transform 0.3s ease';
        const pullDistance = currentY - startY;

        if (pullDistance > 100 && activeScreen && activeScreen.scrollTop <= 0) {
            isRefreshing = true;
            indicator.classList.add('refreshing');
            indicator.style.transform = `translateY(55px)`;
            if (icon) icon.style.transform = `rotate(0deg)`; // Reset for spin animation
            
            if (typeof pulseSyncDot === 'function') pulseSyncDot();
            refreshAll();
            
            setTimeout(() => {
                indicator.classList.remove('refreshing');
                indicator.style.transform = `translateY(0)`;
                isRefreshing = false;
            }, 1000);
        } else {
            indicator.style.transform = `translateY(0)`;
        }
    });
}

// ==================== PIN LOGIN (Alternative to Google) ====================
function showPinLogin() {
    const screen = document.getElementById('pinLoginScreen');
    if (!screen) return;
    
    // Show the user's name if we have it
    const userNameLabel = document.getElementById('pinLoginUser');
    const cachedName = state.appLock?.linkedDisplayName || 'User';
    if (userNameLabel) userNameLabel.textContent = `Welcome back, ${cachedName}`;
    
    const pinInput = document.getElementById('pinLoginInput');
    const pinError = document.getElementById('pinLoginError');
    if (pinInput) pinInput.value = '';
    if (pinError) pinError.textContent = '';
    
    // Hide splash and show PIN login
    document.getElementById('splashScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'none';
    screen.style.display = 'flex';
    window._appInitialized = true;
    
    setTimeout(() => pinInput?.focus(), 400);
}

function bindPinLoginEvents() {
    const pinInput = document.getElementById('pinLoginInput');
    const pinBtn = document.getElementById('pinLoginBtn');
    const pinError = document.getElementById('pinLoginError');
    const googleBtn = document.getElementById('pinLoginGoogleBtn');
    
    const doPinLogin = () => {
        const val = pinInput?.value || '';
        if (val.length !== 4 || !/^\d{4}$/.test(val)) {
            if (pinError) pinError.textContent = 'Please enter your 4-digit PIN.';
            return;
        }
        if (verifyPin(val)) {
            // Restore user identity from cached data
            const email = state.linkedUserEmail || state.appLock?.linkedEmail || '';
            const displayName = state.linkedUserDisplayName || state.appLock?.linkedDisplayName || email.split('@')[0];
            state.currentUser = {
                uid: email || 'pin-user',
                name: displayName,
                email: email || ''
            };
            state.userProfile = { displayName, email };
            state.userRole = 'user'; // Will be updated when Firebase connects
            
            document.getElementById('pinLoginScreen').style.display = 'none';
            window._appInitialized = false;
            saveState();
            continueInit();
        } else {
            if (pinError) pinError.textContent = 'Incorrect PIN. Try again.';
            if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        }
    };
    
    if (pinBtn) pinBtn.addEventListener('click', doPinLogin);
    
    if (pinInput) {
        pinInput.addEventListener('input', () => {
            if (pinError) pinError.textContent = '';
            if (pinInput.value.length >= 4) doPinLogin();
        });
        
        pinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); doPinLogin(); }
        });
    }
    
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            document.getElementById('pinLoginScreen').style.display = 'none';
            document.getElementById('appShell').style.display = 'flex';
            window._appInitialized = false;
            if (typeof window.showLoginUI === 'function') {
                window.showLoginUI(true);
            }
        });
    }
}

// ==================== APP LOCK (Privacy lock - optional) ====================
function showLockScreen() {
    const lockScreen = document.getElementById('lockScreen');
    if (!lockScreen) return;
    
    const bioBtn = document.getElementById('unlockWithBioBtn');
    const pinBtn = document.getElementById('unlockWithPinBtn');
    const signOutBtn = document.getElementById('lockSignOutBtn');
    const pinInput = document.getElementById('lockPinInput');
    const pinWrap = document.getElementById('lockPinWrap');
    const pinError = document.getElementById('lockPinError');
    
    if (pinError) pinError.textContent = '';
    if (pinInput) pinInput.value = '';
    
    const hasBio = !!(window.PublicKeyCredential && state.appLock?.credentialId);
    const hasPin = !!(state.appLock?.pinHash);
    
    if (bioBtn) bioBtn.style.display = hasBio ? 'flex' : 'none';
    if (pinBtn) pinBtn.style.display = hasPin ? 'flex' : 'none';
    if (pinWrap) pinWrap.style.display = hasPin ? 'block' : 'block';
    if (signOutBtn) signOutBtn.style.display = 'flex';
    const divider = document.getElementById('lockSignOutDivider');
    if (divider) divider.style.display = 'flex';
    
    if (hasBio) {
        setTimeout(() => bioBtn?.click(), 300);
    } else if (hasPin) {
        setTimeout(() => pinInput?.focus(), 300);
    }
    
    lockScreen.style.display = 'flex';
}

async function triggerUnlock() {
    const hasBio = !!(window.PublicKeyCredential && state.appLock?.credentialId);
    const hasPin = !!(state.appLock?.pinHash);
    
    if (!hasBio && !hasPin) {
        return;
    }
    
    showLockScreen();
}

// PIN unlock (reuses verifyPin from above)

// PIN unlock
function verifyPin(enteredPin) {
    if (!state.appLock?.pinHash) return false;
    const hash = simpleHash(enteredPin);
    return hash === state.appLock.pinHash;
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'h' + Math.abs(hash).toString(36);
}

// Set up lock screen event listeners
function bindLockScreenEvents() {
    const bioBtn = document.getElementById('unlockWithBioBtn');
    const pinBtn = document.getElementById('unlockWithPinBtn');
    const pinInput = document.getElementById('lockPinInput');
    const pinError = document.getElementById('lockPinError');
    const signOutBtn = document.getElementById('lockSignOutBtn');
    
    if (bioBtn) {
        bioBtn.addEventListener('click', async () => {
            try {
                const challenge = new Uint8Array(32);
                crypto.getRandomValues(challenge);
                
                const binaryString = window.atob(state.appLock.credentialId);
                const credIdBytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    credIdBytes[i] = binaryString.charCodeAt(i);
                }
                
                const pubKey = {
                    challenge,
                    allowCredentials: [{ type: "public-key", id: credIdBytes }],
                    userVerification: "required",
                    timeout: 60000
                };
                
                await navigator.credentials.get({ publicKey: pubKey });
                
                document.getElementById('lockScreen').style.display = 'none';
                window._appInitialized = false;
                continueInit();
            } catch (err) {
                console.error(err);
                if (pinError) pinError.textContent = 'Biometric failed. Try PIN or retry.';
            }
        });
    }
    
    if (pinBtn) {
        pinBtn.addEventListener('click', () => {
            const val = pinInput?.value || '';
            if (val.length < 4) {
                if (pinError) pinError.textContent = 'Please enter your 4-digit PIN.';
                return;
            }
            if (verifyPin(val)) {
                document.getElementById('lockScreen').style.display = 'none';
                window._appInitialized = false;
                continueInit();
            } else {
                if (pinError) pinError.textContent = 'Incorrect PIN. Try again.';
                if (pinInput) { pinInput.value = ''; pinInput.focus(); }
            }
        });
    }
    
    if (pinInput) {
        pinInput.addEventListener('input', () => {
            if (pinError) pinError.textContent = '';
            if (pinInput.value.length >= 4) {
                // Auto-verify on 4 digits
                if (verifyPin(pinInput.value)) {
                    document.getElementById('lockScreen').style.display = 'none';
                    window._appInitialized = false;
                    continueInit();
                } else {
                    if (pinError) pinError.textContent = 'Incorrect PIN.';
                    pinInput.value = '';
                }
            }
        });
        
        pinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                pinBtn?.click();
            }
        });
    }
    
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            // Preserve PIN auth data so user can log back in without Google
            const authData = {
                enabled: !!(state.appLock?.pinHash || state.appLock?.credentialId),
                pinHash: state.appLock?.pinHash || null,
                credentialId: state.appLock?.credentialId || null,
                linkedEmail: state.appLock?.linkedEmail || '',
                linkedDisplayName: state.appLock?.linkedDisplayName || ''
            };
            if (authData.pinHash || authData.credentialId) {
                localStorage.setItem('home_finlytics_auth', JSON.stringify(authData));
            }
            
            try { 
                const fbAuth = window._firebaseAuth;
                if (fbAuth) await fbAuth.signOut();
            } catch(e) { /* ignore */ }
            
            localStorage.removeItem('home_finlytics_state');
            window.location.reload();
        });
    }
}

// ==================== INIT ====================
window.handleAuthStateChanged = async (user) => {
    const wasUser = !!state.currentUser;
    const previousUid = state.currentUser?.uid;
    const previousRole = state.userRole;
    
    if (user) {
        // Determine display name: profile > auth displayName > email prefix
        let displayName = user.displayName || user.email.split('@')[0];
        
        // Load profile from Firebase
        if (typeof window.loadUserProfile === 'function') {
            const profile = await window.loadUserProfile(user);
            if (profile && profile.displayName) {
                displayName = profile.displayName;
                state.userProfile = profile;
            } else {
                state.userProfile = { displayName: displayName, email: user.email };
            }
        } else {
            state.userProfile = { displayName: displayName, email: user.email };
        }
        
        const name = displayName;
        const isNewUser = previousUid !== user.uid;
        state.currentUser = { uid: user.uid, name: name, email: user.email };
        
        // Update PIN-linked account info so PIN login works for this user
        if (state.appLock?.pinHash) {
            state.appLock.linkedEmail = user.email;
            state.appLock.linkedDisplayName = name;
            // Clear the separate auth storage since main state now has it
            localStorage.removeItem('home_finlytics_auth');
        }
        
        // Auto-add user's display name to payer list so it appears in manage payers
        if (!state.payers) state.payers = [];
        const payersArr = Array.isArray(state.payers) ? state.payers : Object.values(state.payers);
        if (name && !payersArr.some(p => p.toLowerCase() === name.toLowerCase())) {
            state.payers.push(name);
            // Sync to Firebase if admin and name is new
            if (typeof saveState === 'function') saveState();
        }
        
        // Fetch role from Firebase dynamically
        if (typeof window.checkUserRole === 'function') {
            state.userRole = await window.checkUserRole(user);
        } else {
            state.userRole = 'user';
        }
        const roleChanged = (previousRole !== state.userRole);
        
        // CRITICAL FIX: Always attach Firebase listeners on every auth resolution.
        // Previously only attached on isNewUser || roleChanged, which meant on page
        // reload the app would run from stale localStorage and overwrite Firebase data!
        if (typeof window.listenToFirebaseState === 'function') {
            window.listenToFirebaseState(window.onFirebaseDataReceived, state.userRole);
        }
        
        const headerUserName = document.getElementById('headerUserName');
        if (headerUserName) {
            headerUserName.textContent = name;
            headerUserName.style.display = 'inline';
            headerUserName.style.cursor = 'pointer';
            headerUserName.title = 'Click to edit profile';
            headerUserName.onclick = function() { if (typeof openProfileModal === 'function') openProfileModal(); };
        }
        
        const signOutWrap = document.getElementById('settingsSignOutWrap');
        if (signOutWrap) signOutWrap.style.display = 'block';
        const settingsUserEmail = document.getElementById('settingsUserEmail');
        if (settingsUserEmail) settingsUserEmail.textContent = user.email;
        
        const signInWrap = document.getElementById('settingsSignInWrap');
        if (signInWrap) signInWrap.style.display = 'none';

        // Apply role-based visibility
        applyRoleRestrictions();
        // Refresh settings to show admin-only sections if role is admin
        if (roleChanged && typeof refreshSettings === 'function') {
            refreshSettings();
        }

        const loginModal = document.getElementById('firebaseLoginModal');
        if (loginModal) loginModal.remove();
        // Also hide any PIN login screen that might be showing
        const pinLogin = document.getElementById('pinLoginScreen');
        if (pinLogin) pinLogin.style.display = 'none';

        if (!window._appInitialized) {
            // Normal path: continueInit() will set _appInitialized
            continueInit();
        } else if (!wasUser || roleChanged) {
            refreshAll();
        }
    } else {
        state.currentUser = null;
        state.userRole = 'user';
        
        const headerUserName = document.getElementById('headerUserName');
        if (headerUserName) {
            headerUserName.textContent = '';
            headerUserName.style.display = 'none';
        }

        const signOutWrap = document.getElementById('settingsSignOutWrap');
        if (signOutWrap) signOutWrap.style.display = 'none';

        const signInWrap = document.getElementById('settingsSignInWrap');
        if (signInWrap) signInWrap.style.display = 'block';

        if (wasUser) {
            if (typeof window.detachFirebaseListeners === 'function') window.detachFirebaseListeners();
            window._cloudSyncDone = false;
            window._cloudSyncRetries = 0;
            resetState();
            refreshAll();
            navigateTo('screenDashboard');
        }
        applyRoleRestrictions();
        
        if (!window._appInitialized) {
            // Check if user has PIN set and has previously been authenticated
            const hasPin = !!(state.appLock?.pinHash);
            const hasPrevUser = !!(state.appLock?.linkedEmail);
            if (hasPin && hasPrevUser) {
                showPinLogin();
            } else {
                continueInit();
                if (typeof window.showLoginUI === 'function') {
                    window.showLoginUI(true);
                }
            }
        }
    }
};

function init() {
    loadState();
    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();

    if (typeof window.listenToConnectionStatus === 'function') {
        window.listenToConnectionStatus((isConnected) => {
            const dot = document.getElementById('syncStatusDot');
            if (dot) {
                if (isConnected) {
                    // Online and syncing
                    dot.style.backgroundColor = '#34c759'; // Green
                    dot.title = 'Online - Synced with Firebase';
                } else {
                    // Offline
                    dot.style.backgroundColor = '#ff3b30'; // Red
                    dot.title = 'Offline';
                }
                dot.style.transition = 'background-color 0.3s ease';
            }
        });
    }

    if (!state.payers) state.payers = [];
    applyTheme();
    bindEvents();
    setupPullToRefresh();

    // FIX: Prevent duplicate continueInit() calls from timeout + auth callback race
    window._initFallbackTimer = setTimeout(() => {
        if (!window._appInitialized) {
            console.warn("Firebase Auth timeout, proceeding offline");
            continueInit();
        }
    }, 4000);
}

function continueInit() {
    // FIX: Guard against multiple calls
    if (window._appInitialized) return;
    window._appInitialized = true;
    
    // Clear the fallback timer if it hasn't fired yet
    if (window._initFallbackTimer) {
        clearTimeout(window._initFallbackTimer);
        window._initFallbackTimer = null;
    }
    
    navigateTo('screenDashboard');
    document.getElementById('splashScreen')?.classList.add('hide');
    document.getElementById('appShell').style.display = 'flex';
    
    // FIX: Use transitionend or a single timeout to fully remove splash
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.display = 'none';
            splash.classList.remove('hide');
        }
    }, 300);

    const addDateEl = document.getElementById('addDate');
    if (addDateEl) addDateEl.value = new Date().toISOString().slice(0,10);
    const receiptMonthEl = document.getElementById('receiptMonth');
    if (receiptMonthEl) receiptMonthEl.value = new Date().toISOString().slice(0,7);
    const receiptIssueDateEl = document.getElementById('receiptIssueDate');
    if (receiptIssueDateEl) receiptIssueDateEl.value = new Date().toISOString().slice(0,10);
    
}
document.addEventListener('DOMContentLoaded', init);

// PWA Install Prompt Listeners
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent the mini-infobar from appearing on mobile
    deferredPrompt = e; // Stash the event so it can be triggered later.
    const installCard = document.getElementById('installAppCard');
    if (installCard) installCard.style.display = 'block'; // Unhide our custom card
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const installCard = document.getElementById('installAppCard');
    if (installCard) installCard.style.display = 'none'; // Hide the card once installed
});

// Proactive check: if the app is already installed (detected via getInstalledRelatedApps),
// hide the install card. This covers edge cases where beforeinstallprompt never fires.
if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(relatedApps => {
        const isInstalled = relatedApps.some(app => app.id === 'home-finline-v2' || app.platform === 'webapp');
        if (isInstalled) {
            deferredPrompt = null;
            const installCard = document.getElementById('installAppCard');
            if (installCard) installCard.style.display = 'none';
        }
    }).catch(() => {});
}

// PWA install prompt detection (works on both iOS and Android)
function checkIOSInstall() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const installCard = document.getElementById('installAppCard');
    const installBtn = document.getElementById('installAppBtn');
    if (!installCard || !installBtn) return;
    
    if (isStandalone) {
        // Already installed — hide the card
        installCard.style.display = 'none';
        return;
    }
    
    if (isIOS) {
        // iOS: show instructional card (beforeinstallprompt not supported on iOS)
        installCard.style.display = 'block';
        installBtn.innerHTML = '<i class="fas fa-share-square"></i> Share → Add to Home Screen';
        installBtn.className = 'btn btn-primary btn-full';
        installBtn.style.cssText = 'border-radius: 20px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,122,255,0.3);';
        const desc = document.getElementById('installAppDesc');
        if (desc) desc.innerHTML = 'Tap the <strong>Share</strong> icon <span style="font-size:1.2rem;">⎙</span> in Safari, then scroll down and tap <strong>"Add to Home Screen"</strong>.';
    } else if (isAndroid) {
        // Android: show the card if deferredPrompt is available, or show manual instructions
        if (deferredPrompt) {
            installCard.style.display = 'block';
            installBtn.innerHTML = '<i class="fas fa-download"></i> Add to Home Screen';
            installBtn.className = 'btn btn-primary btn-full';
            installBtn.style.cssText = 'border-radius: 20px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,122,255,0.3);';
            const desc = document.getElementById('installAppDesc');
            if (desc) desc.innerHTML = 'Get the full app experience. Install Home Finlytics on your home screen for quick access and instant offline use.';
        } else {
            // Show manual instructions for Android if beforeinstallprompt didn't fire
            installCard.style.display = 'block';
            installBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> Tap for Instructions';
            installBtn.className = 'btn btn-primary btn-full';
            installBtn.style.cssText = 'border-radius: 20px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,122,255,0.3);';
            const desc = document.getElementById('installAppDesc');
            if (desc) desc.innerHTML = 'Open this page in <strong>Chrome</strong>, tap the <strong>⋮ menu</strong> and select <strong>"Add to Home Screen"</strong> or <strong>"Install app"</strong>.';
        }
    } else {
        // Desktop: show if deferredPrompt available
        installCard.style.display = deferredPrompt ? 'block' : 'none';
        if (deferredPrompt) {
            installBtn.innerHTML = '<i class="fas fa-download"></i> Add to Home Screen';
            installBtn.className = 'btn btn-primary btn-full';
            installBtn.style.cssText = 'border-radius: 20px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,122,255,0.3);';
        }
    }
}

// Run on DOM load and also when settings are refreshed
document.addEventListener('DOMContentLoaded', checkIOSInstall);
// Expose it so refreshSettings can call it
window.checkIOSInstall = checkIOSInstall;

// ==================== NETWORK STATUS NOTIFICATIONS ====================
window.addEventListener('online', () => {
    if (typeof showToast === 'function') showToast('Internet connection restored! Syncing...', 'wifi');
    // CRITICAL: Pull from cloud first, then push local changes.
    // This prevents stale offline data from overwriting cloud data.
    if (state.currentUser && typeof window.forcePullFromCloud === 'function') {
        window.forcePullFromCloud().then(cloudData => {
            if (cloudData) {
                window.onFirebaseDataReceived(cloudData);
            }
            // After pulling, push any pending local changes
            if (state.hasUnsyncedChanges && typeof window.saveStateToFirebase === 'function') {
                window.saveStateToFirebase(state).then(() => {
                    state.hasUnsyncedChanges = false;
                    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                    try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                    if (typeof pulseSyncDot === 'function') pulseSyncDot();
                }).catch(()=>{});
            }
        }).catch(() => {
            // Fallback: just push if pull fails
            if (state.hasUnsyncedChanges && typeof window.saveStateToFirebase === 'function') {
                window.saveStateToFirebase(state).catch(()=>{});
            }
        });
    }
});

window.addEventListener('offline', () => {
    if (typeof showToast === 'function') showToast('Internet connection lost. Working offline.', 'exclamation-triangle');
});