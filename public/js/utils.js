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

// Subcategory icons — unique per subcategory name to avoid repetition
const SUBCATEGORY_ICONS = {
    // House Rent
    'House Rent': '🏠', 'Water Bill': '🚿', 'Electric Bill': '⚡', 'Motor Bill': '🏍️',
    // Groceries
    'Vegetables': '🥦', 'Fruits': '🍎', 'Fish': '🐟', 'Drinking Water': '🚰',
    'Meat': '🥩', 'Dairy & Eggs': '🥛', 'Grains': '🌾', 'Snacks': '🍿',
    'Beverages': '🥤', 'Pantry & Spices': '🧂', 'Household': '🧹',
    // Food
    'Dining Out': '🍽️', 'Delivery & Takeout': '📦', 'Cafes & Coffee': '☕',
    'Work Lunch': '🥪', 'Fast Food': '🍔',
    // Transport
    'Fuel': '⛽', 'Public Transport': '🚌', 'Uber': '🚗', 'Bike & Car Maintenance': '🔧',
    'Parking': '🅿️', 'Bike & Car Wash': '🧽', 'Vehicle Insurance': '🛡️',
    'Tolls': '🛣️', 'Flights': '✈️',
    // Entertainment
    'Movies': '🎬', 'Games': '🎮', 'Events': '🎪', 'Subscriptions': '📺', 'Hobbies': '🎨',
    // Utilities
    'Electricity': '💡', 'Water': '💧', 'Internet': '🌐', 'Gas': '🔥',
    'Phone Bill': '📱', 'Trash/Garbage': '🗑️',
    // Shopping
    'Clothing': '👕', 'Electronics': '💻', 'Home Appliances': '🔌',
    'Furniture & Decor': '🛋️', 'Kitchen Appliances': '🍳', 'Gifts': '🎁', 'Accessories': '⌚',
    // Healthcare
    'Doctor': '🩺', 'Medicine': '💊', 'Health Insurance': '🏥', 'Gym': '🏋️',
    'Dental': '🦷', 'Vision': '👓',
    // Education
    'Tuition': '📖', 'Books': '📚', 'Courses': '📝', 'Admission fees': '🎓', 'Stationery': '✏️',
    // Personal Care
    'Haircut': '💇', 'Cosmetics': '💄', 'Hair Care': '🧴', 'Body Care': '🧼',
    'Skin Care': '✨', 'Spa': '🧖',
    // Debt & Loans
    'Credit Card': '💳', 'EMI': '📋', 'Personal Loan': '💰', 'Home Loan': '🔑',
    'Car Loan': '🚙', 'Business Loan': '💼',
    // Marup
    'Rohen': '👥', 'Echan': '🤝', 'Abe Phanek': '🗣️',
    // Miscellaneous
    'Other Expenses': '📄', 'Taxes': '🏛️', 'Home Transfer': '🚚',
    'Donations': '❤️', 'Fines': '⚠️', 'Landing': '📤',
};

function getSubcategoryIcon(subcatName, catName) {
    if (!subcatName) return null;
    // Handle grouped subcategories (e.g. "Produce: Vegetables")
    const cleanName = subcatName.includes(':') ? subcatName.split(':').slice(1).join(':').trim() : subcatName.trim();
    // Check stored subcategory icons first (user-customized icons from settings)
    if (catName && state.categories) {
        for (const type of ['expense', 'groceries']) {
            const cats = state.categories[type] ? Object.values(state.categories[type]).filter(Boolean) : [];
            const cat = cats.find(c => c.name === catName);
            if (cat && cat.subcategoryIcons && cat.subcategoryIcons[cleanName]) {
                return cat.subcategoryIcons[cleanName];
            }
        }
    }
    // Fall back to the hardcoded map
    return SUBCATEGORY_ICONS[cleanName] || null;
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
    
    // High-contrast palette — hues spaced evenly across the colour wheel
    const darkThemeColors = [
        '#FF6B6B', '#00B894', '#0984E3', '#FDCB6E', '#6C5CE7',
        '#00CEC9', '#FD79A8', '#55EFC4', '#FF9FF3', '#E17055',
        '#74B9FF', '#1DD1A1', '#FF6348', '#A29BFE', '#48DBFB',
        '#FAB1A0', '#54A0FF', '#FF9F43', '#5F27CD', '#00D2D3'
    ];
    const lightThemeColors = [
        '#D63031', '#00A878', '#0652DD', '#F39C12', '#5B4CC4',
        '#00897B', '#E84393', '#00B894', '#6C3483', '#D35400',
        '#0984E3', '#00695C', '#C0392B', '#7C6FF7', '#00CEC9',
        '#E07B6B', '#1B6EC2', '#E67E22', '#4A148C', '#00838F'
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