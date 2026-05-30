// ==================== js/addTransaction.js ====================

// Map each chip to which type(s) it should be visible for
const CHIP_TYPE_MAP = {
    'Food': 'expense',
    'Transport': 'expense',
    'Shopping': 'expense',
    'Healthcare': 'expense',
    'Entertainment': 'expense',
    'Utilities': 'expense',
    'Personal Care': 'expense',
    'Education': 'expense',
    'Debt & Loans': 'expense',
    'Marup': 'expense',
    'Landing': 'expense',
    'Miscellaneous Expenses': 'expense',
    'Groceries': 'groceries',  // all groceries subcats
    'House Rent': 'rent',       // all rent subcats
};

// Event delegation for type selector cards and quick-category chips (attach directly)
document.addEventListener('click', function(e) {
    // Type selector cards
    const card = e.target.closest('.type-card');
    if (card) {
        const typeVal = card.dataset.type;
        if (typeVal && typeof selectAddType === 'function') {
            selectAddType(typeVal);
            return;
        }
    }
    
    // Date quick-select chips
    const dateChip = e.target.closest('.date-chip');
    if (dateChip) {
        const dateInput = document.getElementById('addDate');
        if (!dateInput) return;
        const today = new Date();
        let targetDate;
        switch (dateChip.dataset.date) {
            case 'today':
                targetDate = today;
                break;
            case 'yesterday':
                targetDate = new Date(today);
                targetDate.setDate(today.getDate() - 1);
                break;
            case 'monthStart':
                targetDate = new Date(today.getFullYear(), today.getMonth(), 1);
                break;
        }
        if (targetDate) {
            dateInput.value = targetDate.toISOString().slice(0, 10);
            // Highlight active chip
            document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
            dateChip.classList.add('active');
            // Auto-focus amount field after date selection
            setTimeout(() => {
                const amtInput = document.getElementById('addAmount');
                if (amtInput) amtInput.focus();
            }, 100);
        }
        return;
    }
    
    // Quick category/subcategory chips
    const chip = e.target.closest('.quick-cat-chip');
    if (chip) {
        const cat = chip.dataset.cat;
        const sub = chip.dataset.sub;
        if (!cat) return;
        
        // Set the category dropdown
        const catSelect = document.getElementById('addCategory');
        if (catSelect) {
            const options = Array.from(catSelect.options);
            const match = options.find(o => o.value === cat);
            if (match) {
                catSelect.value = cat;
                catSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // If there's a subcategory, also set it after a brief delay
        if (sub) {
            setTimeout(() => {
                const subSelect = document.getElementById('addSubcategory');
                if (subSelect) {
                    const subOptions = Array.from(subSelect.options);
                    const subMatch = subOptions.find(o => o.value === sub || o.textContent.trim() === sub);
                    if (subMatch) {
                        subSelect.value = subMatch.value;
                        subSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }, 150);
        }
        
        // Highlight the tapped chip briefly
        chip.classList.add('matched');
        setTimeout(() => chip.classList.remove('matched'), 600);
        return;
    }
});

// Filter quick-category chips based on selected type
function filterCategoryChipsByType(typeVal) {
    const chips = document.querySelectorAll('.quick-cat-chip');
    chips.forEach(chip => {
        const cat = chip.dataset.cat;
        const chipType = CHIP_TYPE_MAP[cat] || 'expense';
        if (typeVal === 'all' || chipType === typeVal || 
            (typeVal === 'groceries' && cat === 'Groceries') ||
            (typeVal === 'rent' && cat === 'House Rent')) {
            chip.style.display = '';
            chip.classList.add('chip-visible');
        } else {
            chip.style.display = 'none';
            chip.classList.remove('chip-visible');
        }
    });
}

// Handle type selection via icon cards
function selectAddType(typeVal) {
    // Update hidden select
    const hiddenSelect = document.getElementById('addType');
    if (hiddenSelect) hiddenSelect.value = typeVal;
    
    // Update card states
    document.querySelectorAll('.type-card').forEach(card => {
        card.classList.toggle('active', card.dataset.type === typeVal);
    });
    
    // Filter category chips to match the new type
    filterCategoryChipsByType(typeVal);
    
    // Trigger the same logic as if the dropdown changed
    refreshAddForm();
}

function addTransaction(txData, skipRefresh = false) {
    // Input validation
    if (isNaN(txData.amount) || txData.amount <= 0) {
        showToast('Amount must be greater than 0', 'exclamation-triangle');
        return null;
    }
    // Auto-set userId from current user
    if (!txData.userId) {
        txData.userId = getCurrentUserId();
    }
    const tx = { id: generateId(), ...txData, createdAt: new Date().toISOString() };
    if (!state.transactions) state.transactions = [];
    state.transactions.unshift(tx);
    if (typeof invalidateTxCache === 'function') invalidateTxCache();
    saveState();
    if (!skipRefresh) {
        refreshAll();
    }
    showToast('Transaction added!', 'check-circle');
    return tx;
}

function updateTransaction(id, updates) {
    if (updates.amount !== undefined && (isNaN(updates.amount) || updates.amount <= 0)) {
        showToast('Amount must be greater than 0', 'exclamation-triangle');
        return null;
    }
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx >= 0) {
        state.transactions[idx] = {
            ...state.transactions[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        if (typeof invalidateTxCache === 'function') invalidateTxCache();
        saveState();
        refreshAll();
        showToast('Transaction updated!', 'check-circle');
        return true;
    }
    return null;
}

function deleteTransaction(id) {
    // Immediately remove from Firebase caches to prevent listener from re-adding
    if (window._firebasePublicCache && window._firebasePublicCache[id]) {
        delete window._firebasePublicCache[id];
        // Schedule immediate Firebase write for the deletion (skip debounce)
        if (typeof window.saveStateToFirebase === 'function' && navigator.onLine && state.currentUser) {
            window.saveStateToFirebase(state).catch(() => {});
        }
    }
    if (window._firebasePrivateCache && window._firebasePrivateCache[id]) {
        delete window._firebasePrivateCache[id];
        if (typeof window.saveStateToFirebase === 'function' && navigator.onLine && state.currentUser) {
            window.saveStateToFirebase(state).catch(() => {});
        }
    }
    
    state.transactions = state.transactions.filter(t => t.id !== id);
    state.selectedTxIds.delete(id);
    if (typeof invalidateTxCache === 'function') invalidateTxCache();
    saveState();
    refreshAll();
    showToast('Transaction deleted.', 'trash-alt');
}

function deleteMultipleTransactions(ids) {
    state.transactions = state.transactions.filter(t => !ids.has(t.id));
    state.selectedTxIds.clear();
    state.bulkSelectMode = false;
    saveState();
    refreshAll();
    showToast(`${ids.size} transactions deleted.`, 'trash-alt');
}

function refreshAddForm() {
    const form = document.getElementById('addTransactionForm');
    const isEditingTemplate = form && form.dataset.editTemplateIndex !== undefined && form.dataset.editTemplateIndex !== '';
    const isAdmin = state.userRole === 'admin';
    
    // Sync type selector cards with hidden select
    const addType = document.getElementById('addType')?.value || 'expense';
    document.querySelectorAll('.type-card').forEach(card => {
        card.classList.toggle('active', card.dataset.type === addType);
    });
    
    // Filter quick-category chips based on current type
    filterCategoryChipsByType(addType);
    
    const submitBtn = document.querySelector('#addTransactionForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = isEditingTemplate ? '<i class="fas fa-save"></i> Update Template' : '<i class="fas fa-save"></i> Save';
    }
    
    const recurringCheckboxWrap = document.getElementById('addIsRecurring')?.closest('.form-group');
    if (recurringCheckboxWrap) {
        recurringCheckboxWrap.style.display = isEditingTemplate ? 'none' : 'block';
    }
    
    // Payer override — show for all groceries types (any user can specify who paid)
    const payerGroup = document.getElementById('addPayerGroup');
    const type = document.getElementById('addType')?.value || '';
    if (payerGroup) {
        // Show payer override for groceries (any user can record for the group)
        payerGroup.style.display = (type === 'groceries') ? 'block' : 'none';
        const payerSelect = document.getElementById('addPayerOverride');
        if (payerSelect) {
            // Build payer list from group members + payers
            const groupMembers = getUserGroupMembers();
            const payerNames = groupMembers.map(m => m.displayName).filter(Boolean);
            // Also include state.payers
            (state.payers || []).forEach(p => {
                if (!payerNames.includes(p)) payerNames.push(p);
            });
            payerSelect.innerHTML = '<option value="">Me</option>' +
                payerNames.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
        }
    }

    refreshAddFormCategories();
    document.getElementById('addHouseGroup').style.display = addType === 'rent' ? 'block' : 'none';

    // Populate houses
    const houseSelect = document.getElementById('addHouse');
    if (houseSelect) {
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        houseSelect.innerHTML = '<option value="">Select</option>' +
            houses.map(h => `<option value="${escapeHTML(h.id)}">House ${escapeHTML(h.houseNo)} - ${escapeHTML(h.tenant)}</option>`).join('');
        // Show hint when an admin residence house is selected (trigger change to update)
        houseSelect.dispatchEvent(new Event('change'));
    }

    updateSplitCheckboxes();

    // Recurring templates – now with delete and edit buttons
    const templList = document.getElementById('recurringTemplatesList');
    if (templList) {
        const templates = state.recurringTemplates ? Object.values(state.recurringTemplates).filter(Boolean) : [];
        templList.innerHTML = templates.length === 0
            ? '<p style="color:var(--text-tertiary);text-align:center;">No templates yet.</p>'
            : templates.map((t, i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--divider);">
                    <span style="cursor:pointer;" class="template-item" data-index="${i}">${escapeHTML(t.category)}${t.subcategory ? ` <small style="color:var(--text-secondary);">(${escapeHTML(t.subcategory.includes(':') ? t.subcategory.split(':').slice(1).join(':').trim() : t.subcategory)})</small>` : ''} · ${formatCurrency(t.amount)}</span>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-xs btn-primary load-template-btn" data-index="${i}">Use</button>
                        <button class="btn btn-xs btn-secondary edit-template-btn" data-index="${i}" title="Edit Template"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-xs btn-danger delete-template-btn" data-index="${i}"><i class="fas fa-times"></i></button>
                    </div>
                </div>`).join('');
    }

    // Subcategory custom addition – ensure UI elements exist
    setupCustomSubcategoryUI();
}

// NEW: Create dynamic UI for adding custom subcategory
function setupCustomSubcategoryUI() {
    // All authenticated users can add custom subcategories
    const subSelect = document.getElementById('addSubcategory');
    if (!subSelect) return;

    // Create input and confirm button for custom subcategory (if not already present)
    if (!document.getElementById('addCustomSubcatRow')) {
        const row = document.createElement('div');
        row.id = 'addCustomSubcatRow';
        row.style.cssText = 'display:none; gap:4px; margin-top:4px;';
        row.innerHTML = `
            <input type="text" id="addCustomSubcatInput" class="form-input" placeholder="Type new subcategory" style="flex:1;" aria-label="New subcategory name">
            <button type="button" id="addCustomSubcatBtn" class="btn btn-xs btn-primary">Save</button>
        `;
        subSelect.parentNode.insertBefore(row, subSelect.nextSibling);
        
        // Bind event listeners immediately after creating the elements
        document.getElementById('addCustomSubcatBtn')?.addEventListener('click', addCustomSubcategoryToCurrentCategory);
        document.getElementById('addCustomSubcatInput')?.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCustomSubcategoryToCurrentCategory();
            }
        });
    }
}

// NEW: Auto-add new subcategory to the selected category
function addCustomSubcategoryToCurrentCategory() {
    // All users can add subcategories to their categories
    const type = document.getElementById('addType')?.value || '';
    const catName = document.getElementById('addCategory')?.value;
    const subName = document.getElementById('addCustomSubcatInput')?.value.trim();
    if (!catName || !subName) return;

    // FIX: Search across all category types to find the matching category
    let cat = null;
    let foundType = type;
    if (type && state.categories?.[type]) {
        const cats = Object.values(state.categories[type]).filter(Boolean);
        cat = cats.find(c => c.name === catName);
    }
    if (!cat) {
        ['expense', 'groceries'].forEach(t => {
            if (state.categories?.[t] && !cat) {
                const cats = Object.values(state.categories[t]).filter(Boolean);
                cat = cats.find(c => c.name === catName);
                if (cat) foundType = t;
            }
        });
    }
    if (!cat) return;
    if (!cat.subcategories) cat.subcategories = [];
    if (cat.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
        showToast('Subcategory already exists', 'exclamation-triangle');
        return;
    }
    cat.subcategories.push(subName);
    saveState();

    // Refresh the dropdown and select the newly added subcategory
    updateSubcategoryDropdown();
    const subSelect = document.getElementById('addSubcategory');
    if (subSelect) subSelect.value = subName;

    // Hide the custom input row
    const customRow = document.getElementById('addCustomSubcatRow');
    if (customRow) customRow.style.display = 'none';
    const customInput = document.getElementById('addCustomSubcatInput');
    if (customInput) customInput.value = '';
    showToast('Subcategory added!', 'check-circle');
}

// Delete a recurring template
function deleteRecurringTemplate(index) {
    state.recurringTemplates.splice(index, 1);
    saveState();
    refreshAddForm();
    showToast('Template removed.', 'trash-alt');
}

window.updateSplitCheckboxes = function() {
    const payer = state.currentUser ? state.currentUser.name : '';
    const type = document.getElementById('addType')?.value;
    const splitGroup = document.getElementById('addSplitGroup');
    const splitContainer = document.getElementById('addSplitCheckboxes');
    
    if (!payer || !splitGroup || !splitContainer || (type !== 'expense' && type !== 'groceries')) {
        if(splitGroup) splitGroup.style.display = 'none';
        return;
    }
    splitGroup.style.display = 'block';
    const payers = state.payers ? Object.values(state.payers).filter(Boolean) : [];
    splitContainer.innerHTML = payers
        .filter(p => p !== payer)
        .map(p => `<label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;cursor:pointer;"><input type="checkbox" value="${p}" class="split-cb" style="accent-color:var(--accent);"> ${p}</label>`)
        .join('');
};

// ===== Sticky Save Bar — Live Total Update =====
function updateStickyAddTotal() {
    const amtInput = document.getElementById('addAmount');
    const totalEl = document.getElementById('stickyAddTotal');
    if (!totalEl) return;
    const amt = parseFloat(amtInput?.value) || 0;
    totalEl.textContent = amt > 0 ? 'Total: ' + formatCurrency(amt) : 'Total: ₹0.00';
    totalEl.style.color = amt > 0 ? 'var(--accent)' : 'var(--text-tertiary)';
}

// Bind amount input to sticky total (only once)
document.addEventListener('DOMContentLoaded', function() {
    const amtInput = document.getElementById('addAmount');
    if (amtInput && !window._stickyTotalBound) {
        window._stickyTotalBound = true;
        amtInput.addEventListener('input', updateStickyAddTotal);
        // Also update on form reset
        const form = document.getElementById('addTransactionForm');
        if (form) {
            form.addEventListener('reset', function() {
                setTimeout(updateStickyAddTotal, 50);
            });
            // Update after submit too
            form.addEventListener('submit', function() {
                setTimeout(updateStickyAddTotal, 50);
            });
        }
    }
});

// Bind amount input to sticky total (only once)
document.addEventListener('DOMContentLoaded', function() {
    const amtInput = document.getElementById('addAmount');
    if (amtInput && !window._stickyTotalBound) {
        window._stickyTotalBound = true;
        amtInput.addEventListener('input', updateStickyAddTotal);
        // Also update on form reset
        const form = document.getElementById('addTransactionForm');
        if (form) {
            form.addEventListener('reset', function() {
                setTimeout(updateStickyAddTotal, 50);
            });
            // Update after submit too
            form.addEventListener('submit', function() {
                setTimeout(updateStickyAddTotal, 50);
            });
        }
    }
});