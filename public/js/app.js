// ==================== js/app.js ====================
// Global state, theme application, navigation, event binding, initialization
let state = {
    transactions: [],
    houses: [...DEFAULT_HOUSES],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    payers: [...DEFAULT_PAYERS],
    budgets: {},
    currency: '₹',
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
    appLock: { enabled: false, credentialId: null },
    currentUser: null,
    userRole: 'user', // 'admin' or 'user'
    userProfile: null  // { displayName, email } from Firebase profiles/{uid}
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
    state.budgets = {};
    state.electricRate = 8;
    state.recurringTemplates = [];
    state.selectedTxIds = new Set();
    state.bulkSelectMode = false;
    state.lastUpdated = 0; // Reset to 0 so cloud data always takes precedence
    state.hasUnsyncedChanges = false;
}

// Firebase Sync override (Replacing storage.js local storage logic)
let _saveStateTimer = null;
let _localStorageTimer = null;
function saveState() {
    state.hasUnsyncedChanges = true;
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
        if (!state.houses) state.houses = [];
        if (!state.payers) state.payers = [];
        
        if (!state.budgets) state.budgets = {};
        if (!state.recurringTemplates) state.recurringTemplates = [];
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

    Object.assign(state, firebaseData);
    Object.assign(state, uiOnly);
    
    state.lastUpdated = cloudLastUpdated || Date.now();
    state.hasUnsyncedChanges = false;

    // Ensure core structures exist if Firebase returned null (Firebase removes empty arrays/objects)
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
        badge.style.display = state.hasUnsyncedChanges ? 'flex' : 'none';
    }
};

window.triggerManualSync = function() {
    if (!navigator.onLine) {
        if (typeof showToast === 'function') showToast('You are currently offline.', 'wifi');
        return;
    }
    if (!state.currentUser) {
        if (typeof window.showLoginUI === 'function') window.showLoginUI();
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
    if(screenId==='screenDashboard') refreshDashboard();
    if(screenId==='screenTransactions') refreshTransactionList();
    if(screenId==='screenAnalytics') refreshAnalytics();
    if(screenId==='screenSettings') refreshSettings();
    if(screenId==='screenAdd') refreshAddForm();
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
        else if(scr==='screenTransactions') refreshTransactionList();
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
}

function bindDashboardEvents() {
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
            payer: document.getElementById('addPayerOverride')?.value || (state.currentUser ? state.currentUser.name : 'Unknown'),
            paymentMethod: document.getElementById('addPaymentMethod')?.value || 'cash',
            splitWith: splitWith.length > 0 ? splitWith : null,
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
    ['filterCategory', 'filterSubcategory', 'filterPayer', 'filterDateFrom', 'filterDateTo', 'sortBy'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', refreshTransactionList);
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
        ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterSearch', 'filterDateFrom', 'filterDateTo', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
        });
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
    document.getElementById('settingsElectricRate')?.addEventListener('change', function() {
        state.electricRate = parseFloat(this.value) || 8; saveState(); refreshReceiptForm(); showToast('Electric rate updated', 'bolt');
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
        if (!catName || !subName) return showToast('Select category and enter subcategory name', 'exclamation-triangle');
        
        // Find and update the category in ALL type collections (sync Groceries across expense + groceries)
        let found = false;
        ['expense', 'groceries'].forEach(t => {
            if (!state.categories?.[t]) return;
            const cats = Object.values(state.categories[t]).filter(Boolean);
            const cat = cats.find(c => c.name === catName);
            if (cat) {
                if (!cat.subcategories) cat.subcategories = [];
                if (!cat.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
                    cat.subcategories.push(subName);
                    found = true;
                }
            }
        });
        if (!found) return showToast('Category not found', 'exclamation-triangle');
        
        saveState();
        refreshSubcategoryList(type);
        document.getElementById('newSubcatName').value = '';
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
        iconInput.style.width = '45px';
        iconInput.style.textAlign = 'center';
        iconInput.style.cursor = 'pointer';
        iconInput.readOnly = true;

        const picker = document.createElement('div');
        picker.id = 'emojiPickerModal';
        picker.style.cssText = 'display:none; position:absolute; top:120%; left:0; width:260px; background:var(--bg-glass); backdrop-filter:blur(10px); border:1px solid var(--divider); border-radius:8px; padding:8px; z-index:1000; box-shadow:0 8px 24px rgba(0,0,0,0.2); flex-wrap:wrap; gap:4px; max-height:160px; overflow-y:auto;';
        
        const commonEmojis = ["💰","💸","🍔","🍜","🚌","🚗","🎬","🎮","💡","🏠","🛍️","🏥","💊","📚","💆","💳","📦","🥬","🍎","🐟","💧","🥩","🥛","🍚","🍪","☕","🧂","🧼","🐶","🐱","✈️","📱","💻","🎉","⚽","🎵","👔","🔧","🛠️","🪴"];
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

        iconInput.onclick = () => {
            picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
        };

        document.addEventListener('click', (e) => {
            if (e.target !== iconInput && !picker.contains(e.target)) {
                picker.style.display = 'none';
            }
        });

        iconWrap.appendChild(iconInput);
        iconWrap.appendChild(picker);
        newCatColorInput.parentNode.insertBefore(iconWrap, newCatColorInput);
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

    // Payers
    document.getElementById('addPayerBtn')?.addEventListener('click', () => {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        const name = document.getElementById('newPayerName').value.trim();
        if (!name) return showToast('Enter a name', 'exclamation-triangle');
        if (state.payers.some(p => p.toLowerCase() === name.toLowerCase())) return showToast('Name already exists', 'exclamation-triangle');
        state.payers.push(name);
        saveState();
        renderPayerList();
        document.getElementById('newPayerName').value = '';
        showToast('Payer added!', 'check-circle');
    });
    document.getElementById('payerList')?.addEventListener('click', (e) => {
        if (state.userRole !== 'admin') return;
        const btn = e.target.closest('.remove-payer-btn');
        if (!btn) return;
        const index = parseInt(btn.dataset.index);
        state.payers.splice(index, 1);
        saveState();
        renderPayerList();
        showToast('Payer removed.', 'trash-alt');
    });

    // Budgets
    document.getElementById('addBudgetBtn')?.addEventListener('click', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        const cat = document.getElementById('budgetCatSelect').value;
        const limit = parseFloat(document.getElementById('budgetLimitInput').value);
        if (!cat || isNaN(limit) || limit <= 0) { showToast('Enter valid limit', 'exclamation-triangle'); return; }
        state.budgets[cat] = limit;
        saveState();
        // Reset the input field and refresh the category dropdown
        document.getElementById('budgetLimitInput').value = '';
        document.getElementById('budgetCatSelect').value = '';
        refreshSettings();
        showToast('Budget set for ' + cat, 'bullseye');
    });
    document.getElementById('budgetSettingsList')?.addEventListener('click', function(e) {
        const btn = e.target.closest('.remove-budget-btn');
        if (state.userRole !== 'admin') return;
        if (btn) {
            delete state.budgets[btn.dataset.cat];
            saveState();
            refreshSettings();
            showToast('Budget removed.', 'trash-alt');
        }
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
        
        const h = {
            id: 'h' + Date.now(),
            houseNo: document.getElementById('newHouseNo').value.trim(),
            address: document.getElementById('newHouseAddress').value.trim(),
            tenant: document.getElementById('newHouseTenant').value.trim(),
            owner: document.getElementById('newHouseOwner').value.trim(),
            rent: parseFloat(document.getElementById('newHouseRent').value) || 0,
        };
        if (!h.houseNo || !h.tenant) { showToast('Fill House No. and Tenant', 'exclamation-triangle'); return; }
        state.houses.push(h);
        saveState();
        ['newHouseNo', 'newHouseAddress', 'newHouseTenant', 'newHouseOwner', 'newHouseRent'].forEach(id => document.getElementById(id).value = '');
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

    // Data Management
    document.getElementById('exportDataBtn')?.addEventListener('click', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
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
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
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
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
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
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        document.getElementById('importCSVInput').click();
    });
    document.getElementById('importCSVInput')?.addEventListener('change', function() {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
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
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        showConfirm('Clear All Data',
            'This will delete ALL transactions and reset settings. This cannot be undone.', 'exclamation-triangle', () => {
                resetState();
                saveState();
                refreshAll();
                navigateTo('screenDashboard');
                showToast('All data cleared.', 'trash-alt');
        }, 'DELETE');
    });

    // App Lock (Biometrics)
    document.getElementById('appLockToggleWrap')?.addEventListener('click', async () => {
        if (!window.PublicKeyCredential) {
            showToast('Biometrics not supported on this device/browser.', 'exclamation-triangle');
            return;
        }
        if (state.appLock?.enabled) {
            state.appLock = { enabled: false, credentialId: null };
            saveState();
            refreshSettings();
            showToast('App Lock disabled.', 'unlock');
        } else {
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
                state.appLock = { enabled: true, credentialId: btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId))) };
                saveState();
                refreshSettings();
                showToast('App Lock enabled!', 'lock');
            } catch (err) {
                console.error(err);
                showToast('Failed to setup App Lock.', 'times-circle');
            }
        }
    });
    document.getElementById('appLockToggleWrap')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { 
            e.preventDefault(); 
            document.getElementById('appLockToggleWrap').click(); 
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
    const rent = parseFloat(document.getElementById('receiptRent')?.value) || 0;
    let total = rent;
    if (document.getElementById('includeWaterBill')?.checked) total += parseFloat(document.getElementById('waterBillAmount')?.value) || 0;
    if (document.getElementById('includeMotorBill')?.checked) total += parseFloat(document.getElementById('motorBillAmount')?.value) || 0;
    if (document.getElementById('includeElectricBill')?.checked) {
        const curr = parseFloat(document.getElementById('currentUnit')?.value) || 0;
        const prev = parseFloat(document.getElementById('previousUnit')?.value) || 0;
        const units = Math.max(0, curr - prev);
        const rate = state.electricRate || 8;
        const elecAmt = units * rate;
        const elecDisplay = document.getElementById('electricCalcResult');
        if (elecDisplay) elecDisplay.textContent = `Units: ${units} | ${formatCurrency(elecAmt)}`;
        total += elecAmt;
    }
    const adj1 = parseFloat(document.getElementById('adj1Amount')?.value) || 0;
    const adj2 = parseFloat(document.getElementById('adj2Amount')?.value) || 0;
    total += (document.getElementById('adj1Type')?.value === 'add' ? adj1 : -adj1);
    total += (document.getElementById('adj2Type')?.value === 'add' ? adj2 : -adj2);
    
    // FIX: Update both the in-form and the standalone total preview
    const formattedTotal = formatCurrency(Math.max(0, total));
    const inFormTotal = document.getElementById('receiptTotalPreview');
    if (inFormTotal) inFormTotal.innerHTML = `<strong>Total: ${formattedTotal}</strong>`;
    const standaloneTotal = document.getElementById('receiptTotalPreviewForm');
    if (standaloneTotal) standaloneTotal.innerHTML = `<strong>Total: ${formattedTotal}</strong>`;
}
window.updateReceiptTotal = updateReceiptTotal;

function bindReceiptEvents() {
    document.getElementById('receiptHouse')?.addEventListener('change', function() {
        const house = state.houses.find(h => h.id === this.value);
        if (house) {
            document.getElementById('receiptRent').value = house.rent;
            updateReceiptTotal();
        }
    });

    document.getElementById('includeWaterBill')?.addEventListener('change', function() {
        document.getElementById('waterBillAmount').style.display = this.checked ? 'block' : 'none';
        updateReceiptTotal();
    });
    document.getElementById('includeMotorBill')?.addEventListener('change', function() {
        document.getElementById('motorBillAmount').style.display = this.checked ? 'block' : 'none';
        updateReceiptTotal();
    });
    document.getElementById('includeElectricBill')?.addEventListener('change', function() {
        document.getElementById('electricInputs').style.display = this.checked ? 'block' : 'none';
        updateReceiptTotal();
    });
    ['currentUnit', 'previousUnit', 'waterBillAmount', 'motorBillAmount', 'adj1Amount', 'adj2Amount', 'adj1Type', 'adj2Type'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateReceiptTotal);
        document.getElementById(id)?.addEventListener('change', updateReceiptTotal);
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

    // Manual unlock button trigger
    document.getElementById('unlockBtn')?.addEventListener('click', triggerUnlock);
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

// ==================== BIOMETRIC UNLOCK ====================
async function triggerUnlock() {
    if (!state.appLock?.credentialId) {
        // No lock configured — bypass the guard and init directly
        window._appInitialized = false;
        return continueInit();
    }
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
        
        // Authentication Success — bypass guard since lock path set the flag
        document.getElementById('lockScreen').style.display = 'none';
        window._appInitialized = false;
        continueInit();
    } catch (err) {
        console.error(err);
        showToast('Authentication failed.', 'times-circle');
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
        
        // Fetch role from Firebase dynamically
        if (typeof window.checkUserRole === 'function') {
            state.userRole = await window.checkUserRole(user);
        } else {
            state.userRole = 'user';
        }
        
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

        if (!window._appInitialized) {
            if (state.appLock && state.appLock.enabled) {
                // Lock path: hide splash, show lock screen.
                window._appInitialized = true;
                document.getElementById('splashScreen').style.display = 'none';
                document.getElementById('lockScreen').style.display = 'flex';
                triggerUnlock();
            } else {
                // Normal path: continueInit() will set _appInitialized
                continueInit();
            }
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
            continueInit();
        }

        if (typeof window.showLoginUI === 'function') {
            window.showLoginUI(true);
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
    }, 500);

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

// iOS specific PWA prompt (iOS Safari doesn't support beforeinstallprompt)
document.addEventListener('DOMContentLoaded', () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isIOS && !isStandalone) {
        const installCard = document.getElementById('installAppCard');
        const installBtn = document.getElementById('installAppBtn');
        if (installCard && installBtn) {
            installCard.style.display = 'block';
            installBtn.innerHTML = '<i class="fas fa-share-square"></i> Tap Share, then "Add to Home Screen"';
            installBtn.style.pointerEvents = 'none'; // Instructional only
            installBtn.classList.replace('btn-primary', 'btn-secondary');
        }
    }
});

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