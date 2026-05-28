// ==================== js/utils.js ====================

function generateId() {
    return 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

function formatCurrency(amount) {
    const sym = state.currency || '₹';
    const num = parseFloat(amount);
    const safeAmount = isNaN(num) ? 0 : num;
    return sym + ' ' + safeAmount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getCategoryColor(catName, type) {
    if (catName === 'Settlement') return '#34c759';
    if (catName === 'Lent') return '#ff9500';
    if (catName === 'Returned') return '#34c759';
    const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
    const found = cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
    return found?.color || '#8e8e93';
}

function getCategoryIcon(catName, type) {
    if (catName === 'Settlement') return '🤝';
    if (catName === 'Lent') return '📤';
    if (catName === 'Returned') return '📥';
    const cats = state.categories?.[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
    const found = cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
    return found?.icon ? escapeHTML(found.icon) : '📁';
}

function showToast(msg, icon = 'info-circle') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    // Limit on-screen toasts to 3 for better UX
    while (container.childElementCount >= 3) {
        const old = container.firstChild;
        // Clear pending removal timeout to prevent stale callbacks
        if (old._toastTimer) clearTimeout(old._toastTimer);
        old.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-${escapeHTML(icon)}" style="margin-right:6px;"></i> ${escapeHTML(msg)}`;
    container.appendChild(toast);
    
    toast._toastTimer = setTimeout(() => {
        toast._toastTimer = null;
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) toast.remove();
        }, { once: true });
    }, 2000);
}

let _confirmCleanup = null;

function showConfirm(title, msg, icon, onConfirm, requiredText = null) {
    const modal = document.getElementById('confirmModal');
    if (!modal) return;
    
    // Clean up previous listeners if modal was already open
    if (_confirmCleanup) {
        _confirmCleanup();
        _confirmCleanup = null;
    }
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    document.getElementById('confirmIcon').innerHTML = `<i class="fas fa-${escapeHTML(icon)}"></i>`;
    
    const input = document.getElementById('confirmInput');
    const okBtn = document.getElementById('confirmOk');
    
    if (input) {
        if (requiredText) {
            input.style.display = 'block';
            input.value = '';
            input.placeholder = `Type "${requiredText}"`;
            okBtn.disabled = true;
            input.oninput = () => {
                okBtn.disabled = input.value !== requiredText;
            };
        } else {
            input.style.display = 'none';
            okBtn.disabled = false;
            input.oninput = null;
        }
    }

    modal.style.display = 'flex';
    if (input && requiredText) input.focus();
    const cancelBtn = document.getElementById('confirmCancel');

    const handler = () => {
        modal.style.display = 'none';
        cleanup();
        onConfirm();
    };
    const cancelHandler = () => {
        modal.style.display = 'none';
        cleanup();
    };
    
    const cleanup = () => {
        okBtn.removeEventListener('click', handler);
        cancelBtn.removeEventListener('click', cancelHandler);
        _confirmCleanup = null;
    };
    
    _confirmCleanup = cleanup;
    okBtn.addEventListener('click', handler);
    cancelBtn.addEventListener('click', cancelHandler);
}

function generateReceiptNumber(dateStr) {
    if (!dateStr) return 'REC-000000-0000';
    const datePart = dateStr.replace(/-/g, '').slice(0, 6); // YYYYMM
    const count = state.transactions.filter(t => 
        (t.type === 'rent' || (t.type === 'expense' && t.category === 'House Rent')) && 
        t.receiptNo?.startsWith('REC-' + datePart)
    ).length + 1;
    return `REC-${datePart}-${String(count).padStart(4, '0')}`;
}

function formatPeriodMonth(monthStr) { // "2026-05" -> "May 2026"
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Utility: convert hex color to rgba (used by analytics charts)
function hexToRgba(hex, alpha) {
    let validHex = typeof hex === 'string' ? hex.trim() : '';
    if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(validHex)) {
        validHex = '#8e8e93'; // Fallback gray if malformed
    }
    if (validHex.length === 4) {
        validHex = '#' + validHex[1] + validHex[1] + validHex[2] + validHex[2] + validHex[3] + validHex[3];
    }
    const r = parseInt(validHex.slice(1, 3), 16),
          g = parseInt(validHex.slice(3, 5), 16),
          b = parseInt(validHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStringColor(str) {
    if (!str) return '#8e8e93';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Modern, pleasing palette — cohesive pastels for dark theme, rich tones for light theme
    const darkThemeColors = [
        '#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#A29BFE',
        '#55EFC4', '#FAB1A0', '#74B9FF', '#FF7675', '#81ECEC',
        '#DFE6E9', '#FFEAA7', '#B8E994', '#D6A2E8', '#78C2C2'
    ];
    const lightThemeColors = [
        '#5B4CC4', '#00856A', '#D4A017', '#C0392B', '#7C6FF7',
        '#00A878', '#E07B6B', '#2980B9', '#D64545', '#17A2A2',
        '#636E72', '#BF9A2A', '#5A9E3E', '#8E44AD', '#3D8B8B'
    ];
    
    const colors = state.theme === 'light' ? lightThemeColors : darkThemeColors;
    
    return colors[Math.abs(hash) % colors.length];
}

function getVisibleTransactions() {
    if (!state.transactions) return [];
    
    // MEMOIZATION: Cache the filtered result. Invalidate when transactions change.
    const txFingerprint = state.transactions.length + '_' + (state.transactions[0]?.id || '') + '_' + state.userRole;
    if (window._visibleTxsCache && window._visibleTxsFingerprint === txFingerprint) {
        return window._visibleTxsCache;
    }
    
    let result;
    if (state.userRole === 'admin') {
        result = state.transactions;
    } else {
        // For non-admin users, restrict to public/shared transaction types only
        result = state.transactions.filter(tx => 
            tx.type === 'groceries' || 
            tx.type === 'rent' ||
            tx.type === 'lent' ||
            tx.type === 'returned' ||
            tx.type === 'settlement' ||
            (tx.type === 'expense' && (tx.category === 'House Rent' || tx.category === 'Groceries'))
        );
    }
    
    window._visibleTxsCache = result;
    window._visibleTxsFingerprint = txFingerprint;
    return result;
}

// Call this whenever transactions are modified to bust the cache
function invalidateTxCache() {
    window._visibleTxsCache = null;
    window._visibleTxsFingerprint = null;
}

let _chartJsLoadPromise = null;
async function loadChartJs() {
    if (typeof window.Chart !== 'undefined') return true;
    if (_chartJsLoadPromise) return _chartJsLoadPromise;
    
    _chartJsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => { _chartJsLoadPromise = null; resolve(false); };
        document.head.appendChild(script);
    });
    return _chartJsLoadPromise;
}