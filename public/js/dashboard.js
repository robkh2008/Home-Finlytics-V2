// ==================== js/dashboard.js ====================
let dashPieChartInstance, dashTrendChartInstance;
let dashboardTrendPeriod = 6; // default 6 months

function refreshDashboard() {
    const txs = getVisibleTransactions();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTxs = txs.filter(t => t.date.startsWith(thisMonth));

    const expenseTxs = monthTxs.filter(t => ['expense', 'groceries'].includes(t.type));
    const totalExpense = expenseTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    const groceriesTotal = expenseTxs.filter(t => t.type === 'groceries' || t.category === 'Groceries').reduce((s, t) => s + parseFloat(t.amount), 0);
    const rentTotal = expenseTxs.filter(t => t.type === 'expense' && t.category === 'House Rent').reduce((s, t) => s + parseFloat(t.amount), 0);
    
    const txCount = expenseTxs.length;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAvg = txCount > 0 ? totalExpense / daysInMonth : 0;

    document.getElementById('dashboardSummaryRow').innerHTML = `
        <div class="glass-card" style="text-align:center;">
            <div style="font-size:var(--font-size-xxl);font-weight:700;color:var(--danger);">${formatCurrency(totalExpense)}</div>
            <div style="font-size:var(--font-size-sm);color:var(--text-secondary);">Total Expenses</div>
        </div>
        <div class="glass-card" style="text-align:center;">
            <div style="font-size:var(--font-size-xxl);font-weight:700;color:var(--text-primary);">${formatCurrency(dailyAvg)}</div>
            <div style="font-size:var(--font-size-sm);color:var(--text-secondary);">Daily Average</div>
        </div>
    `;

    document.getElementById('dashboardQuickStats').innerHTML = `
        <div class="glass-card" style="text-align:center;padding:10px;">
            <div style="font-weight:700;font-size:var(--font-size-lg);">${txCount}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);">Transactions</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:10px;">
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--success);">${formatCurrency(groceriesTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);">Groceries</div>
        </div>
        <div class="glass-card" style="text-align:center;padding:10px;">
            <div style="font-weight:700;font-size:var(--font-size-lg);color:var(--warning);">${formatCurrency(rentTotal)}</div>
            <div style="font-size:0.65rem;color:var(--text-secondary);">Rent</div>
        </div>
    `;

    const recent = txs.filter(t => ['expense', 'groceries'].includes(t.type)).slice(0, 5);
    document.getElementById('recentTxList').innerHTML = recent.map(t => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--divider);">
            <div><strong>${t.category || 'N/A'}</strong><br><small style="color:var(--text-secondary);">${t.date} · ${t.type} ${t.payer ? '· ' + t.payer : ''}</small></div>
            <div style="font-weight:600;color:var(--danger);">-${formatCurrency(t.amount)}</div>
        </div>
    `).join('') || '<p style="color:var(--text-tertiary);text-align:center;">No transactions yet</p>';

    refreshBudgetOverview();
    renderDashboardCharts();
    setupTrendPeriodSelector();
}

// NEW: Period selector setup
function setupTrendPeriodSelector() {
    const trendCard = document.querySelector('#dashTrendChart')?.closest('.card');
    if (!trendCard) return;

    // Update title dynamically
    const titleEl = trendCard.querySelector('.card-title');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-chart-line"></i> ${dashboardTrendPeriod}-Month Trend`;
    }

    // Create selector if not present
    let selector = trendCard.querySelector('.trend-period-selector');
    if (!selector) {
        selector = document.createElement('div');
        selector.className = 'trend-period-selector';
        selector.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
        trendCard.insertBefore(selector, trendCard.querySelector('.chart-wrap'));
        
        const periods = [3, 6, 12];
        periods.forEach(p => {
            const btn = document.createElement('button');
            btn.className = `btn btn-xs btn-secondary period-btn-trend${dashboardTrendPeriod === p ? ' active' : ''}`;
            btn.textContent = `${p}M`;
            btn.dataset.period = p;
            btn.addEventListener('click', (e) => {
                dashboardTrendPeriod = parseInt(e.target.dataset.period, 10);
                renderDashboardCharts();
                setupTrendPeriodSelector(); // refresh active state
            });
            selector.appendChild(btn);
        });
    } else {
        // Update active state
        selector.querySelectorAll('.period-btn-trend').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.period, 10) === dashboardTrendPeriod);
        });
    }
}

function refreshBudgetOverview() {
    const container = document.getElementById('budgetOverviewList');
    if (!container) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entries = Object.entries(state.budgets);
    if (entries.length === 0) {
        container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;">No budgets set. Go to Settings to add limits.</p>';
        return;
    }
    container.innerHTML = entries.map(([cat, limit]) => {
        const spent = getVisibleTransactions().filter(t => t.date.startsWith(thisMonth) && (t.category || '').toLowerCase() === cat.toLowerCase() && ['expense', 'groceries'].includes(t.type)).reduce((s, t) => s + parseFloat(t.amount), 0);
        const pct = Math.min(100, Math.round((spent / limit) * 100));
        let cls = 'safe';
        if (pct > 90) cls = 'danger';
        else if (pct > 70) cls = 'warning';
        return `<div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);">
                <span>${cat}</span>
                <span>${formatCurrency(spent)} / ${formatCurrency(limit)}</span>
            </div>
            <div class="budget-progress-bar">
                <div class="budget-progress-fill ${cls}" style="width:${pct}%;"></div>
            </div>
        </div>`;
    }).join('');
}

function renderDashboardCharts() {
    const txs = getVisibleTransactions();
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
        dashPieChartInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catData,
                    backgroundColor: catColors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                            font: { size: 11 }
                        }
                    }
                },
                cutout: '65%',
                // ENHANCEMENT: Click on a category to filter transactions
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = chart.data.labels[index];
                        // Set the filter and navigate to transactions
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

    // --- Trend Chart (dynamic period) ---
    const months = [];
    const period = dashboardTrendPeriod;
    for (let i = period - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const expData = months.map(m => txs.filter(t => t.date.startsWith(m) && ['expense', 'groceries'].includes(t.type)).reduce((s, t) => s + parseFloat(t.amount), 0));

    const ctx2 = document.getElementById('dashTrendChart')?.getContext('2d');
    if (ctx2) {
        if (dashTrendChartInstance) dashTrendChartInstance.destroy();
        dashTrendChartInstance = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: months.map(m => {
                    const [y, mo] = m.split('-');
                    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo)]} ${y.slice(2)}`;
                }),
                datasets: [
                    {
                        label: 'Expenses',
                        data: expData,
                        borderColor: '#ff3b30',
                        backgroundColor: 'rgba(255,59,48,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                            font: { size: 11 }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary'),
                            font: { size: 10 }
                        },
                        grid: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid')
                        }
                    },
                    y: {
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary'),
                            font: { size: 10 },
                            callback: v => formatCurrency(v)
                        },
                        grid: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid')
                        }
                    }
                }
            }
        });
    }
}