// ==================== js/addTransaction.js ====================
function addTransaction(txData, skipRefresh = false) {
    // Input validation
    if (isNaN(txData.amount) || txData.amount <= 0) {
        showToast('Amount must be greater than 0', 'exclamation-triangle');
        return null;
    }
    const tx = { id: generateId(), ...txData, createdAt: new Date().toISOString() };
    state.transactions.unshift(tx);
    saveState();
    if (!skipRefresh) {
        refreshAll();
    }
    showToast('Transaction added!', 'check-circle');
    return tx;
}

function updateTransaction(id, updates) {
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx >= 0) {
        state.transactions[idx] = {
            ...state.transactions[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        saveState();
        refreshAll();
        showToast('Transaction updated!', 'check-circle');
    }
}

function deleteTransaction(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    state.selectedTxIds.delete(id);
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
    refreshAddFormCategories();
    const type = document.getElementById('addType')?.value || '';
    const payerGroup = document.getElementById('addPayerGroup');
    if (payerGroup) {
        payerGroup.style.display = (['groceries', 'expense', 'settlement', 'lent', 'returned'].includes(type)) ? 'block' : 'none';
        const label = payerGroup.querySelector('label');
        if (label) {
            label.textContent = type === 'lent' ? 'Lent to' : type === 'returned' ? 'Returned by' : 'Payer';
        }
    }
    document.getElementById('addHouseGroup').style.display = type === 'rent' ? 'block' : 'none';

    // Populate houses
    const houseSelect = document.getElementById('addHouse');
    if (houseSelect) {
        houseSelect.innerHTML = '<option value="">Select</option>' +
            state.houses.map(h => `<option value="${h.id}">House ${h.houseNo} - ${h.tenant}</option>`).join('');
    }

    // Populate payers
    const payerSelect = document.getElementById('addPayer');
    if (payerSelect) {
        payerSelect.innerHTML = '<option value="">Select Payer</option>' +
            state.payers.map(p => `<option value="${p}">${p}</option>`).join('');
    }
    updateSplitCheckboxes();

    // Recurring templates – now with delete button
    const templList = document.getElementById('recurringTemplatesList');
    if (templList) {
        templList.innerHTML = state.recurringTemplates.length === 0
            ? '<p style="color:var(--text-tertiary);text-align:center;">No templates yet.</p>'
            : state.recurringTemplates.map((t, i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--divider);">
                    <span style="cursor:pointer;" class="template-item" data-index="${i}">${t.category} · ${formatCurrency(t.amount)}</span>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-xs btn-primary load-template-btn" data-index="${i}">Use</button>
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

    // If the option doesn't exist, add the "Add new..." option
    let hasNewOption = false;
    for (let opt of subSelect.options) {
        if (opt.value === '__new__') {
            hasNewOption = true;
            break;
        }
    }
    if (!hasNewOption) {
        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '+ Add new...';
        subSelect.appendChild(newOpt);
    }

    // Create input and confirm button for custom subcategory (if not already present)
    if (!document.getElementById('addCustomSubcatRow')) {
        const row = document.createElement('div');
        row.id = 'addCustomSubcatRow';
        row.style.cssText = 'display:none; gap:4px; margin-top:4px;';
        row.innerHTML = `
            <input type="text" id="addCustomSubcatInput" class="form-input" placeholder="Type new subcategory" style="flex:1;">
            <button type="button" id="addCustomSubcatBtn" class="btn btn-xs btn-primary">Save</button>
        `;
        subSelect.parentNode.insertBefore(row, subSelect.nextSibling);
    }
}

// NEW: Auto-add new subcategory to the selected category
function addCustomSubcategoryToCurrentCategory() {
    if (state.userRole !== 'admin') return showToast('Unauthorized action', 'exclamation-triangle');
    const type = document.getElementById('addType')?.value || '';
    const catName = document.getElementById('addCategory')?.value;
    const subName = document.getElementById('addCustomSubcatInput')?.value.trim();
    if (!catName || !subName) return;

    const cats = state.categories[type] || [];
    const cat = cats.find(c => c.name === catName);
    if (!cat) return;
    if (!cat.subcategories) cat.subcategories = [];
    if (cat.subcategories.includes(subName)) {
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
    document.getElementById('addCustomSubcatRow').style.display = 'none';
    document.getElementById('addCustomSubcatInput').value = '';
    showToast('Subcategory added!', 'check-circle');
}

// Override updateSubcategoryDropdown to manage "Add new..." option visibility
function updateSubcategoryDropdown() {
    const type = document.getElementById('addType')?.value || '';
    const catName = document.getElementById('addCategory')?.value;
    const subSelect = document.getElementById('addSubcategory');
    if (!subSelect) return;

    subSelect.innerHTML = '<option value="">Select</option>';
    if (catName) {
        const cats = state.categories[type] || [];
        const cat = cats.find(c => c.name === catName);
        if (cat && cat.subcategories) {
            cat.subcategories.forEach(sub => {
                subSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
            });
        }
        // Always add the "Add new..." option at the end
        if (state.userRole === 'admin') {
            const newOpt = document.createElement('option');
            newOpt.value = '__new__';
            newOpt.textContent = '+ Add new...';
            subSelect.appendChild(newOpt);
        }
    }

    // Hide the custom input row if visible and not relevant
    const row = document.getElementById('addCustomSubcatRow');
    if (row && subSelect.value !== '__new__') {
        row.style.display = 'none';
    }
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
    splitContainer.innerHTML = state.payers
        .filter(p => p !== payer)
        .map(p => `<label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;cursor:pointer;"><input type="checkbox" value="${p}" class="split-cb" style="accent-color:var(--accent);"> ${p}</label>`)
        .join('');
};