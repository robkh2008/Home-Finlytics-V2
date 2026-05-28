// ==================== js/dashboard.js ====================
let dashPieChartInstance;

function refreshDashboard() {
    const txs = getVisibleTransactions();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTxs = txs.filter(t => t.date.startsWith(thisMonth));

    const expenseTxs = monthTxs.filter(t => ['expense', 'groceries'].includes(t.type));
    const totalExpense = expenseTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    const groceriesTotal = expenseTxs.filter(t => t.type === 'groceries' || t.category === 'Groceries').reduce((s, t) => s + parseFloat(t.amount), 0);
    const rentTotal = expenseTxs.filter(t => (t.type === 'expense' && t.category === 'House Rent') || t.type === 'rent').reduce((s, t) => s + parseFloat(t.amount), 0);
    
    const txCount = expenseTxs.length;
    const currentDayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAvg = txCount > 0 ? totalExpense / currentDayOfMonth : 0;
    const projectedSpend = dailyAvg * daysInMonth;
    
    const totalBudget = Object.values(state.budgets || {}).reduce((sum, limit) => sum + parseFloat(limit), 0);
    let projectionIcon = '';
    if (totalBudget > 0) {
        if (projectedSpend > totalBudget) {
            projectionIcon = `<i class="fas fa-arrow-up" style="color:var(--danger); margin-left:6px; font-size:0.75em;" title="Projected over budget (${formatCurrency(totalBudget)})"></i>`;
        } else {
            projectionIcon = `<i class="fas fa-arrow-down" style="color:var(--success); margin-left:6px; font-size:0.75em;" title="Projected under budget (${formatCurrency(totalBudget)})"></i>`;
        }
    }

    document.getElementById('dashboardSummaryRow').innerHTML = `
        <div class="glass-card">
            <i class="fas fa-wallet" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.12; color: var(--danger);"></i>
            <div class="summary-label">Expenses</div>
            <div class="summary-value" style="color:var(--danger);">${formatCurrency(totalExpense)}</div>
        </div>
        <div class="glass-card">
            <i class="fas fa-calendar-day" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.10; color: var(--accent);"></i>
            <div class="summary-label">Daily Avg</div>
            <div class="summary-value" style="color:var(--text-primary);">${formatCurrency(dailyAvg)}</div>
        </div>
        <div class="glass-card">
            <i class="fas fa-chart-line" style="position: absolute; top: -8px; right: -12px; font-size: 4.5rem; opacity: 0.11; color: var(--warning);"></i>
            <div class="summary-label">Projected</div>
            <div class="summary-value" style="color:var(--text-primary); display:flex; justify-content:center; align-items:center; gap:2px;">
                ${formatCurrency(projectedSpend)}
                ${projectionIcon}
            </div>
        </div>
    `;

    document.getElementById('dashboardQuickStats').innerHTML = `
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(142,142,147,0.15);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-receipt"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);">${txCount}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Transactions</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(52,199,89,0.15);color:var(--success);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-shopping-basket"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--success);">${formatCurrency(groceriesTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Groceries</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:12px 8px;display:flex;flex-direction:column;align-items:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,149,0,0.15);color:var(--warning);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:8px;"><i class="fas fa-home"></i></div>
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--warning);">${formatCurrency(rentTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Rent</div>
        </div>
    `;

    const recent = txs.filter(t => ['expense', 'groceries'].includes(t.type)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    document.getElementById('recentTxList').innerHTML = recent.map(t => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--divider);">
            <div><strong>${escapeHTML(t.subcategory || t.category || 'N/A')}</strong><br><small style="color:var(--text-secondary);">${t.subcategory ? escapeHTML(t.category) + ' · ' : ''}${t.date} · ${t.type} ${t.payer ? '· ' + escapeHTML(t.payer) : ''}</small></div>
            <div style="font-weight:600;color:var(--danger);">-${formatCurrency(t.amount)}</div>
        </div>
    `).join('') || '<p style="color:var(--text-tertiary);text-align:center;">No transactions yet</p>';

    refreshBudgetOverview(txs);
    refreshLandingSummary(txs);
    renderDashboardCharts(txs);
}

// NEW: Landing summary widget for admin
function refreshLandingSummary(txs) {
    if (state.userRole !== 'admin') return;
    const card = document.getElementById('dashboardLandingCard');
    const container = document.getElementById('dashboardLandingSummary');
    if (!card || !container) return;
    
    const landingTxs = txs.filter(t => t.subcategory === 'Landing' || (t.category === 'Miscellaneous Expenses' && t.subcategory === 'Landing'));
    const active = landingTxs.filter(t => !t.landingStatus || t.landingStatus === 'active');
    const returned = landingTxs.filter(t => t.landingStatus === 'returned');
    const writtenOff = landingTxs.filter(t => t.landingStatus === 'writeoff');
    
    // Always show the card for admin, even when empty
    card.style.display = 'block';
    container.parentElement.style.display = 'block';
    
    if (landingTxs.length === 0) {
        container.innerHTML = `
            <h3 class="card-title"><i class="fas fa-hand-holding-usd"></i> Landing (Money Lent)</h3>
            <p style="color:var(--text-tertiary);text-align:center;padding:12px;">No lending recorded yet. Add a transaction with category "Miscellaneous Expenses" and subcategory "Landing".</p>
        `;
        return;
    }
    
    const totalActive = active.reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalReturned = returned.reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalWrittenOff = writtenOff.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    container.innerHTML = `
        <h3 class="card-title"><i class="fas fa-hand-holding-usd"></i> Landing (Money Lent)</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="glass-card" style="text-align:center;padding:10px 6px;">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Active</div>
                <div style="font-weight:700;color:var(--warning);">${formatCurrency(totalActive)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${active.length} pending</div>
            </div>
            <div class="glass-card" style="text-align:center;padding:10px 6px;">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Returned</div>
                <div style="font-weight:700;color:var(--success);">${formatCurrency(totalReturned)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${returned.length} cleared</div>
            </div>
            <div class="glass-card" style="text-align:center;padding:10px 6px;">
                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;">Written Off</div>
                <div style="font-weight:700;color:var(--danger);">${formatCurrency(totalWrittenOff)}</div>
                <div style="font-size:0.6rem;color:var(--text-tertiary);">${writtenOff.length} lost</div>
            </div>
        </div>
        ${active.length > 0 ? `<div style="max-height:200px;overflow-y:auto;">${active.slice(0, 10).map(t => `
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.8rem;">
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

function refreshBudgetOverview(txs = null) {
    const container = document.getElementById('budgetOverviewList');
    if (!container) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entries = Object.entries(state.budgets || {});
    const transactions = txs || getVisibleTransactions();
    if (entries.length === 0) {
        container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;">No budgets set. Go to Settings to add limits.</p>';
        return;
    }
    container.innerHTML = entries.map(([cat, limit]) => {
        const spent = transactions.filter(t => t.date.startsWith(thisMonth) && (t.category || '').toLowerCase() === cat.toLowerCase() && ['expense', 'groceries'].includes(t.type)).reduce((s, t) => s + parseFloat(t.amount), 0);
        const safeLimit = parseFloat(limit) > 0 ? parseFloat(limit) : 1;
        const pct = Math.min(100, Math.max(0, Math.round((spent / safeLimit) * 100))) || 0;
        // Multi-color stages for budget usage
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
        const overBudget = spent > safeLimit;
        return `<div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:3px;">
                <span>${escapeHTML(cat)}</span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span style="color:${overBudget ? 'var(--danger)' : 'var(--text-primary)'};font-weight:600;">
                        ${formatCurrency(spent)}
                    </span>
                    <span style="color:var(--text-tertiary);">/ ${formatCurrency(limit)}</span>
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
        const textPrimary = style.getPropertyValue('--text-primary').trim() || '#fff';
        const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#aaa';
        
        dashPieChartInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catData,
                    backgroundColor: catColors,
                    borderColor: style.getPropertyValue('--bg-glass').trim() || '#1c1c1e',
                    borderWidth: 3,
                    hoverBorderWidth: 4,
                    hoverBorderColor: catColors.map(c => c),
                    borderRadius: 4,
                    spacing: 2
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
                        position: 'bottom',
                        labels: {
                            color: textSecondary,
                            font: { size: 11, family: 'system-ui, -apple-system, sans-serif' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyleWidth: 8,
                            pointStyleHeight: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--bg-glass').trim() + 'ee',
                        titleColor: textPrimary,
                        bodyColor: textSecondary,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        displayColors: true,
                        boxPadding: 4
                    }
                },
                cutout: '60%',
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