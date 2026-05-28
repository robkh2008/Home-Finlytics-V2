// ==================== js/addTransaction.js ====================
function addTransaction(txData, skipRefresh = false) {
    // Input validation
    if (isNaN(txData.amount) || txData.amount <= 0) {
        showToast('Amount must be greater than 0', 'exclamation-triangle');
        return null;
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
    
    const submitBtn = document.querySelector('#addTransactionForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = isEditingTemplate ? '<i class="fas fa-save"></i> Update Template' : '<i class="fas fa-save"></i> Save';
    }
    
    const recurringCheckboxWrap = document.getElementById('addIsRecurring')?.closest('.form-group');
    if (recurringCheckboxWrap) {
        recurringCheckboxWrap.style.display = isEditingTemplate ? 'none' : 'block';
    }

    refreshAddFormCategories();
    const type = document.getElementById('addType')?.value || '';
    document.getElementById('addHouseGroup').style.display = type === 'rent' ? 'block' : 'none';

    // Populate houses
    const houseSelect = document.getElementById('addHouse');
    if (houseSelect) {
        const houses = state.houses ? Object.values(state.houses).filter(Boolean) : [];
        houseSelect.innerHTML = '<option value="">Select</option>' +
            houses.map(h => `<option value="${escapeHTML(h.id)}">House ${escapeHTML(h.houseNo)} - ${escapeHTML(h.tenant)}</option>`).join('');
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
    if (state.userRole !== 'admin') return;
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
    if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
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