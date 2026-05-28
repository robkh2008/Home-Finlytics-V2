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
        <div class="glass-card" style="text-align:center; padding: 16px 8px; position: relative; overflow: hidden;">
            <i class="fas fa-wallet" style="position: absolute; top: -10px; right: -15px; font-size: 5rem; opacity: 0.05; color: var(--text-primary);"></i>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Expenses</div>
            <div style="font-size:var(--font-size-xl);font-weight:700;color:var(--danger);">${formatCurrency(totalExpense)}</div>
        </div>
        <div class="glass-card" style="text-align:center; padding: 16px 8px; position: relative; overflow: hidden;">
            <i class="fas fa-calendar-day" style="position: absolute; top: -10px; right: -15px; font-size: 5rem; opacity: 0.05; color: var(--text-primary);"></i>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Daily Avg</div>
            <div style="font-size:var(--font-size-xl);font-weight:700;color:var(--text-primary);">${formatCurrency(dailyAvg)}</div>
        </div>
        <div class="glass-card" style="text-align:center; padding: 16px 8px; position: relative; overflow: hidden;">
            <i class="fas fa-chart-line" style="position: absolute; top: -10px; right: -15px; font-size: 5rem; opacity: 0.05; color: var(--text-primary);"></i>
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Projected</div>
            <div style="font-size:var(--font-size-xl);font-weight:700;color:var(--text-primary); display:flex; justify-content:center; align-items:center;">
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

    const recent = txs.filter(t => ['expense', 'groceries'].includes(t.type)).slice(0, 5);
    document.getElementById('recentTxList').innerHTML = recent.map(t => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--divider);">
            <div><strong>${escapeHTML(t.category || 'N/A')}</strong><br><small style="color:var(--text-secondary);">${t.date} · ${t.type} ${t.payer ? '· ' + escapeHTML(t.payer) : ''}</small></div>
            <div style="font-weight:600;color:var(--danger);">-${formatCurrency(t.amount)}</div>
        </div>
    `).join('') || '<p style="color:var(--text-tertiary);text-align:center;">No transactions yet</p>';

    refreshBudgetOverview(txs);
    renderDashboardCharts(txs);
    setupTrendPeriodSelector();
}

// NEW: Period selector setup
function setupTrendPeriodSelector() {
    const trendCard = document.querySelector('#dashTrendChart')?.closest('.card');
    if (!trendCard) return;

    // Update title dynamically
    const titleEl = trendCard.querySelector('.card-title');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-chart-bar"></i> ${dashboardTrendPeriod}-Month Trend`;
    }

    // Create selector if not present
    let selector = trendCard.querySelector('.trend-period-selector');
    if (!selector) {
        selector = document.createElement('div');
        selector.className = 'trend-period-selector';
        selector.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
        selector.setAttribute('role', 'group');
        selector.setAttribute('aria-label', 'Trend period selector');
        trendCard.insertBefore(selector, trendCard.querySelector('.chart-wrap'));
        
        const periods = [3, 6, 12];
        periods.forEach(p => {
            const isActive = dashboardTrendPeriod === p;
            const btn = document.createElement('button');
            btn.className = `btn btn-xs btn-secondary period-btn-trend${isActive ? ' active' : ''}`;
            btn.textContent = `${p}M`;
            btn.dataset.period = p;
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.setAttribute('aria-label', `${p} Months`);
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
            const isActive = parseInt(btn.dataset.period, 10) === dashboardTrendPeriod;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }
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
        const safeLimit = parseFloat(limit) > 0 ? parseFloat(limit) : 1; // Prevent division by zero
        const pct = Math.min(100, Math.max(0, Math.round((spent / safeLimit) * 100))) || 0; // Prevent NaN%
        let cls = 'safe';
        if (pct > 90) cls = 'danger';
        else if (pct > 70) cls = 'warning';
        return `<div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);">
                <span>${escapeHTML(cat)}</span>
                <span style="display:flex;align-items:center;gap:6px;">
                    ${formatCurrency(spent)} / ${formatCurrency(limit)}
                    <button class="btn btn-xs btn-secondary share-budget-btn" data-cat="${escapeHTML(cat)}" data-spent="${spent}" data-limit="${limit}" style="padding:2px 6px; border-radius:4px; font-size:0.7rem;" title="Share"><i class="fas fa-share-alt"></i></button>
                </span>
            </div>
            <div class="budget-progress-bar">
                <div class="budget-progress-fill ${cls}" style="width:${pct}%;"></div>
            </div>
        </div>`;
    }).join('');
}

async function renderDashboardCharts(transactions = null) {
    // Guard: Skip if chart canvases aren't in the DOM (screen not visible)
    if (!document.getElementById('dashPieChart') && !document.getElementById('dashTrendChart')) return;
    
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

    // --- Trend Chart (dynamic period) ---
    const months = [];
    const period = dashboardTrendPeriod;
    for (let i = period - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const expData = months.map(m => txs.filter(t => t.date.startsWith(m) && ['expense', 'groceries'].includes(t.type)).reduce((s, t) => s + parseFloat(t.amount), 0));
    
    const style = getComputedStyle(document.documentElement);
    const dangerColor = style.getPropertyValue('--danger').trim() || '#ff3b30';

    const ctx2 = document.getElementById('dashTrendChart')?.getContext('2d');
    if (ctx2) {
        if (dashTrendChartInstance) dashTrendChartInstance.destroy();
        const style = getComputedStyle(document.documentElement);
        const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#aaa';
        const textTertiary = style.getPropertyValue('--text-tertiary').trim() || '#666';
        const gridColor = style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
        const accentColor = style.getPropertyValue('--accent').trim() || '#6C5CE7';
        
        // Create gradient for bars
        const gradient = ctx2.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, accentColor + 'cc');
        gradient.addColorStop(1, accentColor + '33');
        
        dashTrendChartInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: months.map(m => {
                    const [y, mo] = m.split('-');
                    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo)]} ${y.slice(2)}`;
                }),
                datasets: [
                    {
                        label: 'Expenses',
                        data: expData,
                        backgroundColor: gradient,
                        borderRadius: 6,
                        borderSkipped: false,
                        hoverBackgroundColor: accentColor
                    }
                ]
            },
            options: {
                animation: { 
                    duration: 500, 
                    easing: 'easeOutQuart'
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--bg-glass').trim() + 'ee',
                        titleColor: style.getPropertyValue('--text-primary').trim(),
                        bodyColor: textSecondary,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        callbacks: {
                            label: ctx => formatCurrency(ctx.raw)
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textTertiary,
                            font: { size: 10, family: 'system-ui, -apple-system, sans-serif' },
                            maxRotation: 0
                        },
                        grid: { display: false },
                        border: { display: false }
                    },
                    y: {
                        ticks: {
                            color: textTertiary,
                            font: { size: 10, family: 'system-ui, -apple-system, sans-serif' },
                            callback: v => formatCurrency(v),
                            count: 4
                        },
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        border: { display: false },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}