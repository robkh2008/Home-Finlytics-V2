// ==================== js/settings.js ====================

function refreshSettings() {
    // --- Theme, font size, currency, Google Sheets config ---
    const themeTrack = document.getElementById('themeToggleTrack');
    if (themeTrack) themeTrack.classList.toggle('active', state.theme === 'dark');

    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) fontSizeSelect.value = state.fontSize;

    const currencySelect = document.getElementById('currencySelect');
    if (currencySelect) currencySelect.value = state.currency;

    const elecRateInput = document.getElementById('settingsElectricRate');
    if (elecRateInput) elecRateInput.value = state.electricRate || 8;
    document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = state.currency || '₹');

    const appLockTrack = document.getElementById('appLockToggleTrack');
    if (appLockTrack) appLockTrack.classList.toggle('active', !!state.appLock?.enabled);
    const appLockWrap = document.getElementById('appLockToggleWrap');
    if (appLockWrap) appLockWrap.setAttribute('aria-checked', !!state.appLock?.enabled ? 'true' : 'false');

    // --- Budget settings list ---
    populateBudgetCategories();
    const budgetList = document.getElementById('budgetSettingsList');
    const isAdmin = state.userRole === 'admin';
    if (budgetList) {
        budgetList.innerHTML = Object.entries(state.budgets || {}).map(([cat, limit]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--divider);">
                <span>${escapeHTML(cat)}</span><span>${formatCurrency(limit)}</span>
                ${isAdmin ? `<button class="btn btn-xs btn-danger remove-budget-btn" data-cat="${escapeHTML(cat)}"><i class="fas fa-times"></i></button>` : ''}
            </div>`).join('') || '<p style="color:var(--text-tertiary);">No budgets set</p>';
    }

    // --- Categories & Subcategories ---
    const currentType = document.getElementById('settingsCatType')?.value || 'expense';
    refreshSettingsCatList(currentType);
    populateSettingsCategorySelect(currentType);
    refreshSubcategoryList(currentType);

    // --- Payer Management ---
    renderPayerList();

    // --- House list ---
    const houseList = document.getElementById('settingsHouseList');
    if (houseList) {
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        houseList.innerHTML = houses.length === 0
            ? '<p style="color:var(--text-tertiary);">No houses added yet.</p>'
            : houses.map(h => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--divider);">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;">H${escapeHTML(h.houseNo)} — ${escapeHTML(h.address)} ${h.isAdminHouse ? '<span style="font-size:0.6rem;background:rgba(90,200,250,0.2);color:var(--accent);padding:1px 6px;border-radius:6px;margin-left:4px;white-space:nowrap;">👤 My Residence</span>' : ''}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);">
                        Tenant: ${escapeHTML(h.tenant)} · Owner: ${escapeHTML(h.owner)} · Rent: ${formatCurrency(h.rent)}
                    </div>
                </div>
                ${isAdmin ? `
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn btn-xs btn-secondary edit-house-btn" data-id="${escapeHTML(h.id)}" title="Edit House"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-xs btn-danger remove-house-btn" data-id="${escapeHTML(h.id)}" title="Remove House"><i class="fas fa-times"></i></button>
                </div>` : ''}
            </div>`).join('');
    }
}

// --- Helper functions (unchanged, but with null checks already present) ---
function refreshSettingsCatList(cachedType = null) {
    const type = (typeof cachedType === 'string' ? cachedType : null) || document.getElementById('settingsCatType')?.value || 'expense';
    const list = document.getElementById('settingsCatList');
    const isAdmin = state.userRole === 'admin';
    if (!list) return;
    const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
    list.innerHTML = cats.map(c => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--divider);">
            <span style="font-size:1.2rem;width:24px;text-align:center;">${escapeHTML(c.icon || '')}</span>
            <span style="width:14px;height:14px;border-radius:50%;background:${escapeHTML(c.color)};flex-shrink:0;"></span>
            <span style="flex:1;">${escapeHTML(c.name)}</span>
            ${isAdmin ? `<button class="btn btn-xs btn-danger remove-cat-btn" data-type="${escapeHTML(type)}" data-name="${escapeHTML(c.name)}"><i class="fas fa-times"></i></button>` : ''}
        </div>`).join('') || '<p style="color:var(--text-tertiary);">No categories</p>';
}

function populateSettingsCategorySelect(cachedType = null) {
    const type = (typeof cachedType === 'string' ? cachedType : null) || document.getElementById('settingsCatType')?.value || 'expense';
    const select = document.getElementById('settingsCategorySelect');
    if (!select) return;
    const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
    select.innerHTML = '<option value="">-- Choose Category --</option>' + cats.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('');
}

function refreshSubcategoryList(cachedType = null) {
    const type = (typeof cachedType === 'string' ? cachedType : null) || document.getElementById('settingsCatType')?.value || 'expense';
    const catName = document.getElementById('settingsCategorySelect')?.value;
    const container = document.getElementById('subcatList');
    const isAdmin = state.userRole === 'admin';
    if (!container) return;
    if (!catName) {
        container.innerHTML = '<p style="color:var(--text-tertiary);">Select a category to manage subcategories.</p>';
        return;
    }
    // FIX: Search across all category types for the matching category name
    let cats = [];
    if (state.categories?.[type]) {
        cats = Object.values(state.categories[type]).filter(Boolean);
    }
    let cat = cats.find(c => c.name === catName);
    if (!cat) {
        // Fallback: search other category types
        ['expense', 'groceries'].forEach(t => {
            if (t !== type && state.categories?.[t] && !cat) {
                const otherCats = Object.values(state.categories[t]).filter(Boolean);
                cat = otherCats.find(c => c.name === catName);
            }
        });
    }
    if (!cat) { container.innerHTML = '<p style="color:var(--text-tertiary);">Category not found.</p>'; return; }
    const subs = cat.subcategories ? Object.values(cat.subcategories).filter(Boolean) : [];
    const subIcons = cat.subcategoryIcons || {};
    container.innerHTML = subs.map(sub => {
        const subIcon = subIcons[sub] || getSubcategoryIcon(sub, catName) || '📄';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid var(--divider);">
            <span><span style="margin-right:6px;">${subIcon}</span>${escapeHTML(sub)}</span>
            ${isAdmin ? `<button class="btn btn-xs btn-danger remove-subcat-btn" data-cat="${escapeHTML(catName)}" data-sub="${escapeHTML(sub)}"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
    }).join('') || '<p style="color:var(--text-tertiary);">No subcategories.</p>';
}

function renderPayerList() {
    const container = document.getElementById('payerList');
    const isAdmin = state.userRole === 'admin';
    if (!container) return;
    const payers = state.payers ? Object.values(state.payers).filter(Boolean) : [];
    
    // Auto-include current user's profile name and email
    const linkedNames = [];
    if (state.userProfile?.displayName) linkedNames.push(state.userProfile.displayName.toLowerCase());
    if (state.currentUser?.email) linkedNames.push(state.currentUser.email.split('@')[0].toLowerCase());
    
    // Merge unique names from profiles if available (for other users)
    const allPayerNames = [...payers];
    // If payers exist as array, ensure all unique
    
    // Show linked status for names that match profile
    container.innerHTML = allPayerNames.length === 0
        ? '<p style="color:var(--text-tertiary);">No payers added. Names auto-populate when users sign in.</p>'
        : allPayerNames.map((p, index) => {
            const isLinked = linkedNames.some(n => n === p.toLowerCase());
            return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--divider);align-items:center;">
                <span>${escapeHTML(p)}${isLinked ? ' <span style="font-size:0.65rem;color:var(--accent);background:rgba(108,92,231,0.15);padding:1px 6px;border-radius:6px;">👤 linked</span>' : ''}</span>
                ${isAdmin ? `<button class="btn btn-xs btn-danger remove-payer-btn" data-index="${index}"><i class="fas fa-times"></i></button>` : ''}
            </div>`;
        }).join('');
}

// Edit house — populates the add form fields with existing house data
function editHouseUI(houseId) {
    const house = (state.houses || []).find(h => h.id === houseId);
    if (!house) return;
    
    document.getElementById('newHouseNo').value = house.houseNo || '';
    document.getElementById('newHouseAddress').value = house.address || '';
    document.getElementById('newHouseTenant').value = house.tenant || '';
    document.getElementById('newHouseOwner').value = house.owner || '';
    document.getElementById('newHouseRent').value = house.rent || '';
    const adminCb = document.getElementById('newHouseAdminResidence');
    if (adminCb) adminCb.checked = !!house.isAdminHouse;
    
    // Change the Add button to an Update button
    const addBtn = document.getElementById('addHouseBtn');
    if (addBtn) {
        addBtn.innerHTML = '<i class="fas fa-save"></i> Update';
        addBtn.dataset.editingHouseId = houseId;
    }
    
    // Scroll to the form
    document.getElementById('newHouseNo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Editing house — modify fields and click Update', 'edit');
}

// Update house — called by the modified addHouseBtn handler
function updateHouse(houseId) {
    const idx = (state.houses || []).findIndex(h => h.id === houseId);
    if (idx < 0) return;
    
    state.houses[idx] = {
        ...state.houses[idx],
        houseNo: document.getElementById('newHouseNo').value.trim(),
        address: document.getElementById('newHouseAddress').value.trim(),
        tenant: document.getElementById('newHouseTenant').value.trim(),
        owner: document.getElementById('newHouseOwner').value.trim(),
        rent: parseFloat(document.getElementById('newHouseRent').value) || 0,
        isAdminHouse: !!document.getElementById('newHouseAdminResidence')?.checked,
    };
    
    if (!state.houses[idx].houseNo || !state.houses[idx].tenant) {
        showToast('Fill House No. and Tenant', 'exclamation-triangle');
        return;
    }
    
    saveState();
    // Reset button and clear fields
    const addBtn = document.getElementById('addHouseBtn');
    if (addBtn) {
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
        delete addBtn.dataset.editingHouseId;
    }
    ['newHouseNo', 'newHouseAddress', 'newHouseTenant', 'newHouseOwner', 'newHouseRent'].forEach(id => document.getElementById(id).value = '');
    const adminCb = document.getElementById('newHouseAdminResidence');
    if (adminCb) adminCb.checked = false;
    refreshSettings();
    refreshAll();
    showToast('House updated!', 'home');
}

function populateBudgetCategories() {
    const select = document.getElementById('budgetCatSelect');
    if (!select) return;
    
    const getNames = (catArray) => {
        if (!catArray) return [];
        const arr = Object.values(catArray).filter(Boolean);
        return arr.map(c => c.name);
    };

    // Combine expense, groceries, and income categories (unique)
    const combined = [
        ...getNames(state.categories?.expense),
        ...getNames(state.categories?.groceries),
        ...getNames(state.categories?.income)
    ];
    const unique = [...new Set(combined)].sort();
    select.innerHTML = unique.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

// ==================== USER MANAGEMENT (Client-side RTDB) ====================
document.getElementById("loadUsersBtn")?.addEventListener("click", async function() {
    if (state.userRole !== "admin") return showToast("Unauthorized action", "exclamation-triangle");
    const btn = this;
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    const listEl = document.getElementById("userManagementList");
    const errEl = document.getElementById("userManagementError");
    if (errEl) errEl.style.display = "none";
    
    try {
        if (typeof window.adminListUsersRTDB !== "function") {
            throw new Error("User management not available. Try reloading the page.");
        }
        const users = await window.adminListUsersRTDB();
        if (!users || users.length === 0) {
            if (listEl) listEl.innerHTML = "<p style=\"color:var(--text-tertiary);\">No users found. Users appear here after they sign in and update their profile.</p>";
            return;
        }
        
        if (listEl) {
            listEl.innerHTML = users.map(u => {
                const isCurrentUser = u.uid === (state.currentUser?.uid || "");
                return '<div style="padding:10px 0;border-bottom:1px solid var(--divider);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-weight:600;font-size:0.85rem;">' + escapeHTML(u.displayName || u.email || "Unknown") + '</div>' +
                            '<div style="font-size:0.7rem;color:var(--text-secondary);">' + escapeHTML(u.email) + '</div>' +
                            '<div style="font-size:0.65rem;color:var(--text-tertiary);">' +
                                (u.lastSignIn ? 'Last: ' + new Date(u.lastSignIn).toLocaleDateString() : '') +
                                (u.isAdmin ? ' <span style="color:var(--accent);margin-left:6px;">?? Admin</span>' : ' <span style="color:var(--text-tertiary);margin-left:6px;">User</span>') +
                            '</div>' +
                        '</div>' +
                        (!isCurrentUser ? '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                            '<button class="btn btn-xs ' + (u.isAdmin ? 'btn-secondary' : 'btn-primary') + ' toggle-admin-btn" data-uid="' + escapeHTML(u.uid) + '" data-email="' + escapeHTML(u.email) + '" data-admin="' + (!u.isAdmin) + '">' +
                                (u.isAdmin ? 'Demote' : 'Make Admin') +
                            '</button>' +
                            '<button class="btn btn-xs btn-danger delete-user-btn" data-uid="' + escapeHTML(u.uid) + '" data-email="' + escapeHTML(u.email) + '" data-name="' + escapeHTML(u.displayName || u.email) + '">' +
                                '<i class="fas fa-trash"></i>' +
                            '</button>' +
                        '</div>' : '<span style="font-size:0.7rem;color:var(--accent);">You</span>') +
                    '</div>' +
                '</div>';
            }).join("");
        }
        
        document.querySelectorAll(".toggle-admin-btn").forEach(b => {
            b.addEventListener("click", async function() {
                const uid = this.dataset.uid;
                const email = this.dataset.email;
                const makeAdmin = this.dataset.admin === "true";
                try {
                    await window.adminSetAdminRTDB(uid, email, makeAdmin);
                    showToast(makeAdmin ? "User promoted to admin!" : "Admin demoted to user.", "check-circle");
                    document.getElementById("loadUsersBtn")?.click();
                } catch (e) { showToast(e.message || "Failed", "times-circle"); }
            });
        });
        
        document.querySelectorAll(".delete-user-btn").forEach(b => {
            b.addEventListener("click", function() {
                const uid = this.dataset.uid;
                const email = this.dataset.email;
                const name = this.dataset.name;
                showConfirm("Remove User", "Remove user \"" + escapeHTML(name) + "\" from the app? Their profile and admin status will be cleared. They can still sign in again.", "user-times", async () => {
                    try {
                        await window.adminRemoveUserRTDB(uid, email);
                        showToast("User removed!", "check-circle");
                        document.getElementById("loadUsersBtn")?.click();
                    } catch (e) { showToast(e.message || "Failed", "times-circle"); }
                });
            });
        });
    } catch (e) {
        if (errEl) { errEl.textContent = e.message || "Failed to load users."; errEl.style.display = "block"; }
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
});
