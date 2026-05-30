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

// NEW: Compact currency format for small screens (₹ 1.2K, ₹ 5.6L, ₹ 1.5Cr)
function formatCurrencyCompact(amount) {
    const sym = state.currency || '₹';
    const num = parseFloat(amount);
    if (isNaN(num)) return sym + ' 0';
    const abs = Math.abs(num);
    if (abs >= 10000000) { // 1 Cr+
        return sym + ' ' + (num / 10000000).toFixed(1) + 'Cr';
    }
    if (abs >= 100000) { // 1 Lakh+
        return sym + ' ' + (num / 100000).toFixed(1) + 'L';
    }
    if (abs >= 1000) { // 1 Thousand+
        return sym + ' ' + (num / 1000).toFixed(1) + 'K';
    }
    return sym + ' ' + num.toFixed(0);
}

// NEW: Detect if we're on a small screen (≤400px) where compact format is needed
function isSmallScreen() {
    return window.innerWidth <= 400;
}

// NEW: Smart format — compact on small screens, full otherwise
function formatCurrencySmart(amount) {
    return isSmallScreen() ? formatCurrencyCompact(amount) : formatCurrency(amount);
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
    'Donations': '❤️', 'Fines': '⚠️',
    // Landing
    'Money Lent': '💰', 'Returned': '✅', 'Written Off': '❌',
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
    const currentUserId = getCurrentUserId();
    const txFingerprint = state.transactions.length + '_' + (state.transactions[0]?.id || '') + '_' + state.userRole + '_' + currentUserId;
    if (window._visibleTxsCache && window._visibleTxsFingerprint === txFingerprint) {
        return window._visibleTxsCache;
    }
    
    let result;
    // Resolve current user's name for split-bill matching
    const currentUserName = (state.currentUser?.name || state.userProfile?.displayName || '').toLowerCase();
    
    if (state.userRole === 'admin') {
        // Admin sees all transactions for management, BUT rent is filtered by linked houses
        const userLinkedHouseIds = getCurrentUserHouseIds();
        result = state.transactions.filter(tx => {
            // Split bills where admin is a participant — always visible
            if (tx.splitWith) {
                const splitArr = Array.isArray(tx.splitWith) ? tx.splitWith : [tx.splitWith];
                if (splitArr.some(s => s.toLowerCase() === currentUserName)) return true;
            }
            // Filter OUT rent transactions for houses NOT linked to this admin
            if (tx.type === 'rent' || (tx.type === 'expense' && tx.category === 'House Rent')) {
                // Include if no houseId (legacy) OR houseId is in user's linked houses
                if (!tx.houseId) return true;
                return userLinkedHouseIds.includes(tx.houseId);
            }
            return true; // All other transactions visible to admin
        });
    } else {
        // USER-CENTRIC MODEL: Each user sees:
        // 1. Their own expense transactions (userId === currentUserId)
        // 2. Split bills where they are a participant
        // 3. ALL groceries transactions (shared kitchen)
        // 4. Rent transactions for houses linked to them
        // 5. Lent/returned/settlement (shared)
        const userId = currentUserId;
        const userLinkedHouseIds = getCurrentUserHouseIds();
        
        result = state.transactions.filter(tx => {
            // Own expenses
            if (tx.userId === userId) return true;
            // Split bills where current user is a participant
            if (tx.splitWith) {
                const splitArr = Array.isArray(tx.splitWith) ? tx.splitWith : [tx.splitWith];
                if (splitArr.some(s => s.toLowerCase() === currentUserName)) return true;
            }
            // Shared groceries (visible to all users in the group)
            if (tx.type === 'groceries') return true;
            if (tx.type === 'expense' && tx.category === 'Groceries') return true;
            // Shared rent for user's linked houses
            if ((tx.type === 'rent' || (tx.type === 'expense' && tx.category === 'House Rent')) && 
                tx.houseId && userLinkedHouseIds.includes(tx.houseId)) return true;
            // Shared transactions (lent, returned, settlement)
            if (tx.type === 'lent' || tx.type === 'returned' || tx.type === 'settlement') return true;
            // Transactions with no userId (legacy data) — show if type is shared
            if (!tx.userId && (tx.type === 'groceries' || tx.type === 'lent' || tx.type === 'returned' || tx.type === 'settlement')) return true;
            return false;
        });
    }
    
    window._visibleTxsCache = result;
    window._visibleTxsFingerprint = txFingerprint;
    return result;
}

// NEW: Get current user's unique ID
function getCurrentUserId() {
    if (state.currentUser?.uid) return state.currentUser.uid;
    if (state.currentUser?.email) return state.currentUser.email.toLowerCase();
    if (state.userProfile?.email) return state.userProfile.email.toLowerCase();
    return 'anonymous';
}

// NEW: Get house IDs linked to the current user
function getCurrentUserHouseIds() {
    const userId = getCurrentUserId();
    const userEmail = (state.currentUser?.email || state.userProfile?.email || '').toLowerCase();
    const userName = (state.currentUser?.name || state.userProfile?.displayName || '').toLowerCase();
    const emailPrefix = userEmail.split('@')[0].toLowerCase();
    const firstName = userName.split(' ')[0];
    
    return (state.houses || []).filter(h => {
        if (!h) return false;
        // Check linkedUsers array with multiple match strategies
        if (h.linkedUsers && Array.isArray(h.linkedUsers)) {
            const match = h.linkedUsers.some(lu => {
                if (typeof lu !== 'string') return false;
                const luLower = lu.toLowerCase().trim();
                // Direct match against UID, email, name
                if (luLower === userId.toLowerCase()) return true;
                if (luLower === userEmail) return true;
                if (luLower === userName) return true;
                // Match against email prefix (e.g. "esther" from "esther@email.com")
                if (emailPrefix && emailPrefix.length >= 3 && luLower === emailPrefix) return true;
                // Partial: "Esther Konjengbam" contains "esther"
                if (firstName && firstName.length >= 3 && luLower.includes(firstName)) return true;
                if (userName && userName.length >= 3 && luLower.includes(userName)) return true;
                // Reverse: stored linkedUser "esther konjengbam" matches current user name
                if (userName && userName.length >= 3 && luLower.includes(userName)) return true;
                return false;
            });
            if (match) return true;
        }
        // Match by owner/tenant name
        if (h.owner && userName && h.owner.toLowerCase().trim() === userName) return true;
        if (h.tenant && userName && h.tenant.toLowerCase().trim() === userName) return true;
        if (h.owner && firstName && h.owner.toLowerCase().includes(firstName)) return true;
        if (h.tenant && firstName && h.tenant.toLowerCase().includes(firstName)) return true;
        return false;
    }).map(h => h.id).filter(Boolean);
}

// NEW: Get all user profiles from the group for display
function getUserGroupMembers() {
    if (state.userGroup?.members && state.userGroup.members.length > 0) {
        return state.userGroup.members;
    }
    // Fallback: build from payers and profiles
    const members = [];
    if (state.currentUser) {
        members.push({
            uid: state.currentUser.uid || getCurrentUserId(),
            displayName: state.currentUser.name || state.userProfile?.displayName || 'Me',
            email: state.currentUser.email || ''
        });
    }
    // Add other payers as group members — use displayName as uid for consistent matching
    (state.payers || []).forEach(p => {
        const name = p.trim();
        if (!members.some(m => m.displayName.toLowerCase() === name.toLowerCase())) {
            members.push({ uid: name, displayName: name, email: '' });
        }
    });
    return members;
}

// NEW: Get transactions for a specific user (for budget/spender calculations)
function getUserTransactions(userId) {
    if (!state.transactions) return [];
    return state.transactions.filter(tx => {
        if (!tx.userId) return tx.payer && tx.payer.toLowerCase() === userId.toLowerCase();
        return tx.userId.toLowerCase() === userId.toLowerCase();
    });
}

// NEW: Get shared groceries transactions (all users can see)
function getSharedGroceriesTransactions() {
    if (!state.transactions) return [];
    return state.transactions.filter(tx => 
        tx.type === 'groceries' || 
        (tx.type === 'expense' && tx.category === 'Groceries')
    );
}

// Call this whenever transactions are modified to bust the cache
function invalidateTxCache() {
    window._visibleTxsCache = null;
    window._visibleTxsFingerprint = null;
}

let _chartJsLoadPromise = null;
let _chartJsRetries = 0;
const MAX_CHARTJS_RETRIES = 3;
async function loadChartJs() {
    if (typeof window.Chart !== 'undefined') return true;
    if (_chartJsLoadPromise) return _chartJsLoadPromise;
    
    _chartJsLoadPromise = new Promise((resolve) => {
        function tryLoad() {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            // Set a timeout for slow connections (mobile data)
            const timeout = setTimeout(() => {
                if (script.parentNode) script.remove();
                _chartJsRetries++;
                if (_chartJsRetries < MAX_CHARTJS_RETRIES) {
                    console.warn('Chart.js load timeout, retrying... (' + _chartJsRetries + '/' + MAX_CHARTJS_RETRIES + ')');
                    tryLoad();
                } else {
                    console.warn('Chart.js failed to load after ' + MAX_CHARTJS_RETRIES + ' retries');
                    _chartJsLoadPromise = null;
                    _chartJsRetries = 0;
                    resolve(false);
                }
            }, 8000);
            script.onload = () => {
                clearTimeout(timeout);
                _chartJsRetries = 0;
                resolve(true);
            };
            script.onerror = () => {
                clearTimeout(timeout);
                _chartJsRetries++;
                if (_chartJsRetries < MAX_CHARTJS_RETRIES) {
                    console.warn('Chart.js load failed, retrying... (' + _chartJsRetries + '/' + MAX_CHARTJS_RETRIES + ')');
                    tryLoad();
                } else {
                    _chartJsLoadPromise = null;
                    _chartJsRetries = 0;
                    resolve(false);
                }
            };
            document.head.appendChild(script);
        }
        tryLoad();
    });
    return _chartJsLoadPromise;
}