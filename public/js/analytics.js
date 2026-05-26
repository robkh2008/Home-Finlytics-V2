// ==================== js/analytics.js ====================
let analyticsBalanceChart, analyticsTopCatChart, analyticsMonthlyChart, analyticsSpenderChart, analyticsSubcatGroupChart;

function refreshAnalytics() {
    // Safety check
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded – analytics disabled.');
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
    const groceriesTotal = expTxs.filter(t => t.type === 'groceries' || t.category === 'Groceries').reduce((s, t) => s + parseFloat(t.amount), 0);
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
}

function renderAnalyticsCharts(filteredTxs) {
    const filtered = filteredTxs || getVisibleTransactions();
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#000';
    const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#666';
    const textTertiary = style.getPropertyValue('--text-tertiary').trim() || '#999';
    const chartGrid = style.getPropertyValue('--chart-grid').trim() || 'rgba(0,0,0,0.06)';
    const accentColor = style.getPropertyValue('--accent').trim() || '#007aff';

    // 1. Expense Trend
    const ctx1 = document.getElementById('analyticsBalanceTrend')?.getContext('2d');
    if (ctx1) {
        const title = ctx1.canvas.closest('.card')?.querySelector('.card-title');
        if (title && title.innerText.includes('Balance')) title.innerHTML = '<i class="fas fa-chart-line"></i> Expense Trend';
        
        if (analyticsBalanceChart) analyticsBalanceChart.destroy();
        const months = [...new Set(filtered.map(t => t.date.slice(0, 7)))].sort();
        const expData = [];
        months.forEach(m => {
            const exp = filtered.filter(t => t.date.startsWith(m) && ['expense', 'groceries'].includes(t.type)).reduce((s, t) => s + parseFloat(t.amount), 0);
            expData.push(exp);
        });
        analyticsBalanceChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Expenses',
                    data: expData,
                    borderColor: '#ff3b30',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: hexToRgba('#ff3b30', 0.1),
                    pointRadius: 3
                }]
            },
            options: {
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
        filtered.filter(t => ['expense', 'groceries'].includes(t.type)).forEach(t => {
            const m = t.date.slice(0, 7);
            if (!monMap[m]) monMap[m] = { groc: 0, rent: 0, other: 0 };
            
            if (t.type === 'groceries' || t.category === 'Groceries') monMap[m].groc += parseFloat(t.amount);
            else if (t.category === 'House Rent') monMap[m].rent += parseFloat(t.amount);
            else monMap[m].other += parseFloat(t.amount);
        });
        const mKeys = Object.keys(monMap).sort();
        analyticsMonthlyChart = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: mKeys,
                datasets: [
                    {
                        label: 'Groceries',
                        data: mKeys.map(k => monMap[k].groc),
                        backgroundColor: '#34c759',
                        borderRadius: 4
                    },
                    {
                        label: 'Rent',
                        data: mKeys.map(k => monMap[k].rent),
                        backgroundColor: '#ff9500',
                        borderRadius: 4
                    },
                    {
                        label: 'Other',
                        data: mKeys.map(k => monMap[k].other),
                        backgroundColor: '#ff3b30',
                        borderRadius: 4
                    }
                ]
            },
            options: {
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
        const balances = {}; // Pair tracker
        filtered.forEach(t => {
            // Handle settlement payments
            if (t.type === 'settlement' && t.payer && t.splitWith && t.splitWith.length === 1) {
                const amount = parseFloat(t.amount);
                const [p1, p2] = [t.payer, t.splitWith[0]].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if (t.payer === p1) {
                    balances[pairKey] += amount; // p1 paid p2, reducing p1's debt
                } else {
                    balances[pairKey] -= amount; // p2 paid p1, reducing p2's debt
                }
            }
            // Handle Lent / Returned to "Me"
            else if (t.type === 'lent' && t.payer) {
                const amount = parseFloat(t.amount);
                const [p1, p2] = ['Me', t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if ('Me' === p1) balances[pairKey] += amount;
                else balances[pairKey] -= amount;
            }
            else if (t.type === 'returned' && t.payer) {
                const amount = parseFloat(t.amount);
                const [p1, p2] = ['Me', t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = 0;
                if ('Me' === p1) balances[pairKey] -= amount;
                else balances[pairKey] += amount;
            }
            // Handle regular split expenses
            else if (t.payer && t.splitWith && t.splitWith.length > 0) {
                const amount = parseFloat(t.amount);
                const splitAmt = amount / (t.splitWith.length + 1); // Equal split
                t.splitWith.forEach(debtor => {
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
            
            splitHtml += `<div class="split-balance-row" data-debtor="${debtor}" data-creditor="${creditor}" data-amount="${settledAmt}" style="padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.95rem;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background 0.2s;" title="Click to settle this debt" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
                <span><strong style="color:${getStringColor(debtor)};">${debtor}</strong> owes <strong style="color:${getStringColor(creditor)};">${creditor}</strong></span>
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="color:var(--danger);font-weight:700;">${formatCurrency(settledAmt)}</span>
                    <button class="btn btn-xs btn-secondary share-balance-btn" data-debtor="${debtor}" data-creditor="${creditor}" data-amount="${settledAmt}" style="padding:4px 6px; border-radius:4px; font-size:0.75rem;" title="Share"><i class="fas fa-share-alt"></i></button>
                    <i class="fas fa-chevron-right" style="font-size:0.8rem;color:var(--text-tertiary);"></i>
                </span>
            </div>`;
        }
        if (!splitHtml) splitHtml = '<p style="color:var(--text-tertiary);text-align:center;font-size:0.85rem;margin:10px 0;">No pending splits for this period.</p>';
        splitContainer.innerHTML = splitHtml;
    }
}