// ==================== js/settings.js ====================

function refreshSettings() {
    // --- Theme, font size, currency, Google Sheets config ---
    const themeTrack = document.getElementById('themeToggleTrack');
    if (themeTrack) themeTrack.classList.toggle('active', state.theme === 'dark');

    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) fontSizeSelect.value = state.fontSize;

    const currencySelect = document.getElementById('currencySelect');
    if (currencySelect) currencySelect.value = state.currency;

    const appLockTrack = document.getElementById('appLockToggleTrack');
    if (appLockTrack) appLockTrack.classList.toggle('active', !!state.appLock?.enabled);

    // --- Budget settings list ---
    populateBudgetCategories();
    const budgetList = document.getElementById('budgetSettingsList');
    const isAdmin = state.userRole === 'admin';
    if (budgetList) {
        budgetList.innerHTML = Object.entries(state.budgets).map(([cat, limit]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--divider);">
                <span>${cat}</span><span>${formatCurrency(limit)}</span>
                ${isAdmin ? `<button class="btn btn-xs btn-danger remove-budget-btn" data-cat="${cat}"><i class="fas fa-times"></i></button>` : ''}
            </div>`).join('') || '<p style="color:var(--text-tertiary);">No budgets set</p>';
    }

    // --- Categories & Subcategories ---
    refreshSettingsCatList();
    populateSettingsCategorySelect();
    refreshSubcategoryList();

    // --- Payer Management ---
    renderPayerList();

    // --- House list ---
    const houseList = document.getElementById('settingsHouseList');
    if (houseList) {
        houseList.innerHTML = state.houses.map(h => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--divider);">
                <span>H${h.houseNo} · ${h.address} · Tenant: ${h.tenant} · Owner: ${h.owner} · Rent: ${formatCurrency(h.rent)}</span>
                ${isAdmin ? `<button class="btn btn-xs btn-danger remove-house-btn" data-id="${h.id}"><i class="fas fa-times"></i></button>` : ''}
            </div>`).join('');
    }
}

// --- Helper functions (unchanged, but with null checks already present) ---
function refreshSettingsCatList() {
    const type = document.getElementById('settingsCatType')?.value || 'expense';
    const list = document.getElementById('settingsCatList');
    const isAdmin = state.userRole === 'admin';
    if (!list) return;
    const cats = state.categories[type] || [];
    list.innerHTML = cats.map(c => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--divider);">
            <span style="font-size:1.2rem;width:24px;text-align:center;">${c.icon || ''}</span>
            <span style="width:14px;height:14px;border-radius:50%;background:${c.color};flex-shrink:0;"></span>
            <span style="flex:1;">${c.name}</span>
            ${isAdmin ? `<button class="btn btn-xs btn-danger remove-cat-btn" data-type="${type}" data-name="${c.name}"><i class="fas fa-times"></i></button>` : ''}
        </div>`).join('') || '<p style="color:var(--text-tertiary);">No categories</p>';
}

function populateSettingsCategorySelect() {
    const type = document.getElementById('settingsCatType')?.value || 'expense';
    const select = document.getElementById('settingsCategorySelect');
    if (!select) return;
    const cats = state.categories[type] || [];
    select.innerHTML = '<option value="">-- Choose Category --</option>' + cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function refreshSubcategoryList() {
    const type = document.getElementById('settingsCatType')?.value || 'expense';
    const catName = document.getElementById('settingsCategorySelect')?.value;
    const container = document.getElementById('subcatList');
    const isAdmin = state.userRole === 'admin';
    if (!container) return;
    if (!catName) {
        container.innerHTML = '<p style="color:var(--text-tertiary);">Select a category to manage subcategories.</p>';
        return;
    }
    const cats = state.categories[type] || [];
    const cat = cats.find(c => c.name === catName);
    if (!cat) { container.innerHTML = ''; return; }
    const subs = cat.subcategories || [];
    container.innerHTML = subs.map(sub => `
        <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--divider);">
            <span>${sub}</span>
            ${isAdmin ? `<button class="btn btn-xs btn-danger remove-subcat-btn" data-cat="${catName}" data-sub="${sub}"><i class="fas fa-times"></i></button>` : ''}
        </div>`).join('') || '<p style="color:var(--text-tertiary);">No subcategories.</p>';
}

function renderPayerList() {
    const container = document.getElementById('payerList');
    if (!container) return;
    container.innerHTML = state.payers.map((p, index) => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--divider);">
            <span>${p}</span>
            <button class="btn btn-xs btn-danger remove-payer-btn" data-index="${index}"><i class="fas fa-times"></i></button>
        </div>`).join('') || '<p style="color:var(--text-tertiary);">No payers added.</p>';
}

function populateBudgetCategories() {
    const select = document.getElementById('budgetCatSelect');
    if (!select) return;
    // Combine expense, groceries, and income categories (unique)
    const combined = [
        ...(state.categories.expense || []).map(c => c.name),
        ...(state.categories.groceries || []).map(c => c.name),
    ];
    const unique = [...new Set(combined)].sort();
    select.innerHTML = unique.map(c => `<option value="${c}">${c}</option>`).join('');
}