// ==================== js/transactions.js ====================
let outsideTxClickHandler = null;

function populateFilterCategories() {
    const filterType = document.getElementById('filterType')?.value || 'all';
    const filterCat = document.getElementById('filterCategory');
    if (!filterCat) return;

    let categories = [];
    if (filterType === 'all') {
        // Merge all categories from expense, groceries
        const getNames = (catArray) => catArray ? Object.values(catArray).filter(Boolean).map(c => c.name) : [];
        const expenseCats = getNames(state.categories?.expense);
        const groceriesCats = getNames(state.categories?.groceries);
        categories = [...new Set([...expenseCats, ...groceriesCats])].sort();
    } else {
        const typeMap = {
            expense: 'expense',
            groceries: 'groceries',
            rent: 'expense'   // rent uses expense categories for filtering
        };
        const src = typeMap[filterType] || 'expense';
        categories = state.categories?.[src] ? Object.values(state.categories[src]).filter(Boolean).map(c => c.name).sort() : [];
    }

    const currentValue = filterCat.value;
    filterCat.innerHTML = '<option value="all">All Categories</option>' +
        categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');

    // Restore previous selection if still valid
    if (currentValue && categories.includes(currentValue)) {
        filterCat.value = currentValue;
    }
}

function populateFilterSubcategories() {
    const filterCat = document.getElementById('filterCategory')?.value || 'all';
    const filterSub = document.getElementById('filterSubcategory');
    if (!filterSub) return;

    let subcategories = [];
    if (filterCat !== 'all') {
        const allCats = [
            ...(state.categories?.expense ? Object.values(state.categories.expense).filter(Boolean) : []),
            ...(state.categories?.groceries ? Object.values(state.categories.groceries).filter(Boolean) : [])
        ];
        allCats.filter(c => c.name === filterCat).forEach(c => {
            if (c.subcategories) {
                subcategories.push(...Object.values(c.subcategories).filter(Boolean));
            }
        });
        subcategories = [...new Set(subcategories)].sort();
    }

    let groups = {};
    let ungrouped = [];
    subcategories.forEach(sub => {
        if (sub.includes(':')) {
            let g = sub.split(':')[0].trim();
            if (!groups[g]) groups[g] = [];
            groups[g].push(sub);
        } else {
            ungrouped.push(sub);
        }
    });

    const currentValue = filterSub.value;
    filterSub.innerHTML = '<option value="all">All Subcats</option>' + ungrouped.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
    for (let g in groups) {
        filterSub.innerHTML += `<optgroup label="${escapeHTML(g)}">` + 
            groups[g].map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s.split(':').slice(1).join(':').trim())}</option>`).join('') + `</optgroup>`;
    }

    if (currentValue && (subcategories.includes(currentValue) || currentValue === 'all')) {
        filterSub.value = currentValue;
    }
}

function populateFilterPayers() {
    const filterPayer = document.getElementById('filterPayer');
    if (!filterPayer) return;
    const currentValue = filterPayer.value;
    const payers = state.payers ? Object.values(state.payers).filter(Boolean) : [];
    filterPayer.innerHTML = '<option value="all">All Payers</option>' +
        payers.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    if (currentValue && (payers.includes(currentValue) || currentValue === 'all')) {
        filterPayer.value = currentValue;
    }
}

function getFilteredTransactions() {
    let txs = [...getVisibleTransactions()];
    const fType = document.getElementById('filterType')?.value || 'all';
    const fCat = document.getElementById('filterCategory')?.value || 'all';
    const fSub = document.getElementById('filterSubcategory')?.value || 'all';
    const fPayer = document.getElementById('filterPayer')?.value || 'all';
    const fSearch = (document.getElementById('filterSearch')?.value || '').toLowerCase();
    const fDateFrom = document.getElementById('filterDateFrom')?.value;
    const fDateTo = document.getElementById('filterDateTo')?.value;
    const fAmtMin = parseFloat(document.getElementById('filterAmountMin')?.value);
    const fAmtMax = parseFloat(document.getElementById('filterAmountMax')?.value);
    const sortBy = document.getElementById('sortBy')?.value || 'date';

    if (fType !== 'all') txs = txs.filter(t => t.type === fType);
    if (fCat !== 'all') txs = txs.filter(t => (t.category || '').toLowerCase() === fCat.toLowerCase());
    if (fSub !== 'all') txs = txs.filter(t => (t.subcategory || '').toLowerCase() === fSub.toLowerCase());
    if (fPayer !== 'all') txs = txs.filter(t => (t.payer || '').toLowerCase() === fPayer.toLowerCase());
    if (fSearch) txs = txs.filter(t => 
        ((t.category || '') + ' ' + (t.subcategory || '') + ' ' + (t.notes || '') + ' ' + (t.payer || '') + ' ' + (t.paymentMethod || '')).toLowerCase().includes(fSearch)
    );
    if (fDateFrom) txs = txs.filter(t => t.date >= fDateFrom);
    if (fDateTo) txs = txs.filter(t => t.date <= fDateTo);
    if (!isNaN(fAmtMin)) txs = txs.filter(t => parseFloat(t.amount) >= fAmtMin);
    if (!isNaN(fAmtMax)) txs = txs.filter(t => parseFloat(t.amount) <= fAmtMax);

    txs.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'date') cmp = a.date.localeCompare(b.date);
        else if (sortBy === 'amount') cmp = parseFloat(a.amount) - parseFloat(b.amount);
        else if (sortBy === 'category') cmp = (a.category || '').localeCompare(b.category || '');
        return state.sortAscending ? cmp : -cmp;
    });
    return txs;
}

function refreshTransactionList() {
    // Ensure filter categories are up‑to‑date
    populateFilterCategories();
    populateFilterSubcategories();
    populateFilterPayers();

    const txs = getFilteredTransactions();
    const container = document.getElementById('transactionList');
    const empty = document.getElementById('txEmptyState');
    if (txs.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        container.innerHTML = txs.map(t => {
            const isSelected = state.selectedTxIds.has(t.id);
            const searchType = t.type === 'rent' ? 'expense' : t.type;
            const catColor = getCategoryColor(t.category || '', searchType);
            const catIcon = getCategoryIcon(t.category || '', searchType);
            
            return `
            <div class="tx-row glass-card ${state.bulkSelectMode ? 'bulk-mode' : ''} ${isSelected ? 'selected' : ''}"
                 data-id="${t.id}"
                 style="margin-bottom:6px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:10px;${isSelected ? 'outline:2px solid var(--accent);' : ''}">
                ${state.bulkSelectMode ? `<input type="checkbox" class="bulk-checkbox" data-id="${t.id}" ${isSelected ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);">` : ''}
                ${catIcon ? `<span style="font-size:1.4rem;flex-shrink:0;text-align:center;width:24px;">${catIcon}</span>` : `<span style="width:10px;height:10px;border-radius:50%;background:${catColor};flex-shrink:0;margin:0 7px;"></span>`}
                <div style="flex:1;" class="tx-info">
                    <div style="display:flex;justify-content:space-between;">
                        <strong>${escapeHTML(t.category || 'N/A')}</strong>
                        ${(() => {
                            const isInc = t.type === 'income' || t.type === 'returned';
                            const isNeu = t.type === 'settlement';
                            return `<span style="font-weight:700;color:${isInc ? 'var(--success)' : (isNeu ? 'var(--text-secondary)' : 'var(--danger)')};">
                                ${isInc ? '+' : (isNeu ? '↺ ' : '-')}${formatCurrency(t.amount)}
                            </span>`;
                        })()}
                    </div>
                    ${t.subcategory ? (() => {
                        const hasGroup = t.subcategory.includes(':');
                        const group = hasGroup ? t.subcategory.split(':')[0].trim() : '';
                        const name = hasGroup ? t.subcategory.split(':').slice(1).join(':').trim() : t.subcategory;
                        const badgeColor = hasGroup ? getStringColor(group) : '';
                        const bgStyle = hasGroup ? `background:${hexToRgba(badgeColor, 0.15)};border:1px solid ${hexToRgba(badgeColor, 0.3)};color:${badgeColor};` : 'background:var(--bg-secondary);border:1px solid var(--divider);color:var(--text-secondary);';
                        return `<div style="margin:4px 0;">
                            <span class="subcat-badge" data-cat="${escapeHTML(t.category)}" data-subcat="${escapeHTML(t.subcategory)}" style="${bgStyle}padding:2px 8px;border-radius:12px;font-size:0.7rem;display:inline-block;cursor:pointer;" title="Filter by ${escapeHTML(t.subcategory)}">
                                ${hasGroup ? `<strong>${escapeHTML(group)}</strong>: ${escapeHTML(name)}` : escapeHTML(name)}
                            </span>
                        </div>`;
                    })() : ''}
                    <small style="color:var(--text-secondary);">
                        ${t.date} · ${t.type} ${t.payer ? `· <span style="color:${getStringColor(t.payer)};font-weight:500;">${escapeHTML(t.payer)}</span>${t.splitWith ? ` (Split with ${escapeHTML(Array.isArray(t.splitWith) ? t.splitWith.join(', ') : t.splitWith)})` : ''}` : ''} ${t.paymentMethod ? '· ' + escapeHTML(t.paymentMethod.toUpperCase()) : ''}
                    </small>
                    ${t.notes ? `<div style="font-size:0.7rem;color:var(--text-tertiary);">${escapeHTML(t.notes)}</div>` : ''}
                    ${t.receiptNo ? `<div style="font-size:0.65rem;color:var(--accent);">Receipt: ${escapeHTML(t.receiptNo)}</div>` : ''}
                </div>
                ${!state.bulkSelectMode ? `
                <div class="tx-swipe-actions">
                    <button class="tx-swipe-btn edit" data-action="edit" data-id="${t.id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="tx-swipe-btn copy" data-action="copy" data-id="${t.id}" title="Copy"><i class="fas fa-copy"></i></button>
                    <button class="tx-swipe-btn delete" data-action="delete" data-id="${t.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>`;
        }).join('');

        // Attach events
        attachTransactionEvents(container);
    }
    updateBulkBar();

    // Update Floating Clear Filters Button Visibility
    const fType = document.getElementById('filterType')?.value || 'all';
    const fCat = document.getElementById('filterCategory')?.value || 'all';
    const fSub = document.getElementById('filterSubcategory')?.value || 'all';
    const fPayer = document.getElementById('filterPayer')?.value || 'all';
    const fSearch = document.getElementById('filterSearch')?.value || '';
    const fDateFrom = document.getElementById('filterDateFrom')?.value || '';
    const fDateTo = document.getElementById('filterDateTo')?.value || '';
    const fAmtMin = document.getElementById('filterAmountMin')?.value || '';
    const fAmtMax = document.getElementById('filterAmountMax')?.value || '';

    const hasActiveFilters = fType !== 'all' || fCat !== 'all' || fSub !== 'all' || fPayer !== 'all' ||
                             fSearch !== '' || fDateFrom !== '' || fDateTo !== '' || fAmtMin !== '' || fAmtMax !== '';
    const floatBtn = document.getElementById('floatingClearFiltersBtn');
    if (floatBtn) floatBtn.style.display = hasActiveFilters ? 'flex' : 'none';
}

function attachTransactionEvents(container) {
    // Swipe detection & click-outside-to-close
    let currentSwipedRow = null;

    container.querySelectorAll('.tx-row').forEach(row => {
        const id = row.dataset.id;
        let startX = 0;

        row.addEventListener('touchstart', e => {
            if (!state.bulkSelectMode) startX = e.touches[0].clientX;
        }, { passive: true });

        row.addEventListener('touchend', e => {
            if (state.bulkSelectMode) return;
            const diff = startX - e.changedTouches[0].clientX;
            if (diff > 40) {
                // Close previous swiped row
                if (currentSwipedRow && currentSwipedRow !== row) {
                    currentSwipedRow.classList.remove('swiped');
                }
                row.classList.add('swiped');
                currentSwipedRow = row;
            } else if (diff < -20) {
                row.classList.remove('swiped');
                currentSwipedRow = null;
            }
        });

        // Bulk select & Tap-to-edit
        row.addEventListener('click', e => {
            if (state.bulkSelectMode) {
                const cb = row.querySelector('.bulk-checkbox');
                if (cb && e.target !== cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            } else {
                // If not bulk selecting or clicking a swipe action, open the edit screen
                if (!e.target.closest('.tx-swipe-actions') && !row.classList.contains('swiped')) {
                    editTransactionUI(id);
                }
            }
        });

        row.querySelector('.bulk-checkbox')?.addEventListener('change', function () {
            if (this.checked) state.selectedTxIds.add(id);
            else state.selectedTxIds.delete(id);
            updateBulkBar();
        });
    });

    // Subcategory badge click to filter
    container.querySelectorAll('.subcat-badge').forEach(badge => {
        badge.addEventListener('click', e => {
            e.stopPropagation();
            if (state.bulkSelectMode) return;

            const cat = badge.dataset.cat;
            const subcat = badge.dataset.subcat;

            const filterTypeEl = document.getElementById('filterType');
            const filterCatEl = document.getElementById('filterCategory');
            const filterSubEl = document.getElementById('filterSubcategory');
            const filterSearchEl = document.getElementById('filterSearch');

            if (filterTypeEl && filterCatEl && filterSubEl) {
                filterTypeEl.value = 'all';
                populateFilterCategories();
                filterCatEl.value = cat;
                populateFilterSubcategories();
                filterSubEl.value = subcat;
                if (filterSearchEl) filterSearchEl.value = '';
                
                document.querySelector('#screenTransactions .screen-scroll').scrollTop = 0;
                refreshTransactionList();
            }
        });
    });

    // Swipe action buttons
    container.querySelectorAll('.tx-swipe-btn.delete').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            showConfirm('Delete Transaction', 'Are you sure you want to delete this?', 'trash-alt', () => deleteTransaction(id));
        });
    });

    container.querySelectorAll('.tx-swipe-btn.edit').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            editTransactionUI(id);
        });
    });

    container.querySelectorAll('.tx-swipe-btn.copy').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const tx = getVisibleTransactions().find(t => t.id === id);
            if (tx) {
                const { id, createdAt, updatedAt, ...copyData } = tx;
                // Optionally set date to today
                copyData.date = new Date().toISOString().slice(0, 10);
                const savedTx = addTransaction(copyData);
                if (savedTx) {
                    showToast('Transaction copied!', 'copy');
                }
            }
        });
    });

    // Click outside swiped rows to close them
    if (outsideTxClickHandler) {
        document.removeEventListener('click', outsideTxClickHandler);
    }
    outsideTxClickHandler = function handleOutsideClick(e) {
        if (!e.target.closest('.tx-row')) {
            container.querySelectorAll('.tx-row.swiped').forEach(r => r.classList.remove('swiped'));
            currentSwipedRow = null;
        }
    };
    document.addEventListener('click', outsideTxClickHandler);
}

function updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    const count = document.getElementById('bulkCount');
    if (!bar || !count) return;
    if (state.bulkSelectMode) {
        bar.classList.remove('hidden');
        count.textContent = `${state.selectedTxIds.size} selected`;
    } else {
        bar.classList.add('hidden');
    }
}

// --- Helper to open edit view and populate data reliably ---
function editTransactionUI(id) {
    const tx = getVisibleTransactions().find(t => t.id === id);
    if (tx) {
        const form = document.getElementById('addTransactionForm');
        if (form) form.dataset.editId = id;
        
        navigateTo('screenAdd');
        
        document.getElementById('addType').value = tx.type;
        
        // Refresh options before setting category
        if (typeof refreshAddFormCategories === 'function') refreshAddFormCategories();
        document.getElementById('addCategory').value = tx.category || '';
        
        // Refresh options before setting subcategory
        if (typeof updateSubcategoryDropdown === 'function') updateSubcategoryDropdown();
        document.getElementById('addSubcategory').value = tx.subcategory || '';  
        
        document.getElementById('addAmount').value = tx.amount;
        document.getElementById('addDate').value = tx.date;
        document.getElementById('addNotes').value = tx.notes || '';
        
        if (typeof updateSplitCheckboxes === 'function') updateSplitCheckboxes();
        if (tx.splitWith) {
            const splitArr = Array.isArray(tx.splitWith) ? tx.splitWith : [tx.splitWith];
            document.querySelectorAll('#addSplitCheckboxes input.split-cb').forEach(cb => {
                if (splitArr.includes(cb.value)) cb.checked = true;
            });
        }
        
        const pmEl = document.getElementById('addPaymentMethod');
        if (pmEl) pmEl.value = tx.paymentMethod || 'cash';
        
        if (tx.houseId) {
            const houseEl = document.getElementById('addHouse');
            if (houseEl) houseEl.value = tx.houseId;
        }
        
        showToast('Editing transaction...', 'edit');
    }
}