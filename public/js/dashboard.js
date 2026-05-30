// ==================== js/dashboard.js ====================
let dashPieChartInstance;
let dashboardActiveFilter = 'all'; // 'all', 'mine', 'kitchen', 'rent'

function refreshDashboard() {
    const allTxs = getVisibleTransactions();
    const currentUserId = getCurrentUserId();
    const userName = state.currentUser?.name || state.userProfile?.displayName || 'Me';
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTxs = allTxs.filter(t => t.date.startsWith(thisMonth));
    const userHouseIds = getCurrentUserHouseIds();

    // Update user context bar
    updateDashboardUserContext(userName);
    
    // ===== Apply active filter for chip-based filtering (affects ALL dashboard content) =====
    let displayTxs = monthTxs;
    let myExpenseTxs, groceriesTxs, myRentTxs;
    
    if (dashboardActiveFilter === 'mine') {
        // Only user's personal expenses (exclude shared groceries & rent)
        displayTxs = monthTxs.filter(t => 
            t.category !== 'Groceries' && t.category !== 'House Rent' &&
            ['expense', 'groceries'].includes(t.type) &&
            (t.userId === currentUserId || (!t.userId && t.payer === userName))
        );
        myExpenseTxs = displayTxs;
        groceriesTxs = [];
        myRentTxs = [];
    } else if (dashboardActiveFilter === 'kitchen') {
        // Only shared groceries/kitchen
        displayTxs = monthTxs.filter(t => 
            t.type === 'groceries' || (t.type === 'expense' && t.category === 'Groceries')
        );
        myExpenseTxs = [];
        groceriesTxs = displayTxs;
        myRentTxs = [];
    } else if (dashboardActiveFilter === 'rent') {
        // Only rent for user's linked houses
        displayTxs = monthTxs.filter(t => 
            (t.category === 'House Rent' || t.type === 'rent') &&
            (!t.houseId || userHouseIds.includes(t.houseId))
        );
        myExpenseTxs = [];
        groceriesTxs = [];
        myRentTxs = displayTxs;
    } else {
        // 'all' — use existing breakdown logic
        displayTxs = monthTxs;
        myExpenseTxs = monthTxs.filter(t => 
            ['expense', 'groceries'].includes(t.type) && 
            t.category !== 'Groceries' && 
            t.category !== 'House Rent' &&
            (t.userId === currentUserId || (!t.userId && t.payer === userName))
        );
        groceriesTxs = monthTxs.filter(t => 
            t.type === 'groceries' || (t.type === 'expense' && t.category === 'Groceries')
        );
        myRentTxs = monthTxs.filter(t => 
            (t.type === 'rent' || (t.type === 'expense' && t.category === 'House Rent')) &&
            (!t.houseId || userHouseIds.includes(t.houseId))
        );
    }

    const myTotalExpense = myExpenseTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    const groceriesTotal = groceriesTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    const rentTotal = myRentTxs.reduce((s, t) => s + parseFloat(t.amount), 0);

    // Combined: My individual spending + my share of groceries
    const mySpendingTotal = myTotalExpense + groceriesTotal;
    const totalExpense = mySpendingTotal + rentTotal;
    
    const txCount = displayTxs.filter(t => ['expense', 'groceries'].includes(t.type)).length;
    const currentDayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // Daily avg & projected based on filtered total (not always all three combined)
    const filteredTotalForProjection = dashboardActiveFilter === 'all' ? totalExpense :
        dashboardActiveFilter === 'mine' ? myTotalExpense :
        dashboardActiveFilter === 'kitchen' ? groceriesTotal : rentTotal;
    const dailyAvg = filteredTotalForProjection > 0 ? filteredTotalForProjection / Math.max(1, currentDayOfMonth) : 0;
    const projectedSpend = dailyAvg * daysInMonth;
    
    // Get combined budget total: only relevant budgets for active filter
    let totalBudget = 0;
    if (dashboardActiveFilter === 'all' || dashboardActiveFilter === 'mine') {
        const userBudgets = state.budgets?.[currentUserId] || {};
        totalBudget += Object.values(userBudgets).reduce((sum, limit) => sum + parseFloat(limit), 0);
    }
    if (dashboardActiveFilter === 'all' || dashboardActiveFilter === 'kitchen') {
        const sharedBudgets = state.budgets?.['__shared__'] || {};
        totalBudget += Object.values(sharedBudgets).reduce((sum, limit) => sum + parseFloat(limit), 0);
    }
    if (dashboardActiveFilter === 'all' || dashboardActiveFilter === 'rent') {
        userHouseIds.forEach(hid => {
            const houseBudgets = state.budgets?.['__house_' + hid] || {};
            totalBudget += Object.values(houseBudgets).reduce((sum, limit) => sum + parseFloat(limit), 0);
        });
    }
    let projectionIcon = '';
    if (totalBudget > 0) {
        if (projectedSpend > totalBudget) {
            projectionIcon = `<i class="fas fa-arrow-up" style="color:var(--danger); margin-left:6px; font-size:0.75em;" title="Projected over budget (${formatCurrency(totalBudget)})"></i>`;
        } else {
            projectionIcon = `<i class="fas fa-arrow-down" style="color:var(--success); margin-left:6px; font-size:0.75em;" title="Projected under budget (${formatCurrency(totalBudget)})"></i>`;
        }
    }

    // Adapt summary card labels/subtitles based on active filter
    const spendingLabel = dashboardActiveFilter === 'kitchen' ? 'Kitchen Spending' :
                          dashboardActiveFilter === 'rent' ? 'Rent Spending' :
                          dashboardActiveFilter === 'mine' ? 'My Spending' : 'Total Spending';
    const spendingSub = dashboardActiveFilter === 'all' ? `${escapeHTML(userName)} + 🍳` :
                        dashboardActiveFilter === 'mine' ? escapeHTML(userName) :
                        dashboardActiveFilter === 'kitchen' ? 'Shared groceries' : 'Linked houses';
    const spendingIcon = dashboardActiveFilter === 'kitchen' ? 'utensils' :
                         dashboardActiveFilter === 'rent' ? 'home' : 'wallet';
    const spendingColor = dashboardActiveFilter === 'kitchen' ? 'var(--success)' :
                          dashboardActiveFilter === 'rent' ? 'var(--warning)' : 'var(--danger)';
    const displaySpendingValue = dashboardActiveFilter === 'all' ? mySpendingTotal :
                                  dashboardActiveFilter === 'mine' ? myTotalExpense :
                                  dashboardActiveFilter === 'kitchen' ? groceriesTotal : rentTotal;

    document.getElementById('dashboardSummaryRow').innerHTML = `
        <div class="glass-card summary-tappable card-watermark" data-detail="spending" data-card-mark="₹" title="Tap for breakdown">
            <i class="fas fa-${spendingIcon}" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.12; color: ${spendingColor};"></i>
            <div class="summary-label">${spendingLabel}</div>
            <div class="summary-value" style="color:${spendingColor};">${formatCurrencySmart(displaySpendingValue)}</div>
            <div class="summary-sub" style="font-size:0.55rem;color:var(--text-tertiary);margin-top:2px;">${spendingSub}</div>
        </div>
        <div class="glass-card summary-tappable card-watermark" data-detail="daily" data-card-mark="Ø" title="Tap for breakdown">
            <i class="fas fa-calendar-day" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.10; color: var(--accent);"></i>
            <div class="summary-label">Daily Avg</div>
            <div class="summary-value" style="color:var(--text-primary);">${formatCurrencySmart(dailyAvg)}</div>
            <div class="summary-sub" style="font-size:0.55rem;color:var(--text-tertiary);margin-top:2px;">${currentDayOfMonth} of ${daysInMonth} days</div>
        </div>
        <div class="glass-card summary-tappable card-watermark" data-detail="projected" data-card-mark="~" title="Tap for breakdown">
            <i class="fas fa-chart-line" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.11; color: var(--warning);"></i>
            <div class="summary-label">Projected</div>
            <div class="summary-value" style="color:var(--text-primary); display:flex; justify-content:center; align-items:center; gap:2px;">
                ${formatCurrencySmart(projectedSpend)}
                ${projectionIcon}
            </div>
            <div class="summary-sub" style="font-size:0.55rem;color:var(--text-tertiary);margin-top:2px;">End of month</div>
        </div>
    `;

    // Attach tap handlers for detail popup
    attachSummaryTapHandlers(myTotalExpense, groceriesTotal, rentTotal, dailyAvg, projectedSpend, currentDayOfMonth, daysInMonth, totalBudget);

    // Adapt quick stats labels based on active filter
    const statsMiddleLabel = dashboardActiveFilter === 'kitchen' ? 'Kitchen' : 'Groceries';
    const statsRightLabel = dashboardActiveFilter === 'rent' ? 'Rent' : 'Rent';
    document.getElementById('dashboardQuickStats').innerHTML = `
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(142,142,147,0.15);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-receipt"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);">${txCount}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Transactions</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(52,199,89,0.15);color:var(--success);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-shopping-basket"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--success);">${formatCurrency(groceriesTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${statsMiddleLabel}</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,149,0,0.15);color:var(--warning);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-home"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--warning);">${formatCurrency(rentTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${statsRightLabel}</div>
        </div>
    `;

    // Recent transactions - use displayTxs for filtered view, allTxs for 'all'
    const recentSource = dashboardActiveFilter === 'all' ? allTxs : displayTxs;
    const recent = recentSource.filter(t => ['expense', 'groceries'].includes(t.type)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    document.getElementById('recentTxList').innerHTML = recent.map(t => {
        const isMine = (t.userId === currentUserId) || (!t.userId && t.payer === userName);
        const badge = t.type === 'groceries' || t.category === 'Groceries' 
            ? '<span class="shared-badge">🍳 shared</span>' 
            : (isMine ? '' : `<span class="user-badge">${escapeHTML(t.payer || 'other')}</span>`);
        return `
        <div class="recent-tx-item" data-tx-id="${t.id}" style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--divider);cursor:pointer;transition:background 0.15s;" title="Tap to view details">
            <div style="flex:1;min-width:0;overflow-wrap:break-word;word-break:break-word;padding-right:8px;"><strong>${escapeHTML(t.subcategory || t.category || 'N/A')}</strong> ${badge}<br><small style="color:var(--text-secondary);">${t.subcategory ? escapeHTML(t.category) + ' · ' : ''}${t.date} · ${t.type} ${t.payer ? '· ' + escapeHTML(t.payer) : ''}</small></div>
            <div style="font-weight:600;color:var(--danger);white-space:nowrap;flex-shrink:0;text-align:right;">-${formatCurrency(t.amount)}</div>
        </div>
    `}).join('') || '<p style="color:var(--text-tertiary);text-align:center;">No transactions yet</p>';

    // Attach click handlers to navigate to transaction detail
    document.querySelectorAll('.recent-tx-item').forEach(item => {
        item.addEventListener('click', function() {
            const txId = this.dataset.txId;
            if (txId) navigateToTransaction(txId);
        });
    });

    // Pass filtered transactions to sub-functions for consistent dashboard
    refreshBudgetOverview(dashboardActiveFilter === 'all' ? allTxs : displayTxs);
    refreshLandingSummary(allTxs);  // Landing always shows all
    renderDashboardCharts(dashboardActiveFilter === 'all' ? allTxs : displayTxs);
}

// NEW: Update the user context bar on dashboard
function updateDashboardUserContext(userName) {
    const contextUser = document.getElementById('dashboardContextUser');
    const contextGroup = document.getElementById('dashboardContextGroup');
    const contextBadge = document.getElementById('dashboardContextBadge');
    
    if (contextUser) contextUser.textContent = userName || 'Me';
    if (contextGroup) {
        const memberCount = getUserGroupMembers().length;
        contextGroup.textContent = memberCount > 1 ? `${memberCount} household members` : 'Personal';
    }
    if (contextBadge) {
        const roleLabel = state.userRole === 'admin' ? 'Admin' : 'Member';
        contextBadge.textContent = roleLabel;
    }
}

// NEW: Handle dashboard filter chip clicks
function bindDashboardChipEvents() {
    document.querySelectorAll('#dashboardFilterChips .chip-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#dashboardFilterChips .chip-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            dashboardActiveFilter = this.dataset.filter;
            refreshDashboard();
        });
    });
}

// NEW: Attach tap handlers to summary cards for detail popup (using event delegation - no clone flicker)
let _summaryHandlersBound = false;
function attachSummaryTapHandlers(myExp, groceryExp, rentExp, dailyAvg, projected, dayOfMonth, daysInMonth, budget) {
    const popup = document.getElementById('summaryDetailPopup');
    const overlay = document.getElementById('summaryDetailOverlay');
    if (!popup || !overlay) return;

    const handlers = {
        spending: () => {
            popup.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <i class="fas fa-wallet" style="font-size:2rem;color:var(--danger);margin-bottom:8px;display:block;"></i>
                    <h3 style="margin:0;color:var(--danger);">${formatCurrency(myExp + groceryExp)}</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">Total Spending</p>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">My Expenses</div>
                        <div style="font-weight:700;color:var(--danger);">${formatCurrency(myExp)}</div>
                    </div>
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Kitchen 🍳</div>
                        <div style="font-weight:700;color:var(--success);">${formatCurrency(groceryExp)}</div>
                    </div>
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Rent</div>
                        <div style="font-weight:700;color:var(--warning);">${formatCurrency(rentExp)}</div>
                    </div>
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Grand Total</div>
                        <div style="font-weight:700;color:var(--text-primary);">${formatCurrency(myExp + groceryExp + rentExp)}</div>
                    </div>
                </div>
            `;
        },
        daily: () => {
            const pctOfMonth = daysInMonth > 0 ? Math.round((dayOfMonth / daysInMonth) * 100) : 0;
            popup.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <i class="fas fa-calendar-day" style="font-size:2rem;color:var(--accent);margin-bottom:8px;display:block;"></i>
                    <h3 style="margin:0;">${formatCurrency(dailyAvg)}</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">Daily Average</p>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Days Elapsed</div>
                        <div style="font-weight:700;">${dayOfMonth} / ${daysInMonth}</div>
                        <div style="font-size:0.6rem;color:var(--text-tertiary);">${pctOfMonth}% of month</div>
                    </div>
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Projected</div>
                        <div style="font-weight:700;color:var(--warning);">${formatCurrency(projected)}</div>
                    </div>
                </div>
                <div style="margin-top:8px;font-size:0.7rem;color:var(--text-tertiary);text-align:center;">
                    ${budget > 0 ? `Budget: ${formatCurrency(budget)} · ${projected > budget ? '⚠️ Over' : '✅ Under'}` : 'No budget set'}
                </div>
            `;
        },
        projected: () => {
            const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
            const remainingBudget = Math.max(0, budget - (myExp + groceryExp + rentExp));
            popup.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <i class="fas fa-chart-line" style="font-size:2rem;color:var(--warning);margin-bottom:8px;display:block;"></i>
                    <h3 style="margin:0;">${formatCurrency(projected)}</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">Projected by Month End</p>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Remaining Days</div>
                        <div style="font-weight:700;">${remainingDays}</div>
                    </div>
                    <div class="glass-card" style="text-align:center;padding:10px;">
                        <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Daily Budget</div>
                        <div style="font-weight:700;${budget > 0 && (budget/daysInMonth) < dailyAvg ? 'color:var(--danger);' : ''}">${budget > 0 ? formatCurrency(budget / daysInMonth) : '—'}</div>
                    </div>
                </div>
                ${budget > 0 ? `
                <div style="margin-top:8px;font-size:0.7rem;text-align:center;">
                    <span style="color:${remainingBudget >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        ${remainingBudget >= 0 ? '✅ ' + formatCurrency(remainingBudget) + ' remaining' : '⚠️ ' + formatCurrency(Math.abs(remainingBudget)) + ' over budget'}
                    </span>
                </div>` : ''}
            `;
        }
    };

    // Use event delegation on the summary row instead of cloning cards (prevents flicker)
    const summaryRow = document.getElementById('dashboardSummaryRow');
    if (summaryRow && !_summaryHandlersBound) {
        _summaryHandlersBound = true;
        summaryRow.addEventListener('click', function(e) {
            const card = e.target.closest('.summary-tappable');
            if (!card) return;
            e.stopPropagation();
            const detail = card.dataset.detail;
            if (handlers[detail]) handlers[detail]();
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    }

    // Close popup on overlay click or close button
    overlay.onclick = function(e) {
        if (e.target === overlay || e.target.closest('#summaryDetailClose')) {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    };
}

// NEW: Landing summary widget for all users
function refreshLandingSummary(txs) {
    const card = document.getElementById('dashboardLandingCard');
    const container = document.getElementById('dashboardLandingSummary');
    if (!card || !container) return;
    
    // Remove admin-only restriction - all users can track lending
    const landingTxs = txs.filter(t => t.category === 'Landing');
    // USER-SPECIFIC: Only show landing for the current user, not all users
    const currentUserId = getCurrentUserId();
    const myLandingTxs = landingTxs.filter(t => t.userId === currentUserId || (!t.userId && t.payer === (state.currentUser?.name || '')));
    const active = myLandingTxs.filter(t => !t.landingStatus || t.landingStatus === 'active');
    const returned = myLandingTxs.filter(t => t.landingStatus === 'returned');
    const writtenOff = myLandingTxs.filter(t => t.landingStatus === 'writeoff');
    
    // Always show the card for admin, even when empty
    card.style.display = 'block';
    container.parentElement.style.display = 'block';
    
    if (myLandingTxs.length === 0) {
        container.innerHTML = `
            <h3 class="card-title"><i class="fas fa-hand-holding-usd"></i> Landing (Money Lent)</h3>
            <p style="color:var(--text-tertiary);text-align:center;padding:12px;">No lending recorded yet. Add a transaction with category "Landing".</p>
        `;
        return;
    }
    
    const totalActive = active.reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalReturned = returned.reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalWrittenOff = writtenOff.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    // Current month for returned/written off
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const returnedThisMonth = returned.filter(t => t.date && t.date.startsWith(thisMonth));
    const writtenOffThisMonth = writtenOff.filter(t => t.date && t.date.startsWith(thisMonth));
    const totalReturnedThisMonth = returnedThisMonth.reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalWrittenOffThisMonth = writtenOffThisMonth.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    container.innerHTML = `
        <h3 class="card-title"><i class="fas fa-hand-holding-usd"></i> Landing (Money Lent)</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="glass-card landing-stat-card" data-landing-filter="active" style="text-align:center;padding:10px 6px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" title="Tap to view all active landing">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Active</div>
                <div style="font-weight:700;color:var(--warning);">${formatCurrency(totalActive)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${active.length} pending</div>
            </div>
            <div class="glass-card landing-stat-card" data-landing-filter="returned" style="text-align:center;padding:10px 6px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" title="Tap to view returned this month">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Returned</div>
                <div style="font-weight:700;color:var(--success);">${formatCurrency(totalReturnedThisMonth)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${returnedThisMonth.length} this month${returned.length > returnedThisMonth.length ? ` · ${returned.length} total` : ''}</div>
            </div>
            <div class="glass-card landing-stat-card" data-landing-filter="writeoff" style="text-align:center;padding:10px 6px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" title="Tap to view written off this month">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Written Off</div>
                <div style="font-weight:700;color:var(--danger);">${formatCurrency(totalWrittenOffThisMonth)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${writtenOffThisMonth.length} this month${writtenOff.length > writtenOffThisMonth.length ? ` · ${writtenOff.length} total` : ''}</div>
            </div>
        </div>
        ${active.length > 0 ? `<div style="max-height:200px;overflow-y:auto;">${active.slice(0, 10).map(t => `
            <div class="landing-item-row" data-tx-id="${t.id}" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.8rem;cursor:pointer;transition:background 0.15s;" title="Tap to view details">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;color:var(--text-primary);">${escapeHTML(t.borrower || 'Unknown')}</div>
                    <div style="font-size:0.65rem;color:var(--text-tertiary);">${t.date}</div>
                </div>
                <div style="font-weight:700;color:var(--warning);">${formatCurrency(t.amount)}</div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn btn-xs btn-success landing-action-btn" data-id="${t.id}" data-status="returned" title="Mark as returned" style="padding:3px 8px;font-size:0.65rem;border-radius:6px;background:var(--success);color:#fff;border:none;cursor:pointer;white-space:nowrap;"><i class="fas fa-check"></i> Paid</button>
                    <button class="btn btn-xs btn-danger landing-action-btn" data-id="${t.id}" data-status="writeoff" title="Mark as written off" style="padding:3px 8px;font-size:0.65rem;border-radius:6px;background:var(--danger);color:#fff;border:none;cursor:pointer;white-space:nowrap;"><i class="fas fa-times"></i> Write Off</button>
                </div>
            </div>
        `).join('')}</div>` : ''}
    `;

    // Attach click handlers: landing stat cards → filter transactions by status
    document.querySelectorAll('.landing-stat-card').forEach(card => {
        card.addEventListener('click', function(e) {
            e.stopPropagation();
            const status = this.dataset.landingFilter;
            navigateToLandingFilter(status);
        });
    });

    // Attach click handlers: landing item row → navigate to transaction detail
    document.querySelectorAll('.landing-item-row').forEach(row => {
        row.addEventListener('click', function(e) {
            // Don't navigate if clicking action buttons
            if (e.target.closest('.landing-action-btn')) return;
            const txId = this.dataset.txId;
            if (txId && typeof navigateToTransaction === 'function') {
                navigateToTransaction(txId);
            }
        });
    });

    // Attach event listeners to the new action buttons
    document.querySelectorAll('.landing-action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = this.dataset.id;
            const status = this.dataset.status;
            updateLandingStatus(id, status);
        });
    });
}

// Quick action: update landing transaction status from dashboard
function updateLandingStatus(id, newStatus) {
    const tx = getVisibleTransactions().find(t => t.id === id);
    if (!tx) return;

    const statusLabel = newStatus === 'returned' ? 'Returned' : 'Written Off';
    const confirmMsg = `Mark "${tx.borrower || 'Unknown'}" (${formatCurrency(tx.amount)}) as ${statusLabel}?`;

    showConfirm('Update Landing Status', confirmMsg, 'hand-holding-usd', () => {
        updateTransaction(id, { landingStatus: newStatus });
    });
}

// NEW: Navigate to transactions filtered by landing status
function navigateToLandingFilter(status) {
    navigateTo('screenTransactions');
    
    setTimeout(() => {
        // Show the landing status filter dropdown
        const landingFilter = document.getElementById('filterLandingStatus');
        if (landingFilter) {
            landingFilter.style.display = 'block';
            landingFilter.value = status;
        }
        
        // Pre-set category to Landing for active/returned/written off
        const filterCat = document.getElementById('filterCategory');
        if (filterCat) filterCat.value = 'Landing';
        
        // For returned/written off, also set subcategory to Landing
        const filterSub = document.getElementById('filterSubcategory');
        if (filterSub && status !== 'active') {
            // Try to set subcategory
            const options = Array.from(filterSub.options);
            const landingOpt = options.find(o => o.value === 'Landing');
            if (landingOpt) filterSub.value = 'Landing';
        }
        
        if (typeof refreshTransactionList === 'function') refreshTransactionList();
        
        const statusLabel = status === 'active' ? 'Active Landing' : status === 'returned' ? 'Returned Landing' : 'Written Off';
        showToast(`Filtered: ${statusLabel}`, 'hand-holding-usd');
    }, 200);
}

// NEW: Reset landing filter when clearing all filters
function resetLandingFilter() {
    const landingFilter = document.getElementById('filterLandingStatus');
    if (landingFilter) {
        landingFilter.value = 'all';
        landingFilter.style.display = 'none';
    }
}

function refreshBudgetOverview(txs = null) {
    const container = document.getElementById('budgetOverviewList');
    if (!container) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentUserId = getCurrentUserId();
    const transactions = txs || getVisibleTransactions();
    
    // Collect all budget entries across all three tiers
    const allBudgetItems = []; // { label, scope, cat, limit, spent, type }
    
    // --- Tier 1: Shared Groceries Budget (__shared__) ---
    const sharedBudgets = state.budgets?.['__shared__'] || {};
    Object.entries(sharedBudgets).forEach(([cat, limit]) => {
        const spent = transactions
            .filter(t => t.date.startsWith(thisMonth) && 
                (t.type === 'groceries' || (t.type === 'expense' && t.category === 'Groceries')))
            .reduce((s, t) => s + parseFloat(t.amount), 0);
        allBudgetItems.push({
            label: '🍳 ' + cat,
            scope: '__shared__',
            cat,
            limit: parseFloat(limit),
            spent,
            type: 'shared'
        });
    });
    
    // --- Tier 2: Per-House Rent Budgets (__house_<id>) — ONLY user's linked houses ---
    const userHouseIds = getCurrentUserHouseIds();
    if (state.budgets) {
        Object.keys(state.budgets).forEach(key => {
            if (!key.startsWith('__house_')) return;
            const houseId = key.replace('__house_', '');
            // ONLY show rent budget if this user is linked to this house (applies to ALL users including admin)
            if (!userHouseIds.includes(houseId)) return;
            const house = (state.houses || []).find(h => h.id === houseId);
            const houseBudgets = state.budgets[key] || {};
            Object.entries(houseBudgets).forEach(([cat, limit]) => {
                const spent = transactions
                    .filter(t => t.date.startsWith(thisMonth) && 
                        (t.category === 'House Rent' || t.type === 'rent') &&
                        t.houseId === houseId)
                    .reduce((s, t) => s + parseFloat(t.amount), 0);
                allBudgetItems.push({
                    label: '🏠 ' + (house ? `H${house.houseNo} ${cat}` : cat),
                    scope: key,
                    cat,
                    limit: parseFloat(limit),
                    spent,
                    type: 'house'
                });
            });
        });
    }
    
    // --- Tier 3: Per-User Budgets — ONLY current user's own personal budgets ---
    const userBudgets = state.budgets?.[currentUserId] || {};
    Object.entries(userBudgets).forEach(([cat, limit]) => {
        const spent = transactions
            .filter(t => t.date.startsWith(thisMonth) && 
                (t.category || '').toLowerCase() === cat.toLowerCase() && 
                ['expense', 'groceries'].includes(t.type) &&
                t.category !== 'Groceries' && t.category !== 'House Rent' &&
                (t.userId === currentUserId || (!t.userId && t.payer === (state.currentUser?.name || ''))))
            .reduce((s, t) => s + parseFloat(t.amount), 0);
        allBudgetItems.push({
            label: '👤 ' + cat,
            scope: currentUserId,
            cat,
            limit: parseFloat(limit),
            spent,
            type: 'user'
        });
    });
    
    // REMOVED: Other users' personal budgets are PRIVATE — not shown on dashboard
    
    if (allBudgetItems.length === 0) {
        container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;">No budgets set. Go to Settings to add limits for shared groceries, your house rent, or your personal spending.</p>';
        return;
    }
    
    // Render all budget items
    container.innerHTML = allBudgetItems.map(item => {
        const safeLimit = item.limit > 0 ? item.limit : 1;
        const pct = Math.min(100, Math.max(0, Math.round((item.spent / safeLimit) * 100))) || 0;
        let gradientColors;
        if (pct > 100) {
            gradientColors = 'linear-gradient(90deg, #ff3b30, #ff6b6b)';
        } else if (pct > 90) {
            gradientColors = 'linear-gradient(90deg, #ff9500, #ffcc00)';
        } else if (pct > 70) {
            gradientColors = 'linear-gradient(90deg, #fdcb6e, #ffeaa7)';
        } else if (pct > 50) {
            gradientColors = 'linear-gradient(90deg, #34c759, #5ac8fa)';
        } else {
            gradientColors = 'linear-gradient(90deg, #5ac8fa, #a29bfe)';
        }
        const overBudget = item.spent > item.limit;
        const typeTag = item.type === 'shared' ? '<span style="font-size:0.5rem;background:rgba(52,199,89,0.2);color:var(--success);padding:1px 4px;border-radius:3px;">shared</span>' :
                        item.type === 'house' ? '<span style="font-size:0.5rem;background:rgba(255,149,0,0.2);color:var(--warning);padding:1px 4px;border-radius:3px;">house</span>' : '';
        
        return `<div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:3px;">
                <span>${item.label} ${typeTag}</span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span style="color:${overBudget ? 'var(--danger)' : 'var(--text-primary)'};font-weight:600;">
                        ${formatCurrency(item.spent)}
                    </span>
                    <span style="color:var(--text-tertiary);">/ ${formatCurrency(item.limit)}</span>
                    ${overBudget ? '<span style="font-size:0.65rem;color:var(--danger);background:rgba(255,59,48,0.15);padding:1px 6px;border-radius:8px;">OVER</span>' : ''}
                </span>
            </div>
            <div class="budget-progress-bar" style="height:8px;border-radius:4px;">
                <div class="budget-progress-fill" style="width:${Math.min(pct, 100)}%;background:${gradientColors};border-radius:4px;transition:width 0.5s ease;"></div>
            </div>
            <div style="font-size:0.6rem;color:var(--text-tertiary);text-align:right;margin-top:2px;">${pct}% used</div>
        </div>`;
    }).join('');
}

// NEW: Get display name for a user ID
function getUserDisplayName(uid) {
    if (!uid) return 'Unknown';
    if (state.userGroup?.members) {
        const member = state.userGroup.members.find(m => m.uid === uid || m.email === uid || m.displayName.toLowerCase() === uid.toLowerCase());
        if (member) return member.displayName;
    }
    if (state.currentUser?.uid === uid) return state.currentUser.name || 'Me';
    if (state.userProfile && (state.userProfile.email === uid || state.currentUser?.email === uid)) return state.userProfile.displayName || 'Me';
    // Check payers
    const payer = (state.payers || []).find(p => p.toLowerCase() === uid.toLowerCase());
    if (payer) return payer;
    return uid.substring(0, 15) + '...';
}

async function renderDashboardCharts(transactions = null) {
    // Guard: Skip if chart canvas isn't in the DOM (screen not visible)
    if (!document.getElementById('dashPieChart')) return;
    
    const isLoaded = await loadChartJs();
    if (!isLoaded || typeof Chart === 'undefined') {
        console.warn('Chart.js failed to load – dashboard charts disabled.');
        return;
    }

    const txs = transactions || getVisibleTransactions();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // --- Expenses Doughnut Chart (with click to filter) ---
    const monthTxs = txs.filter(t => t.date.startsWith(thisMonth) && ['expense', 'groceries'].includes(t.type));
    const catMap = {};
    monthTxs.forEach(t => {
        const c = t.category || 'Other';
        catMap[c] = (catMap[c] || 0) + parseFloat(t.amount);
    });
    const catLabels = Object.keys(catMap);
    const catData = Object.values(catMap);
    const catColors = catLabels.map(c => getCategoryColor(c, 'expense'));

    const ctx1 = document.getElementById('dashPieChart')?.getContext('2d');
    if (ctx1) {
        if (dashPieChartInstance) dashPieChartInstance.destroy();
        const style = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const textPrimary = style.getPropertyValue('--text-primary').trim() || (isDark ? '#f5f5f7' : '#1c1c1e');
        const textSecondary = style.getPropertyValue('--text-secondary').trim() || (isDark ? '#aeaeb2' : '#636366');
        const isMobile = window.innerWidth <= 480;
        
        // Truncate long labels for mobile legend
        const displayLabels = isMobile 
            ? catLabels.map(l => l.length > 12 ? l.substring(0, 11) + '…' : l)
            : catLabels;
        
        // Soften colors for light theme by blending with white
        const softenedColors = catColors.map(c => {
            if (isDark) return c;
            // Light theme: blend with white at 15% to soften
            const r = parseInt(c.slice(1,3), 16);
            const g = parseInt(c.slice(3,5), 16);
            const b = parseInt(c.slice(5,7), 16);
            const blend = (v) => Math.round(v + (255 - v) * 0.12);
            return '#' + [blend(r), blend(g), blend(b)].map(v => v.toString(16).padStart(2,'0')).join('');
        });
        
        dashPieChartInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: displayLabels,
                datasets: [{
                    data: catData,
                    backgroundColor: softenedColors,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
                    borderWidth: isDark ? 3 : 4,
                    hoverBorderWidth: isDark ? 4 : 5,
                    hoverBorderColor: softenedColors.map(c => c),
                    borderRadius: isDark ? 4 : 6,
                    spacing: isDark ? 2 : 3
                }]
            },
            options: {
                animation: { 
                    duration: 600, 
                    easing: 'easeOutQuart',
                    animateRotate: true,
                    animateScale: true
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: isMobile ? 'right' : 'bottom',
                        align: 'center',
                        labels: {
                            color: textSecondary,
                            font: { 
                                size: isMobile ? 10 : 11, 
                                family: 'system-ui, -apple-system, sans-serif',
                                weight: '500'
                            },
                            padding: isMobile ? 8 : 14,
                            usePointStyle: true,
                            pointStyleWidth: isMobile ? 7 : 9,
                            pointStyleHeight: isMobile ? 7 : 9,
                            boxWidth: isMobile ? 8 : 12
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(44,44,46,0.96)' : 'rgba(255,255,255,0.96)',
                        titleColor: isDark ? '#f5f5f7' : '#1c1c1e',
                        bodyColor: isDark ? '#aeaeb2' : '#3a3a3c',
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        displayColors: true,
                        boxPadding: 4,
                        titleFont: { weight: '600', size: 13 },
                        bodyFont: { size: 12 },
                        callbacks: {
                            title: function(items) {
                                const idx = items[0].dataIndex;
                                return catLabels[idx] || '';
                            },
                            label: function(context) {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                                return ` ${formatCurrency(value)}  (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: isMobile ? '55%' : '62%',
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = chart.data.labels[index];
                        const filterCatEl = document.getElementById('filterCategory');
                        if (filterCatEl) {
                            filterCatEl.value = label;
                            navigateTo('screenTransactions');
                        }
                    }
                }
            }
        });
    }

}