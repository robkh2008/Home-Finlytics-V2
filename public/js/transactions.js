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
    const fLandingStatus = document.getElementById('filterLandingStatus')?.value || 'all';
    const sortBy = document.getElementById('sortBy')?.value || 'date';

    if (fType !== 'all') txs = txs.filter(t => t.type === fType);
    if (fCat !== 'all') txs = txs.filter(t => (t.category || '').toLowerCase() === fCat.toLowerCase());
    if (fSub !== 'all') txs = txs.filter(t => (t.subcategory || '').toLowerCase() === fSub.toLowerCase());
    if (fPayer !== 'all') txs = txs.filter(t => (t.payer || '').toLowerCase() === fPayer.toLowerCase());
    if (fLandingStatus !== 'all') txs = txs.filter(t => (t.landingStatus || 'active') === fLandingStatus);
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
    // OPTIMIZATION: Throttle rapid successive calls (e.g., from keystroke events)
    if (refreshTransactionList._throttle) {
        clearTimeout(refreshTransactionList._throttle);
    }
    refreshTransactionList._throttle = setTimeout(() => {
        refreshTransactionList._throttle = null;
        _refreshTransactionListNow();
    }, 100); // 100ms throttle for filter keystrokes
}

function _refreshTransactionListNow() {
    // Ensure filter categories are up‑to‑date (only when needed)
    populateFilterCategories();
    populateFilterSubcategories();
    populateFilterPayers();

    const txs = getFilteredTransactions();
    const container = document.getElementById('transactionList');
    const empty = document.getElementById('txEmptyState');
    if (!container || !empty) return;
    
    if (txs.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        // OPTIMIZATION: Build HTML as array join (faster than string concatenation)
        const fragments = txs.map(t => {
            const isSelected = state.selectedTxIds.has(t.id);
            const searchType = t.type === 'rent' ? 'expense' : t.type;
            const catColor = getCategoryColor(t.category || '', searchType);
            const catIcon = getCategoryIcon(t.category || '', searchType);
            const subIcon = getSubcategoryIcon(t.subcategory, t.category);
            // Use subcategory icon when available for more variety, fallback to category icon
            const displayIcon = subIcon || catIcon;
            const isInc = t.type === 'income' || t.type === 'returned';
            const isNeu = t.type === 'settlement';
            const amountColor = isInc ? 'var(--success)' : (isNeu ? 'var(--text-secondary)' : 'var(--danger)');
            const amountPrefix = isInc ? '+' : (isNeu ? '↺ ' : '-');
            const hasGroup = t.subcategory && t.subcategory.includes(':');
            const group = hasGroup ? t.subcategory.split(':')[0].trim() : '';
            
            return `<div class="tx-row glass-card ${state.bulkSelectMode ? 'bulk-mode' : ''} ${isSelected ? 'selected' : ''}"
                 data-id="${t.id}"
                 style="margin-bottom:6px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:10px;${isSelected ? 'outline:2px solid var(--accent);' : ''}">
                ${state.bulkSelectMode ? `<input type="checkbox" class="bulk-checkbox" data-id="${t.id}" ${isSelected ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);">` : ''}
                ${displayIcon ? `<span style="font-size:1.4rem;flex-shrink:0;text-align:center;width:24px;">${displayIcon}</span>` : `<span style="width:10px;height:10px;border-radius:50%;background:${catColor};flex-shrink:0;margin:0 7px;"></span>`}
                <div style="flex:1;" class="tx-info">
                    <div style="display:flex;justify-content:space-between;">
                        <strong>${escapeHTML(t.subcategory || t.category || 'N/A')}</strong>
                        <span style="font-weight:700;color:${amountColor};">${amountPrefix}${formatCurrency(t.amount)}</span>
                    </div>
                    ${t.subcategory ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);">${hasGroup ? `<span class="subcat-filter-tag" data-filter="${escapeHTML(group)}:" style="cursor:pointer;color:var(--accent);text-decoration:underline dotted;">${escapeHTML(t.category)} · Filter by ${escapeHTML(t.subcategory.split(':').slice(1).join(':').trim())}</span>` : `<span>${escapeHTML(t.category)}</span>`}${(t.type === 'groceries' || t.category === 'Groceries') ? ' <span style="font-size:0.55rem;background:rgba(52,199,89,0.2);color:var(--success);padding:1px 5px;border-radius:4px;">🍳 shared</span>' : ''}</div>` : ''}
                    <div style="font-size:var(--font-size-sm);color:var(--text-tertiary);">
                        ${t.date} · ${t.type}${t.payer ? ' · ' + escapeHTML(t.payer) : ''}${t.paymentMethod ? ' · ' + escapeHTML(t.paymentMethod.toUpperCase()) : ''}
                        ${t.userId && t.userId !== getCurrentUserId() && t.type !== 'groceries' && t.category !== 'Groceries' ? ` · <span style="color:var(--accent);">${escapeHTML(t.payer || 'other')}</span>` : ''}
                        ${t.notes ? ` · ${escapeHTML(t.notes.substring(0, 40))}${t.notes.length > 40 ? '...' : ''}` : ''}
                    </div>
                </div>
                ${state.bulkSelectMode ? '' : `<div class="tx-swipe-actions">
                    <button class="tx-swipe-btn edit" data-action="edit" data-id="${t.id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="tx-swipe-btn copy" data-action="copy" data-id="${t.id}" title="Copy"><i class="fas fa-copy"></i></button>
                    <button class="tx-swipe-btn delete" data-action="delete" data-id="${t.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>`}
            </div>`;
        });
        container.innerHTML = fragments.join('');
        
        // Attach events to the new rows
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
        let startX = 0, startY = 0;

        row.addEventListener('touchstart', e => {
            if (!state.bulkSelectMode) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        }, { passive: true });

        row.addEventListener('touchmove', e => {
            if (state.bulkSelectMode) return;
            const dx = Math.abs(e.touches[0].clientX - startX);
            const dy = Math.abs(e.touches[0].clientY - startY);
            // If scrolling vertically more than horizontally, cancel swipe
            if (dy > dx && dy > 10) {
                startX = 0; // Reset so touchend won't trigger swipe
            }
        }, { passive: true });

        row.addEventListener('touchend', e => {
            if (state.bulkSelectMode || startX === 0) return;
            const diff = startX - e.changedTouches[0].clientX;
            if (diff > 80) {
                // Close previous swiped row
                if (currentSwipedRow && currentSwipedRow !== row) {
                    currentSwipedRow.classList.remove('swiped');
                }
                row.classList.add('swiped');
                currentSwipedRow = row;
            } else if (diff < -30) {
                row.classList.remove('swiped');
                currentSwipedRow = null;
            }
        });

        // Bulk select & Tap-to-view-detail
        row.addEventListener('click', e => {
            if (state.bulkSelectMode) {
                const cb = row.querySelector('.bulk-checkbox');
                if (cb && e.target !== cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            } else if (!e.target.closest('.tx-swipe-actions') && !row.classList.contains('swiped')) {
                // Toggle transaction detail expansion
                toggleTransactionDetail(id, row);
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
            if (houseEl) {
                houseEl.value = tx.houseId;
                houseEl.dispatchEvent(new Event('change')); // update admin house hint
            }
        }
        
        showToast('Editing transaction...', 'edit');
    }
}

// NEW: Toggle a detail panel below a transaction row
function toggleTransactionDetail(id, rowElement) {
    const tx = getVisibleTransactions().find(t => t.id === id);
    if (!tx) return;
    
    const currentUserId = getCurrentUserId();
    const userName = state.currentUser?.name || '';
    const isMine = (tx.userId === currentUserId) || (!tx.userId && tx.payer === userName);
    const isShared = tx.type === 'groceries' || tx.category === 'Groceries';
    
    // Check if detail panel already exists
    const existingPanel = rowElement.nextElementSibling;
    if (existingPanel && existingPanel.classList.contains('tx-detail-panel')) {
        // Toggle off — remove it
        existingPanel.remove();
        rowElement.style.borderRadius = '';
        rowElement.style.marginBottom = '6px';
        return;
    }
    
    // Close any other open detail panel
    document.querySelectorAll('.tx-detail-panel').forEach(p => p.remove());
    document.querySelectorAll('.tx-row').forEach(r => {
        r.style.borderRadius = '';
        r.style.marginBottom = '6px';
    });
    
    // Build detail panel
    const house = tx.houseId ? (state.houses || []).find(h => h.id === tx.houseId) : null;
    const catIcon = getCategoryIcon(tx.category || '', tx.type === 'rent' ? 'expense' : tx.type);
    const subIcon = getSubcategoryIcon(tx.subcategory, tx.category);
    const displayIcon = subIcon || catIcon;
    
    const detailHTML = `
        <div class="tx-detail-panel glass-card" style="margin-bottom:6px;padding:16px;border-radius:0 0 12px 12px;border-top:none;animation:slideDown 0.2s ease;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <span style="font-size:2rem;">${displayIcon || '📄'}</span>
                <div>
                    <div style="font-weight:700;font-size:1.1rem;">${escapeHTML(tx.subcategory || tx.category || 'N/A')}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHTML(tx.category || '')} · ${tx.type}</div>
                </div>
                <div style="margin-left:auto;font-weight:700;font-size:1.2rem;color:var(--danger);">-${formatCurrency(tx.amount)}</div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;">
                <div><span style="color:var(--text-tertiary);">Date:</span> <strong>${tx.date}</strong></div>
                <div><span style="color:var(--text-tertiary);">Payer:</span> <strong>${escapeHTML(tx.payer || 'Unknown')}</strong>${isShared ? ' <span class="shared-badge">🍳 shared</span>' : (isMine ? '' : ' <span class="user-badge">other</span>')}</div>
                <div><span style="color:var(--text-tertiary);">Payment:</span> <strong>${escapeHTML((tx.paymentMethod || 'cash').toUpperCase())}</strong></div>
                <div><span style="color:var(--text-tertiary);">Type:</span> <strong>${tx.type}</strong></div>
                ${tx.notes ? `<div style="grid-column:1/-1;"><span style="color:var(--text-tertiary);">Notes:</span> <span style="font-style:italic;">${escapeHTML(tx.notes)}</span></div>` : ''}
                ${house ? `<div style="grid-column:1/-1;"><span style="color:var(--text-tertiary);">House:</span> <strong>H${escapeHTML(house.houseNo)} — ${escapeHTML(house.tenant)}</strong> · Owner: ${escapeHTML(house.owner)}</div>` : ''}
                ${tx.borrower ? `<div style="grid-column:1/-1;"><span style="color:var(--text-tertiary);">Borrower:</span> <strong>${escapeHTML(tx.borrower)}</strong> · Status: ${escapeHTML(tx.landingStatus || 'active')}</div>` : ''}
                ${tx.splitWith ? `<div style="grid-column:1/-1;"><span style="color:var(--text-tertiary);">Split with:</span> <strong>${escapeHTML(Array.isArray(tx.splitWith) ? tx.splitWith.join(', ') : tx.splitWith)}</strong></div>` : ''}
            </div>
            
            <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
                ${isMine || isShared ? `<button class="btn btn-xs btn-primary tx-detail-edit" data-id="${tx.id}"><i class="fas fa-edit"></i> Edit</button>` : ''}
                ${isMine ? `<button class="btn btn-xs btn-danger tx-detail-delete" data-id="${tx.id}"><i class="fas fa-trash"></i> Delete</button>` : ''}
                ${!isMine && !isShared ? '<span style="font-size:0.7rem;color:var(--text-tertiary);align-self:center;">View only — added by ' + escapeHTML(tx.payer || 'another user') + '</span>' : ''}
            </div>
        </div>
    `;
    
    // Insert after the row
    rowElement.insertAdjacentHTML('afterend', detailHTML);
    rowElement.style.borderRadius = '12px 12px 0 0';
    rowElement.style.marginBottom = '0';
    
    // Attach edit/delete handlers
    const detailPanel = rowElement.nextElementSibling;
    detailPanel.querySelector('.tx-detail-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        editTransactionUI(id);
    });
    detailPanel.querySelector('.tx-detail-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm('Delete Transaction', 'Are you sure you want to delete this?', 'trash-alt', () => deleteTransaction(id));
    });
}

// NEW: Navigate from dashboard to a specific transaction in the list
function navigateToTransaction(txId) {
    // Switch to transactions screen
    navigateTo('screenTransactions');
    
    // Clear all filters to ensure the transaction is visible
    ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterSearch', 'filterDateFrom', 'filterDateTo', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
    });
    
    // Refresh the list
    if (typeof refreshTransactionList === 'function') refreshTransactionList();
    
    // Wait for DOM update, then find and expand the transaction
    setTimeout(() => {
        const row = document.querySelector(`.tx-row[data-id="${txId}"]`);
        if (row) {
            // Scroll to the row
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight briefly
            row.style.transition = 'background 0.3s';
            row.style.background = 'rgba(108,92,231,0.2)';
            setTimeout(() => { row.style.background = ''; }, 1500);
            // Expand detail
            toggleTransactionDetail(txId, row);
        } else {
            showToast('Transaction not found in current view', 'exclamation-triangle');
        }
    }, 300);
}

// Expose for dashboard use
window.navigateToTransaction = navigateToTransaction;