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
    userRole: 'user' // 'admin' or 'user'
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
    state.houses = [...(typeof DEFAULT_HOUSES !== 'undefined' ? DEFAULT_HOUSES : [])];
    state.categories = typeof DEFAULT_CATEGORIES !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)) : { expense: [], groceries: [] };
    state.payers = [...(typeof DEFAULT_PAYERS !== 'undefined' ? DEFAULT_PAYERS : [])];
    state.budgets = {};
    state.electricRate = 8;
    state.recurringTemplates = [];
    state.selectedTxIds = new Set();
    state.bulkSelectMode = false;
    state.lastUpdated = Date.now(); // We use Date.now() here to explicitly sync the wipe action to other devices
    state.hasUnsyncedChanges = false;
}

// Firebase Sync override (Replacing storage.js local storage logic)
function saveState() {
    state.lastUpdated = Date.now();
    state.hasUnsyncedChanges = true;
    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
    
    // Backup to local storage in case Firebase fails or app is offline
    try {
        localStorage.setItem('home_finlytics_state', JSON.stringify(state));
    } catch (e) { console.warn('Local storage disabled'); }

    if (typeof window.saveStateToFirebase === 'function' && navigator.onLine) {
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
}

function loadState() {
    try {
        const saved = localStorage.getItem('home_finlytics_state');
        if (saved) Object.assign(state, JSON.parse(saved));

        // Ensure core structures exist if localStorage returned nulls
        if (!state.transactions) state.transactions = [];
        if (!state.categories) state.categories = { expense: [], groceries: [] };
        if (!state.categories.expense) state.categories.expense = [];
        if (!state.categories.groceries) state.categories.groceries = [];
        if (!state.houses) state.houses = [];
        if (!state.budgets) state.budgets = {};
        if (!state.recurringTemplates) state.recurringTemplates = [];
        if (!state.payers) state.payers = [];
    } catch (e) { console.warn('Local storage disabled'); }
}

function onFirebaseDataReceived(firebaseData) {
    const localUpdated = state.lastUpdated || 0;
    const cloudUpdated = firebaseData.lastUpdated || 0;

    // If local data is newer, it means we made changes offline that will be
    // pushed up shortly by `saveState()`, so we ignore the cloud data.
    if (localUpdated > cloudUpdated) {
        // Ensure our newer local offline data is pushed up to the cloud
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

    // Cloud is newer, overwrite local state.
    Object.assign(state, firebaseData);
    state.lastUpdated = cloudUpdated;
    state.hasUnsyncedChanges = false;

    // Ensure core structures exist if Firebase returned null (Firebase removes empty arrays/objects)
    if (!state.transactions) state.transactions = [];
    if (!state.categories) state.categories = { expense: [], groceries: [] };
    if (!state.categories.expense) state.categories.expense = [];
    if (!state.categories.groceries) state.categories.groceries = [];
    if (!state.houses) state.houses = [];
    if (!state.budgets) state.budgets = {};
    if (!state.recurringTemplates) state.recurringTemplates = [];
    if (!state.payers) state.payers = [];

    if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();

    // Apply structural migrations for Groceries and House Rent
    if (state.categories && state.categories.expense && typeof DEFAULT_CATEGORIES !== 'undefined') {
        let needsSave = false;
        
        // 1. Ensure Groceries exists under Expense
        if (!state.categories.expense.some(c => c.name === 'Groceries')) {
            const defGroc = DEFAULT_CATEGORIES.expense.find(c => c.name === 'Groceries');
            if (defGroc) { state.categories.expense.push(defGroc); needsSave = true; }
        }
        
        // 2. Ensure House Rent is a top level category, and remove it from Utilities
        if (!state.categories.expense.some(c => c.name === 'House Rent')) {
            const defRent = DEFAULT_CATEGORIES.expense.find(c => c.name === 'House Rent');
            if (defRent) { state.categories.expense.push(defRent); needsSave = true; }
            const utilCat = state.categories.expense.find(c => c.name === 'Utilities');
            if (utilCat && utilCat.subcategories) utilCat.subcategories = utilCat.subcategories.filter(s => s !== 'House Rent');
        }
        
        // 3. Migrate Groceries list to single category structure
        if (state.categories.groceries && state.categories.groceries.some(c => c.name === 'Vegetables')) {
            state.categories.groceries = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES.groceries));
            needsSave = true;
        }

        // 4. Auto-migrate legacy Groceries transactions to the new schema
        if (state.transactions) {
            let txUpdated = false;
            state.transactions.forEach(tx => {
                if (tx.type === 'groceries' && tx.category !== 'Groceries') {
                    // Convert old category (e.g. 'Vegetables') to subcategory
                    tx.subcategory = tx.subcategory ? `${tx.category}: ${tx.subcategory}` : tx.category;
                    tx.category = 'Groceries';
                    txUpdated = true;
                }
            });
            if (txUpdated) needsSave = true;
        }

        // Automatically save to propagate the migration up to Firebase
        if (needsSave && state.userRole === 'admin') saveState();
    }

    // Reset temporary UI state
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
    
    if (typeof window.saveStateToFirebase === 'function') {
        const syncPromise = window.saveStateToFirebase(state);
        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => {
                state.hasUnsyncedChanges = false;
                if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                if (typeof pulseSyncDot === 'function') pulseSyncDot();
                if (typeof showToast === 'function') showToast('Sync successful!', 'check-circle');
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
        el.style.display = isAdmin ? '' : 'none';
    });
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

function refreshAll() {
    if(state.activeScreen==='screenDashboard') refreshDashboard();
    if(state.activeScreen==='screenTransactions') refreshTransactionList();
    if(state.activeScreen==='screenAnalytics') refreshAnalytics();
    if(state.activeScreen==='screenSettings') refreshSettings();
    if(state.activeScreen==='screenAdd') refreshAddForm();
    if(state.activeScreen==='screenReceipt') refreshReceiptForm();
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
            payer: state.currentUser ? state.currentUser.name : 'Unknown',
            paymentMethod: document.getElementById('addPaymentMethod')?.value || 'cash',
            splitWith: splitWith.length > 0 ? splitWith : null,
            houseId: '', // Handled directly in receipt generator now
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
    document.getElementById('addCustomSubcatBtn')?.addEventListener('click', addCustomSubcategoryToCurrentCategory);
    document.getElementById('addCustomSubcatInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCustomSubcategoryToCurrentCategory();
        }
    });

    ['filterSearch', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', refreshTransactionList);
    });
    ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterDateFrom', 'filterDateTo', 'sortBy'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', refreshTransactionList);
    });
    document.getElementById('sortToggleBtn')?.addEventListener('click', function() {
        state.sortAscending = !state.sortAscending;
        this.querySelector('i').className = state.sortAscending ? 'fas fa-arrow-down' : 'fas fa-arrow-up';
        refreshTransactionList();
    });
    document.getElementById('filterType')?.addEventListener('change', () => {
        populateFilterCategories();
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
        refreshSubcategoryList(type);
    });
    document.getElementById('settingsCategorySelect')?.addEventListener('change', refreshSubcategoryList);

    document.getElementById('addSubcatBtn')?.addEventListener('click', () => {
        if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
        const type = document.getElementById('settingsCatType').value;
        const catName = document.getElementById('settingsCategorySelect').value;
        const subName = document.getElementById('newSubcatName').value.trim();
        if (!catName || !subName) return showToast('Select category and enter subcategory name', 'exclamation-triangle');
        const cats = state.categories?.[type] || [];
        const cat = cats.find(c => c.name === catName);
        if (!cat) return;
        if (!cat.subcategories) cat.subcategories = [];
        if (cat.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) return showToast('Subcategory already exists', 'exclamation-triangle');
        cat.subcategories.push(subName);
        saveState();
        refreshSubcategoryList();
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
        const cats = state.categories?.[type] || [];
        const cat = cats.find(c => c.name === catName);
        if (cat) cat.subcategories = cat.subcategories.filter(s => s !== sub);
        saveState();
        refreshSubcategoryList();
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
        refreshSettingsCatList();
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
    const formTotal = document.querySelector('#receiptForm .receipt-total-form');
    if (formTotal) formTotal.innerHTML = `<strong>Total: ${formatCurrency(Math.max(0,total))}</strong>`;
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

    // Manual unlock button trigger
    document.getElementById('unlockBtn')?.addEventListener('click', triggerUnlock);
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
    if (!state.appLock?.credentialId) return continueInit();
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
        
        // Authentication Success
        document.getElementById('lockScreen').style.display = 'none';
        continueInit();
    } catch (err) {
        console.error(err);
        showToast('Authentication failed.', 'times-circle');
    }
}

// ==================== INIT ====================
window.handleAuthStateChanged = (user) => {
    const wasUser = !!state.currentUser;
    if (user) {
        const name = user.displayName || user.email.split('@')[0];
        state.currentUser = { uid: user.uid, name: name, email: user.email };
        
        // Role Checking
        const ADMIN_UIDS = ['m0lCGFazrlf8OMlUr1KD61JclVV2', 'PASTE_NEW_UID_HERE'];
        const ADMIN_EMAILS = ['robert@homefinlytics.com', 'robkh2008@gmail.com']; // Exact matches only
        const userEmail = user.email ? user.email.toLowerCase() : '';
        
        if (ADMIN_UIDS.includes(user.uid) || ADMIN_EMAILS.includes(userEmail)) {
            state.userRole = 'admin';
        } else {
            state.userRole = 'user'; // Esther, Gedion, Angela
        }
        
        const syncUserLabel = document.getElementById('syncUserName');
        if (syncUserLabel) {
            syncUserLabel.textContent = name;
        } else {
            const btn = document.getElementById('headerSyncBtn');
            if (btn) {
                const span = document.createElement('span');
                span.id = 'syncUserName';
                span.style.fontSize = '0.85rem';
                span.style.marginRight = '8px';
                span.style.fontWeight = '600';
                span.textContent = name;
                btn.insertBefore(span, btn.firstChild);
            }
        }
        
        const signOutWrap = document.getElementById('settingsSignOutWrap');
        if (signOutWrap) signOutWrap.style.display = 'block';
        const settingsUserEmail = document.getElementById('settingsUserEmail');
        if (settingsUserEmail) settingsUserEmail.textContent = user.email;
        
        const signInWrap = document.getElementById('settingsSignInWrap');
        if (signInWrap) signInWrap.style.display = 'none';

        if (typeof window.listenToFirebaseState === 'function') {
            window.listenToFirebaseState(window.onFirebaseDataReceived, state.userRole);
        }
        applyRoleRestrictions();

        const loginModal = document.getElementById('firebaseLoginModal');
        if (loginModal) loginModal.remove();

        if (!window.appInitialized) {
            window.appInitialized = true;
            if (state.appLock && state.appLock.enabled) {
                document.getElementById('splashScreen').style.display = 'none';
                document.getElementById('lockScreen').style.display = 'flex';
                triggerUnlock();
            } else {
                continueInit();
            }
        } else if (!wasUser) {
            refreshAll();
        }
    } else {
        state.currentUser = null;
        state.userRole = 'user';
        
        const syncUserLabel = document.getElementById('syncUserName');
        if (syncUserLabel) syncUserLabel.textContent = '';

        const signOutWrap = document.getElementById('settingsSignOutWrap');
        if (signOutWrap) signOutWrap.style.display = 'none';

        const signInWrap = document.getElementById('settingsSignInWrap');
        if (signInWrap) signInWrap.style.display = 'block';

        if (wasUser) {
            if (typeof window.detachFirebaseListeners === 'function') window.detachFirebaseListeners();
            resetState();
            refreshAll();
            navigateTo('screenDashboard');
        }
        applyRoleRestrictions();
        
        if (!window.appInitialized) {
            window.appInitialized = true;
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

    if (!state.payers) state.payers = [...DEFAULT_PAYERS];
    applyTheme();
    bindEvents();
    setupPullToRefresh();

    // Fallback if firebase fails to load
    setTimeout(() => {
        if (!window.appInitialized && typeof window.showLoginUI !== 'function') {
            console.warn("Firebase Auth timeout, proceeding offline");
            window.appInitialized = true;
            continueInit();
        }
    }, 3000);
}

function continueInit() {
    navigateTo('screenDashboard');
    document.getElementById('splashScreen')?.classList.add('hide');
    document.getElementById('appShell').style.display = 'flex';
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) splash.style.display = 'none';
    }, 400);

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
    // Automatically push any local changes made while offline
    if (state.currentUser && typeof window.saveStateToFirebase === 'function' && state.hasUnsyncedChanges) {
        const syncPromise = window.saveStateToFirebase(state);
        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => {
                state.hasUnsyncedChanges = false;
                if (typeof updateDashboardSyncBadge === 'function') updateDashboardSyncBadge();
                try { localStorage.setItem('home_finlytics_state', JSON.stringify(state)); } catch(e){}
                if (typeof pulseSyncDot === 'function') pulseSyncDot();
            }).catch(()=>{});
        }
    }
});

window.addEventListener('offline', () => {
    if (typeof showToast === 'function') showToast('Internet connection lost. Working offline.', 'exclamation-triangle');
});