// ==================== js/reports.js ====================
let analyticsBalanceChart, analyticsTopCatChart, analyticsMonthlyChart, analyticsSpenderChart, analyticsSubcatGroupChart;
let analyticsMonthlyBreakdownPeriod = 6;
let analyticsExpenseTrendPeriod = 6;

async function refreshAnalytics() {
    await loadChartJs();

    // Safety check
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded – analytics disabled.');
        return;
    }
    if (typeof getVisibleTransactions !== 'function' || typeof formatCurrency !== 'function') {
        console.warn('Core utility functions not loaded – analytics disabled.');
        return;
    }

    const period = document.querySelector('.period-btn.active')?.dataset?.period || 'month';
    const txs = getVisibleTransactions();
    const now = new Date();
    let startDate = '';
    if (period === 'month') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'year' || period === 'ytd') {
        startDate = `${now.getFullYear()}`;
    }

    const filterDateThreshold = period === 'month' ? startDate + '-01' : startDate + '-01-01';
    const filtered = txs.filter(t => t.date >= filterDateThreshold);

    const expTxs = filtered.filter(t => ['expense', 'groceries'].includes(t.type));
    const expense = expTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    const groceriesTotal = expTxs.filter(t => t.type === 'groceries').reduce((s, t) => s + parseFloat(t.amount), 0);
    const rentTotal = expTxs.filter(t => t.category === 'House Rent').reduce((s, t) => s + parseFloat(t.amount), 0);
    const txCount = expTxs.length;

    document.getElementById('analyticsSummaryRow').innerHTML = `
        <div class="glass-card" style="text-align:center;">
            <small>Total Expenses</small><br><strong style="color:var(--danger);">${formatCurrency(expense)}</strong>
        </div>
        <div class="glass-card" style="text-align:center;">
            <small>Transactions</small><br><strong>${txCount}</strong>
        </div>
        <div class="glass-card" style="text-align:center;">
            <small>Groceries</small><br><strong style="color:var(--success);">${formatCurrency(groceriesTotal)}</strong>
        </div>
        <div class="glass-card" style="text-align:center;">
            <small>Rent</small><br><strong style="color:var(--warning);">${formatCurrency(rentTotal)}</strong>
        </div>
    `;
    renderAnalyticsCharts(filtered);
    setupAnalyticsMonthlyPeriodSelector();
    setupAnalyticsTrendPeriodSelector();
}

async function renderAnalyticsCharts(filteredTxs) {
    const isLoaded = await loadChartJs();
    if (!isLoaded || typeof Chart === 'undefined') {
        console.warn('Chart.js failed to load – analytics charts disabled.');
        return;
    }

    const filtered = filteredTxs || getVisibleTransactions();
    const allTxs = getVisibleTransactions(); // Cached unfiltered list for bypass charts
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#000';
    const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#666';
    const textTertiary = style.getPropertyValue('--text-tertiary').trim() || '#999';
    const chartGrid = style.getPropertyValue('--chart-grid').trim() || 'rgba(0,0,0,0.06)';
    const accentColor = style.getPropertyValue('--accent').trim() || '#007aff';
    const dangerColor = style.getPropertyValue('--danger').trim() || '#ff3b30';
    const successColor = style.getPropertyValue('--success').trim() || '#34c759';
    const warningColor = style.getPropertyValue('--warning').trim() || '#ff9500';

    // 1. Expense Trend
    const ctx1 = document.getElementById('analyticsBalanceTrend')?.getContext('2d');
    if (ctx1) {
        const title = ctx1.canvas.closest('.card')?.querySelector('.card-title');
        if (title && title.innerText.includes('Balance')) title.innerHTML = '<i class="fas fa-chart-line"></i> Expense Trend';
        
        if (analyticsBalanceChart) analyticsBalanceChart.destroy();
        
        const now = new Date();
        const months = [];
        for (let i = analyticsExpenseTrendPeriod - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const expData = months.map(m => {
            return allTxs
                .filter(t => t.date.startsWith(m) && ['expense', 'groceries'].includes(t.type))
                .reduce((s, t) => s + parseFloat(t.amount), 0);
        });
        analyticsBalanceChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months.map(m => {
                    const [y, mo] = m.split('-');
                    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo)]} ${y.slice(2)}`;
                }),
                datasets: [{
                    label: 'Expenses',
                    data: expData,
                    borderColor: dangerColor,
                    tension: 0.4,
                    fill: true,
                    backgroundColor: hexToRgba(dangerColor, 0.1),
                    pointRadius: 3
                }]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: textTertiary, font: { size: 10 } },
                        grid: { color: chartGrid }
                    },
                    y: {
                        ticks: {
                            color: textTertiary,
                            font: { size: 10 },
                            callback: v => formatCurrency(v)
                        },
                        grid: { color: chartGrid }
                    }
                }
            }
        });
    }

    // 2. Top Spending Categories
    const ctx2 = document.getElementById('analyticsTopCategories')?.getContext('2d');
    if (ctx2) {
        if (analyticsTopCatChart) analyticsTopCatChart.destroy();
        const catMap = {};
        filtered.filter(t => ['expense', 'groceries'].includes(t.type)).forEach(t => {
            const c = t.category || 'Other';
            catMap[c] = (catMap[c] || 0) + parseFloat(t.amount);
        });
        const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        analyticsTopCatChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: sorted.map(e => e[0]),
                datasets: [{
                    data: sorted.map(e => e[1]),
                    backgroundColor: sorted.map(e => getCategoryColor(e[0], 'expense')),
                    borderRadius: 4
                }]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: textTertiary, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: textTertiary,
                            font: { size: 10 },
                            callback: v => formatCurrency(v)
                        },
                        grid: { color: chartGrid }
                    }
                }
            }
        });
    }

    // 3. Monthly Breakdown
    const ctx3 = document.getElementById('analyticsMonthlyBreakdown')?.getContext('2d');
    if (ctx3) {
        if (analyticsMonthlyChart) analyticsMonthlyChart.destroy();
        const monMap = {};
        
        const now = new Date();
        const months = [];
        for (let i = analyticsMonthlyBreakdownPeriod - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        months.forEach(m => {
            monMap[m] = { groc: 0, rent: 0, other: 0 };
        });

        // Use global visible transactions to bypass top period filter
        allTxs.filter(t => ['expense', 'groceries'].includes(t.type)).forEach(t => {
            const m = t.date.slice(0, 7);
            if (monMap[m]) {
                if (t.type === 'groceries' || t.category === 'Groceries') monMap[m].groc += parseFloat(t.amount);
                else if (t.category === 'House Rent') monMap[m].rent += parseFloat(t.amount);
                else monMap[m].other += parseFloat(t.amount);
            }
        });
        
        const mKeys = months;
        analyticsMonthlyChart = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: mKeys.map(m => {
                    const [y, mo] = m.split('-');
                    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo)]} ${y.slice(2)}`;
                }),
                datasets: [
                    {
                        label: 'Groceries',
                        data: mKeys.map(k => monMap[k].groc),
                        backgroundColor: successColor,
                        borderRadius: 4
                    },
                    {
                        label: 'Rent',
                        data: mKeys.map(k => monMap[k].rent),
                        backgroundColor: warningColor,
                        borderRadius: 4
                    },
                    {
                        label: 'Other',
                        data: mKeys.map(k => monMap[k].other),
                        backgroundColor: dangerColor,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: textPrimary,
                            font: { size: 10 }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textTertiary, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: textTertiary,
                            font: { size: 10 },
                            callback: v => formatCurrency(v)
                        },
                        grid: { color: chartGrid }
                    }
                }
            }
        });
    }

    // 4. Spender Breakdown
    const ctx4 = document.getElementById('analyticsSpenderBreakdown')?.getContext('2d');
    if (ctx4) {
        if (analyticsSpenderChart) analyticsSpenderChart.destroy();
        const payerMap = {};
        filtered.filter(t => ['expense', 'groceries'].includes(t.type)).forEach(t => {
            const p = t.payer || 'Unspecified';
            payerMap[p] = (payerMap[p] || 0) + parseFloat(t.amount);
        });
        const pSorted = Object.entries(payerMap).sort((a, b) => b[1] - a[1]);
        
        analyticsSpenderChart = new Chart(ctx4, {
            type: 'doughnut',
            data: {
                labels: pSorted.map(e => e[0]),
                datasets: [{
                    data: pSorted.map(e => e[1]),
                    backgroundColor: pSorted.map(e => e[0] === 'Unspecified' ? '#8e8e93' : (typeof getStringColor === 'function' ? getStringColor(e[0]) : '#007aff')),
                    borderWidth: 0
                }]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { color: textPrimary, font: { size: 11 } }
                    } 
                },
                cutout: '55%',
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = chart.data.labels[index];
                        const filterPayerEl = document.getElementById('filterPayer');
                        if (filterPayerEl) {
                            filterPayerEl.value = label === 'Unspecified' ? 'all' : label;
                            navigateTo('screenTransactions');
                        }
                    }
                }
            }
        });
    }

    // 5. Subcategory Groups
    const ctx5 = document.getElementById('analyticsSubcatGroups')?.getContext('2d');
    if (ctx5) {
        if (analyticsSubcatGroupChart) analyticsSubcatGroupChart.destroy();
        const groupMap = {};
        filtered.filter(t => ['expense', 'groceries'].includes(t.type)).forEach(t => {
            if (t.subcategory && t.subcategory.includes(':')) {
                const group = t.subcategory.split(':')[0].trim();
                groupMap[group] = (groupMap[group] || 0) + parseFloat(t.amount);
            } else {
                groupMap['Ungrouped'] = (groupMap['Ungrouped'] || 0) + parseFloat(t.amount);
            }
        });
        const gSorted = Object.entries(groupMap).sort((a, b) => b[1] - a[1]);
        
        analyticsSubcatGroupChart = new Chart(ctx5, {
            type: 'doughnut',
            data: {
                labels: gSorted.map(e => e[0]),
                datasets: [{
                    data: gSorted.map(e => e[1]),
                    backgroundColor: gSorted.map(e => e[0] === 'Ungrouped' ? '#8e8e93' : (typeof getStringColor === 'function' ? getStringColor(e[0]) : '#007aff')),
                    borderWidth: 0
                }]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { color: textPrimary, font: { size: 11 } }
                    } 
                },
                cutout: '55%',
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = chart.data.labels[index];
                        const filterSearchEl = document.getElementById('filterSearch');
                        if (filterSearchEl) {
                            // Append colon to ensure it searches for the group prefix strictly
                            filterSearchEl.value = label === 'Ungrouped' ? '' : label + ':';
                            navigateTo('screenTransactions');
                        }
                    }
                }
            }
        });
    }

    // 6. Split Balances
    const splitContainer = document.getElementById('analyticsSplitBalances');
    if (splitContainer) {
        const myName = (state.currentUser && state.currentUser.name) ? state.currentUser.name : 'Me';
        const balances = {}; // Pair tracker
        filtered.forEach(t => {
            // Handle settlement payments
            if (t.type === 'settlement' && t.payer && t.splitWith) {
                const splitArr = Array.isArray(t.splitWith) ? t.splitWith : [t.splitWith];
                if (splitArr.length !== 1) return;
                const amount = parseFloat(t.amount) || 0;
                const [p1, p2] = [t.payer, splitArr[0]].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if (t.payer === p1) {
                    balances[pairKey] += amount; // p1 paid p2, reducing p1's debt
                } else {
                    balances[pairKey] -= amount; // p2 paid p1, reducing p2's debt
                }
            }
            // Handle Lent / Returned to the current user
            else if (t.type === 'lent' && t.payer) {
                const amount = parseFloat(t.amount) || 0;
                const [p1, p2] = [myName, t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if (myName === p1) balances[pairKey] += amount;
                else balances[pairKey] -= amount;
            }
            else if (t.type === 'returned' && t.payer) {
                const amount = parseFloat(t.amount) || 0;
                const [p1, p2] = [myName, t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if (myName === p1) balances[pairKey] -= amount;
                else balances[pairKey] += amount;
            }
            // Handle regular split expenses
            else if (t.payer && t.splitWith) {
                const splitArr = Array.isArray(t.splitWith) ? t.splitWith : [t.splitWith];
                if (splitArr.length === 0) return;
                const amount = parseFloat(t.amount) || 0;
                const splitAmt = amount / (splitArr.length + 1); // Equal split
                splitArr.forEach(debtor => {
                    const [p1, p2] = [t.payer, debtor].sort();
                    const pairKey = `${p1}|${p2}`;
                    if (!balances[pairKey]) balances[pairKey] = 0;
                    if (t.payer === p1) {
                        balances[pairKey] += splitAmt; // p2 owes p1
                    } else {
                        balances[pairKey] -= splitAmt; // p1 owes p2
                    }
                });
            }
        });
        
        let splitHtml = '';
        for (const [pair, amt] of Object.entries(balances)) {
            if (Math.abs(amt) < 0.01) continue;
            const [p1, p2] = pair.split('|');
            const debtor = amt > 0 ? p2 : p1;
            const creditor = amt > 0 ? p1 : p2;
            const settledAmt = Math.abs(amt);
            
            splitHtml += `<div class="split-balance-row" data-debtor="${escapeHTML(debtor)}" data-creditor="${escapeHTML(creditor)}" data-amount="${settledAmt}" style="padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.95rem;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background 0.2s;" title="Click to settle this debt">
                <span><strong style="color:${getStringColor(debtor)};">${escapeHTML(debtor)}</strong> owes <strong style="color:${getStringColor(creditor)};">${escapeHTML(creditor)}</strong></span>
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="color:var(--danger);font-weight:700;">${formatCurrency(settledAmt)}</span>
                    <button class="btn btn-xs btn-secondary share-balance-btn" data-debtor="${escapeHTML(debtor)}" data-creditor="${escapeHTML(creditor)}" data-amount="${settledAmt}" style="padding:4px 6px; border-radius:4px; font-size:0.75rem;" title="Share"><i class="fas fa-share-alt"></i></button>
                    <i class="fas fa-chevron-right" style="font-size:0.8rem;color:var(--text-tertiary);"></i>
                </span>
            </div>`;
        }
        if (!splitHtml) splitHtml = '<p style="color:var(--text-tertiary);text-align:center;font-size:0.85rem;margin:10px 0;">No pending splits for this period.</p>';
        splitContainer.innerHTML = splitHtml;
    }
}

function setupAnalyticsMonthlyPeriodSelector() {
    const chartCard = document.querySelector('#analyticsMonthlyBreakdown')?.closest('.card');
    if (!chartCard) return;

    const titleEl = chartCard.querySelector('.card-title');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-calendar-alt"></i> ${analyticsMonthlyBreakdownPeriod}-Month Breakdown`;
    }

    let selector = chartCard.querySelector('.monthly-period-selector');
    if (!selector) {
        selector = document.createElement('div');
        selector.className = 'monthly-period-selector';
        selector.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
        selector.setAttribute('role', 'group');
        selector.setAttribute('aria-label', 'Monthly breakdown period selector');
        
        const canvas = chartCard.querySelector('canvas');
        if (canvas) chartCard.insertBefore(selector, canvas);
        
        const periods = [3, 6, 12];
        periods.forEach(p => {
            const isActive = analyticsMonthlyBreakdownPeriod === p;
            const btn = document.createElement('button');
            btn.className = `btn btn-xs btn-secondary period-btn-monthly${isActive ? ' active' : ''}`;
            btn.textContent = `${p}M`;
            btn.dataset.period = p;
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.setAttribute('aria-label', `${p} Months`);
            btn.addEventListener('click', (e) => {
                analyticsMonthlyBreakdownPeriod = parseInt(e.target.dataset.period, 10);
                refreshAnalytics(); 
            });
            selector.appendChild(btn);
        });
    } else {
        selector.querySelectorAll('.period-btn-monthly').forEach(btn => {
            const isActive = parseInt(btn.dataset.period, 10) === analyticsMonthlyBreakdownPeriod;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }
}

function setupAnalyticsTrendPeriodSelector() {
    const chartCard = document.querySelector('#analyticsBalanceTrend')?.closest('.card');
    if (!chartCard) return;

    const titleEl = chartCard.querySelector('.card-title');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-chart-line"></i> ${analyticsExpenseTrendPeriod}-Month Expense Trend`;
    }

    let selector = chartCard.querySelector('.trend-period-selector-analytics');
    if (!selector) {
        selector = document.createElement('div');
        selector.className = 'trend-period-selector-analytics';
        selector.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
        selector.setAttribute('role', 'group');
        selector.setAttribute('aria-label', 'Expense trend period selector');
        
        const canvas = chartCard.querySelector('canvas');
        if (canvas) chartCard.insertBefore(selector, canvas);
        
        const periods = [3, 6, 12];
        periods.forEach(p => {
            const isActive = analyticsExpenseTrendPeriod === p;
            const btn = document.createElement('button');
            btn.className = `btn btn-xs btn-secondary period-btn-trend-analytics${isActive ? ' active' : ''}`;
            btn.textContent = `${p}M`;
            btn.dataset.period = p;
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.setAttribute('aria-label', `${p} Months`);
            btn.addEventListener('click', (e) => {
                analyticsExpenseTrendPeriod = parseInt(e.target.dataset.period, 10);
                refreshAnalytics(); 
            });
            selector.appendChild(btn);
        });
    } else {
        selector.querySelectorAll('.period-btn-trend-analytics').forEach(btn => {
            const isActive = parseInt(btn.dataset.period, 10) === analyticsExpenseTrendPeriod;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }
}