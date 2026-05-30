// ==================== js/reports.js ====================
let analyticsBalanceChart, analyticsTopCatChart, analyticsMonthlyChart;
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
    const currentUserId = getCurrentUserId();
    const userName = state.currentUser?.name || state.userProfile?.displayName || 'Me';
    const now = new Date();
    let startDate = '';
    if (period === 'month') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'year' || period === 'ytd') {
        startDate = `${now.getFullYear()}`;
    }

    const filterDateThreshold = period === 'month' ? startDate + '-01' : startDate + '-01-01';
    const filtered = txs.filter(t => t.date >= filterDateThreshold);

    const expTxs = filtered.filter(t => ['expense', 'groceries', 'rent'].includes(t.type));
    
    // USER-CENTRIC breakdown
    const myExpenseTxs = expTxs.filter(t => 
        t.category !== 'Groceries' && t.category !== 'House Rent' &&
        (t.userId === currentUserId || (!t.userId && t.payer === userName))
    );
    const myExpense = myExpenseTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    const groceriesTxs = expTxs.filter(t => t.type === 'groceries' || t.category === 'Groceries');
    const groceriesTotal = groceriesTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    const rentTxs = expTxs.filter(t => t.category === 'House Rent' || t.type === 'rent');
    const rentTotal = rentTxs.reduce((s, t) => s + parseFloat(t.amount), 0);
    
    const expense = myExpense + groceriesTotal + rentTotal;
    const txCount = expTxs.length;

    document.getElementById('analyticsSummaryRow').innerHTML = `
        <div class="glass-card analytics-summary-tappable" data-analytics-detail="myexpenses" style="text-align:center;cursor:pointer;" title="Tap to see top expenses">
            <small>My Expenses</small><br><strong style="color:var(--danger);">${formatCurrency(myExpense)}</strong>
            <div style="font-size:0.55rem;color:var(--text-tertiary);">${escapeHTML(userName)}</div>
        </div>
        <div class="glass-card analytics-summary-tappable" data-analytics-detail="kitchen" style="text-align:center;cursor:pointer;" title="Tap to see top expenses">
            <small>Kitchen 🍳</small><br><strong style="color:var(--success);">${formatCurrency(groceriesTotal)}</strong>
            <div style="font-size:0.55rem;color:var(--text-tertiary);">Shared</div>
        </div>
        <div class="glass-card" style="text-align:center;">
            <small>Rent</small><br><strong style="color:var(--warning);">${formatCurrency(rentTotal)}</strong>
        </div>
        <div class="glass-card" style="text-align:center;">
            <small>Transactions</small><br><strong>${txCount}</strong>
        </div>
    `;
    attachAnalyticsSummaryTapHandlers(myExpenseTxs, groceriesTxs, myExpense, groceriesTotal, userName);
    renderAnalyticsCharts(filtered);
    setupAnalyticsMonthlyPeriodSelector();
    setupAnalyticsTrendPeriodSelector();
}

async function renderAnalyticsCharts(filteredTxs) {
    const isLoaded = await loadChartJs();
    if (!isLoaded || typeof Chart === 'undefined') {
        console.warn('Chart.js failed to load – analytics charts disabled.');
        // Show fallback messages on all chart containers
        document.querySelectorAll('#screenAnalytics .chart-fallback').forEach(el => el.style.display = 'block');
        document.querySelectorAll('#screenAnalytics .chart-wrap canvas').forEach(el => el.style.display = 'none');
        return;
    }
    // Hide fallbacks, show canvases
    document.querySelectorAll('#screenAnalytics .chart-fallback').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#screenAnalytics .chart-wrap canvas').forEach(el => el.style.display = '');

    const filtered = filteredTxs || getVisibleTransactions();
    const allTxs = getVisibleTransactions(); // Cached unfiltered list for bypass charts
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#fff';
    const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#aaa';
    const textTertiary = style.getPropertyValue('--text-tertiary').trim() || '#666';
    const chartGrid = style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
    const accentColor = style.getPropertyValue('--accent').trim() || '#6C5CE7';
    const dangerColor = style.getPropertyValue('--danger').trim() || '#E17055';
    const successColor = style.getPropertyValue('--success').trim() || '#00B894';
    const warningColor = style.getPropertyValue('--warning').trim() || '#FDCB6E';
    const bgGlass = style.getPropertyValue('--bg-glass').trim() || '#1c1c1e';

    // Shared modern tooltip config
    const modernTooltip = {
        backgroundColor: bgGlass + 'ee',
        titleColor: textPrimary,
        bodyColor: textSecondary,
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        displayColors: true,
        boxPadding: 4
    };

    // Shared modern animation
    const modernAnimation = { duration: 500, easing: 'easeOutQuart' };

    // Shared font config
    const fontFamily = 'system-ui, -apple-system, sans-serif';

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
                .filter(t => t.date.startsWith(m) && ['expense', 'groceries', 'rent'].includes(t.type))
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
                    label: 'Monthly Expenses',
                    data: expData,
                    borderColor: accentColor,
                    backgroundColor: accentColor + '18',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: accentColor,
                    pointBorderColor: bgGlass,
                    pointBorderWidth: 2
                }]
            },
            options: {
                animation: modernAnimation,
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: { ...modernTooltip, callbacks: { label: ctx => '  ' + formatCurrency(ctx.raw) } }
                },
                scales: {
                    x: { ticks: { color: textTertiary, font: { size: 10, family: fontFamily }, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
                    y: { ticks: { color: textTertiary, font: { size: 10, family: fontFamily }, callback: v => formatCurrency(v), count: 4 }, grid: { color: chartGrid, drawBorder: false }, border: { display: false }, beginAtZero: true }
                }
            }
        });
    }

    // 2. Top Spending Categories
    const ctx2 = document.getElementById('analyticsTopCategories')?.getContext('2d');
    if (ctx2) {
        if (analyticsTopCatChart) analyticsTopCatChart.destroy();
        const catMap = {};
        const catSubMap = {}; // category → { subcategory: amount }
        filtered.filter(t => ['expense', 'groceries', 'rent'].includes(t.type)).forEach(t => {
            const c = t.category || 'Other';
            catMap[c] = (catMap[c] || 0) + parseFloat(t.amount);
            if (!catSubMap[c]) catSubMap[c] = {};
            const sub = t.subcategory || 'Other';
            catSubMap[c][sub] = (catSubMap[c][sub] || 0) + parseFloat(t.amount);
        });
        const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const catNames = sorted.map(e => e[0]);
        analyticsTopCatChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: sorted.map(e => e[0]),
                datasets: [{
                    data: sorted.map(e => e[1]),
                    backgroundColor: sorted.map(e => getCategoryColor(e[0], 'expense')),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                animation: modernAnimation,
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: { ...modernTooltip, callbacks: { label: ctx => '  ' + formatCurrency(ctx.raw) } }
                },
                scales: {
                    x: { ticks: { color: textTertiary, font: { size: 10, family: fontFamily }, callback: v => formatCurrency(v) }, grid: { color: chartGrid, drawBorder: false }, border: { display: false }, beginAtZero: true },
                    y: { ticks: { color: textSecondary, font: { size: 11, family: fontFamily } }, grid: { display: false }, border: { display: false } }
                },
                onClick: (e, elements) => {
                    if (!elements || elements.length === 0) return;
                    const idx = elements[0].index;
                    const catName = catNames[idx];
                    const subs = catSubMap[catName];
                    if (!subs) return;
                    
                    const sortedSubs = Object.entries(subs).sort((a, b) => b[1] - a[1]);
                    const catTotal = sortedSubs.reduce((s, [, v]) => s + v, 0);
                    const catColor = getCategoryColor(catName, 'expense');
                    
                    const popup = document.getElementById('analyticsDetailPopup');
                    const overlay = document.getElementById('analyticsDetailOverlay');
                    if (!popup || !overlay) return;
                    
                    popup.innerHTML = `
                        <div style="text-align:center;margin-bottom:16px;">
                            <i class="fas fa-tag" style="font-size:2rem;color:${catColor};margin-bottom:8px;display:block;"></i>
                            <h3 style="margin:0;color:${catColor};">${formatCurrency(catTotal)}</h3>
                            <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">${escapeHTML(catName)} · Subcategory breakdown</p>
                        </div>
                        <div style="max-height:55vh;overflow-y:auto;">
                        ${sortedSubs.map(([sub, amt], i) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.85rem;">
                                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                                    <span style="font-size:0.7rem;font-weight:700;color:var(--text-tertiary);width:20px;text-align:right;">#${i + 1}</span>
                                    <span style="color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(sub)}</span>
                                </div>
                                <span style="font-weight:700;white-space:nowrap;margin-left:8px;">${formatCurrency(amt)}</span>
                            </div>
                        `).join('')}
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:0.9rem;font-weight:700;">
                                <span>Total</span>
                                <span style="color:${catColor};">${formatCurrency(catTotal)}</span>
                            </div>
                        </div>
                    `;
                    overlay.style.display = 'flex';
                    document.body.style.overflow = 'hidden';
                }
            }
        });

        // Also add cursor style to the canvas
        ctx2.canvas.style.cursor = 'pointer';
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
        allTxs.filter(t => ['expense', 'groceries', 'rent'].includes(t.type)).forEach(t => {
            const m = t.date.slice(0, 7);
            if (monMap[m]) {
                if (t.type === 'groceries' || t.category === 'Groceries') monMap[m].groc += parseFloat(t.amount);
                else if (t.category === 'House Rent' || t.type === 'rent') monMap[m].rent += parseFloat(t.amount);
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
                    { label: 'Groceries', data: mKeys.map(m => monMap[m].groc), backgroundColor: successColor, borderRadius: 6, borderSkipped: false },
                    { label: 'Rent', data: mKeys.map(m => monMap[m].rent), backgroundColor: warningColor, borderRadius: 6, borderSkipped: false },
                    { label: 'Other', data: mKeys.map(m => monMap[m].other), backgroundColor: accentColor, borderRadius: 6, borderSkipped: false }
                ]
            },
            options: {
                animation: modernAnimation,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textSecondary, font: { size: 10, family: fontFamily }, usePointStyle: true, pointStyleWidth: 8, padding: 10 } },
                    tooltip: { ...modernTooltip, callbacks: { label: ctx => '  ' + ctx.dataset.label + ': ' + formatCurrency(ctx.raw) } }
                },
                scales: {
                    x: { stacked: true, ticks: { color: textTertiary, font: { size: 10, family: fontFamily }, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
                    y: { stacked: true, ticks: { color: textTertiary, font: { size: 10, family: fontFamily }, callback: v => formatCurrency(v), count: 4 }, grid: { color: chartGrid, drawBorder: false }, border: { display: false }, beginAtZero: true }
                }
            }
        });
    }

    // 4. Split Balances
    const splitContainer = document.getElementById('analyticsSplitBalances');
    if (splitContainer) {
        const myName = (state.currentUser && state.currentUser.name) ? state.currentUser.name : 'Me';
        const balances = {}; // { pairKey: { amount, txIds: [] } }
        filtered.forEach(t => {
            const amount = parseFloat(t.amount) || 0;
            
            // Handle settlement payments
            if (t.type === 'settlement' && t.payer && t.splitWith) {
                const splitArr = Array.isArray(t.splitWith) ? t.splitWith : [t.splitWith];
                if (splitArr.length !== 1) return;
                const [p1, p2] = [t.payer, splitArr[0]].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = { amount: 0, txIds: [] };
                balances[pairKey].txIds.push(t.id);
                if (t.payer === p1) {
                    balances[pairKey].amount += amount;
                } else {
                    balances[pairKey].amount -= amount;
                }
            }
            // Handle Lent / Returned to the current user
            else if (t.type === 'lent' && t.payer) {
                const [p1, p2] = [myName, t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = { amount: 0, txIds: [] };
                balances[pairKey].txIds.push(t.id);
                if (myName === p1) balances[pairKey].amount += amount;
                else balances[pairKey].amount -= amount;
            }
            else if (t.type === 'returned' && t.payer) {
                const [p1, p2] = [myName, t.payer].sort();
                const pairKey = `${p1}|${p2}`;
                if (!balances[pairKey]) balances[pairKey] = { amount: 0, txIds: [] };
                balances[pairKey].txIds.push(t.id);
                if (myName === p1) balances[pairKey].amount -= amount;
                else balances[pairKey].amount += amount;
            }
            // Handle regular split expenses
            else if (t.payer && t.splitWith) {
                const splitArr = Array.isArray(t.splitWith) ? t.splitWith : [t.splitWith];
                if (splitArr.length === 0) return;
                const splitAmt = amount / (splitArr.length + 1);
                splitArr.forEach(debtor => {
                    const [p1, p2] = [t.payer, debtor].sort();
                    const pairKey = `${p1}|${p2}`;
                    if (!balances[pairKey]) balances[pairKey] = { amount: 0, txIds: [] };
                    balances[pairKey].txIds.push(t.id);
                    if (t.payer === p1) {
                        balances[pairKey].amount += splitAmt;
                    } else {
                        balances[pairKey].amount -= splitAmt;
                    }
                });
            }
        });
        
        let splitHtml = '';
        for (const [pair, data] of Object.entries(balances)) {
            if (Math.abs(data.amount) < 0.01) continue;
            const [p1, p2] = pair.split('|');
            const debtor = data.amount > 0 ? p2 : p1;
            const creditor = data.amount > 0 ? p1 : p2;
            const settledAmt = Math.abs(data.amount);
            const txIds = [...new Set(data.txIds)]; // Deduplicate
            const txIdsJSON = JSON.stringify(txIds).replace(/"/g, '&quot;');
            
            splitHtml += `<div class="split-balance-row" data-debtor="${escapeHTML(debtor)}" data-creditor="${escapeHTML(creditor)}" data-amount="${settledAmt}" data-txids="${txIdsJSON}" style="padding:8px 0;border-bottom:1px solid var(--divider);font-size:0.95rem;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background 0.2s;" title="Tap to view the ${txIds.length} split transaction${txIds.length !== 1 ? 's' : ''}">
                <span><strong style="color:${getStringColor(debtor)};">${escapeHTML(debtor)}</strong> owes <strong style="color:${getStringColor(creditor)};">${escapeHTML(creditor)}</strong></span>
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="color:var(--danger);font-weight:700;">${formatCurrency(settledAmt)}</span>
                    <span style="font-size:0.6rem;color:var(--text-tertiary);">${txIds.length} tx</span>
                    <button class="btn btn-xs btn-secondary share-balance-btn" data-debtor="${escapeHTML(debtor)}" data-creditor="${escapeHTML(creditor)}" data-amount="${settledAmt}" style="padding:4px 6px; border-radius:4px; font-size:0.75rem;" title="Share"><i class="fas fa-share-alt"></i></button>
                    <i class="fas fa-chevron-right" style="font-size:0.8rem;color:var(--text-tertiary);"></i>
                </span>
            </div>`;
        }
        if (!splitHtml) splitHtml = '<p style="color:var(--text-tertiary);text-align:center;font-size:0.85rem;margin:10px 0;">No pending splits for this period.</p>';
        splitContainer.innerHTML = splitHtml;

        // Attach click handlers: split balance row → navigate to specific split transactions
        splitContainer.querySelectorAll('.split-balance-row').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.share-balance-btn')) return;
                
                const debtor = this.dataset.debtor;
                const creditor = this.dataset.creditor;
                const txIdsRaw = this.dataset.txids;
                let txIds = [];
                try {
                    txIds = JSON.parse(txIdsRaw.replace(/&quot;/g, '"'));
                } catch(e) { txIds = []; }
                
                if (txIds.length === 1) {
                    // Single transaction — navigate directly to its detail
                    navigateTo('screenTransactions');
                    setTimeout(() => {
                        // Clear filters
                        ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterSearch', 'filterDateFrom', 'filterDateTo', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
                        });
                        if (typeof refreshTransactionList === 'function') refreshTransactionList();
                        // Expand the specific transaction
                        setTimeout(() => {
                            const row = document.querySelector(`.tx-row[data-id="${txIds[0]}"]`);
                            if (row) {
                                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                row.style.transition = 'background 0.3s';
                                row.style.background = 'rgba(108,92,231,0.2)';
                                setTimeout(() => { row.style.background = ''; }, 1500);
                                if (typeof toggleTransactionDetail === 'function') toggleTransactionDetail(txIds[0], row);
                            }
                        }, 300);
                    }, 200);
                    showToast(`Split: ${debtor} owes ${creditor} ${formatCurrency(parseFloat(this.dataset.amount))}`, 'handshake');
                } else if (txIds.length > 1) {
                    // Multiple transactions — filter to show only these specific ones
                    navigateTo('screenTransactions');
                    setTimeout(() => {
                        // Clear filters first
                        ['filterType', 'filterCategory', 'filterSubcategory', 'filterPayer', 'filterSearch', 'filterDateFrom', 'filterDateTo', 'filterAmountMin', 'filterAmountMax'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
                        });
                        // Set payer filter to debtor
                        const filterPayer = document.getElementById('filterPayer');
                        if (filterPayer) {
                            const options = Array.from(filterPayer.options);
                            const match = options.find(o => o.value.toLowerCase() === debtor.toLowerCase());
                            if (match) filterPayer.value = match.value;
                        }
                        if (typeof refreshTransactionList === 'function') refreshTransactionList();
                        // Highlight the specific rows
                        setTimeout(() => {
                            txIds.forEach(id => {
                                const row = document.querySelector(`.tx-row[data-id="${id}"]`);
                                if (row) {
                                    row.style.transition = 'background 0.3s';
                                    row.style.background = 'rgba(108,92,231,0.15)';
                                    setTimeout(() => { row.style.background = ''; }, 2000);
                                }
                            });
                        }, 300);
                    }, 200);
                    showToast(`Showing ${txIds.length} split transactions for ${debtor} ↔ ${creditor}`, 'handshake');
                }
            });
        });
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
        if (canvas && canvas.parentNode) canvas.parentNode.insertBefore(selector, canvas);
        
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
        if (canvas && canvas.parentNode) canvas.parentNode.insertBefore(selector, canvas);
        
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

// Analytics summary tap handlers — shows top expenses detail popup
function attachAnalyticsSummaryTapHandlers(myExpenseTxs, groceriesTxs, myExpenseTotal, groceriesTotal, userName) {
    const popup = document.getElementById('analyticsDetailPopup');
    const overlay = document.getElementById('analyticsDetailOverlay');
    if (!popup || !overlay) return;

    // Sort transactions by amount descending for top expenses
    const getTopExpenses = (txs, limit = 5) => {
        return [...txs]
            .filter(t => t.amount && parseFloat(t.amount) > 0)
            .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
            .slice(0, limit);
    };

    const handlers = {
        myexpenses: () => {
            const topTxs = getTopExpenses(myExpenseTxs);
            popup.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <i class="fas fa-wallet" style="font-size:2rem;color:var(--danger);margin-bottom:8px;display:block;"></i>
                    <h3 style="margin:0;color:var(--danger);">${formatCurrency(myExpenseTotal)}</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">My Expenses · ${escapeHTML(userName)}</p>
                </div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="fas fa-arrow-down"></i> Top Expenses
                </div>
                ${topTxs.length > 0 ? topTxs.map((t, i) => `
                    <div class="analytics-top-tx-row" data-tx-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);cursor:pointer;transition:background 0.15s;" title="Tap to view transaction">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                            <span style="font-size:0.75rem;font-weight:700;color:var(--text-tertiary);width:20px;text-align:right;">#${i + 1}</span>
                            <div style="min-width:0;">
                                <div style="font-weight:600;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(t.subcategory || t.category || 'N/A')}</div>
                                <div style="font-size:0.65rem;color:var(--text-tertiary);">${t.date}${t.payer ? ' · ' + escapeHTML(t.payer) : ''}</div>
                            </div>
                        </div>
                        <div style="font-weight:700;color:var(--danger);white-space:nowrap;font-size:0.85rem;">-${formatCurrency(t.amount)}</div>
                    </div>
                `).join('') : '<p style="color:var(--text-tertiary);text-align:center;font-size:0.8rem;margin:8px 0;">No expense transactions this period.</p>'}
                ${topTxs.length > 0 ? `<div style="text-align:center;margin-top:8px;"><small style="color:var(--text-tertiary);">Tap any expense to view details</small></div>` : ''}
            `;
            // Attach click handlers for top expense rows
            popup.querySelectorAll('.analytics-top-tx-row').forEach(row => {
                row.addEventListener('click', function() {
                    const txId = this.dataset.txId;
                    if (txId && typeof navigateToTransaction === 'function') {
                        overlay.style.display = 'none';
                        document.body.style.overflow = '';
                        navigateToTransaction(txId);
                    }
                });
            });
        },
        kitchen: () => {
            const topTxs = getTopExpenses(groceriesTxs);
            popup.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <i class="fas fa-shopping-basket" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
                    <h3 style="margin:0;color:var(--success);">${formatCurrency(groceriesTotal)}</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">Kitchen 🍳 · Shared groceries</p>
                </div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="fas fa-arrow-down"></i> Top Expenses
                </div>
                ${topTxs.length > 0 ? topTxs.map((t, i) => `
                    <div class="analytics-top-tx-row" data-tx-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);cursor:pointer;transition:background 0.15s;" title="Tap to view transaction">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                            <span style="font-size:0.75rem;font-weight:700;color:var(--text-tertiary);width:20px;text-align:right;">#${i + 1}</span>
                            <div style="min-width:0;">
                                <div style="font-weight:600;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(t.subcategory || t.category || 'N/A')}</div>
                                <div style="font-size:0.65rem;color:var(--text-tertiary);">${t.date}${t.payer ? ' · ' + escapeHTML(t.payer) : ''}</div>
                            </div>
                        </div>
                        <div style="font-weight:700;color:var(--success);white-space:nowrap;font-size:0.85rem;">-${formatCurrency(t.amount)}</div>
                    </div>
                `).join('') : '<p style="color:var(--text-tertiary);text-align:center;font-size:0.8rem;margin:8px 0;">No kitchen expenses this period.</p>'}
                ${topTxs.length > 0 ? `<div style="text-align:center;margin-top:8px;"><small style="color:var(--text-tertiary);">Tap any expense to view details</small></div>` : ''}
            `;
            // Attach click handlers for top expense rows
            popup.querySelectorAll('.analytics-top-tx-row').forEach(row => {
                row.addEventListener('click', function() {
                    const txId = this.dataset.txId;
                    if (txId && typeof navigateToTransaction === 'function') {
                        overlay.style.display = 'none';
                        document.body.style.overflow = '';
                        navigateToTransaction(txId);
                    }
                });
            });
        },
        topcategories: () => {
            // REMOVED — now handled via individual bar clicks on the chart
        }
    };

    // Use event delegation on the summary row
    const summaryRow = document.getElementById('analyticsSummaryRow');
    if (summaryRow && !window._analyticsSummaryHandlersBound) {
        window._analyticsSummaryHandlersBound = true;
        summaryRow.addEventListener('click', function(e) {
            const card = e.target.closest('.analytics-summary-tappable');
            if (!card) return;
            e.stopPropagation();
            const detail = card.dataset.analyticsDetail;
            if (handlers[detail]) handlers[detail]();
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    }

    // Close popup on overlay click or close button (only bind once)
    if (!window._analyticsOverlayCloseBound) {
        window._analyticsOverlayCloseBound = true;
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.closest('#analyticsDetailClose')) {
                overlay.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }
}