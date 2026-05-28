// js/firebase-sync.js

// 1. Import Firebase functions from the npm package
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, update, onValue, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, deleteUser, GoogleAuthProvider, signInWithPopup, linkWithPopup, unlink } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";


// 2. Paste YOUR config object here
const firebaseConfig = {
  apiKey: "AIzaSyDfxpmyaBX6Goe7YJk0YRWKQgiTfEn8wrs",
  authDomain: "myfinancehub-78207.firebaseapp.com",
  databaseURL: "https://myfinancehub-78207-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myfinancehub-78207",
  storageBucket: "myfinancehub-78207.firebasestorage.app",
  messagingSenderId: "746078294497",
  appId: "1:746078294497:web:4aaa7c5cb503a8d82ac2a0"
};

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

let unsubscribeNodes = [];
let unsubscribePublicTxs = null;
let unsubscribePrivateTxs = null;
let unsubscribeConnectionListener = null;

// 6. Production Sync Functions
// Track writes to prevent echo-chamber re-read
let _pendingWriteIds = new Set();

export function saveStateToFirebase(appState) {
    if (!auth.currentUser) return Promise.resolve(); // Prevent writing if not authenticated

    const updates = {};
    
    const currentPublicIds = new Set();
    const currentPrivateIds = new Set();

    if (appState.transactions) {
        appState.transactions.forEach(tx => {
            if (tx && tx.id) {
                // Public transactions: groceries, rent, lent, returned, settlement
                const isPublicType = tx.type === 'groceries' || tx.type === 'rent' ||
                                     tx.type === 'lent' || tx.type === 'returned' || tx.type === 'settlement';
                if (isPublicType || (tx.type === 'expense' && tx.category === 'House Rent')) {
                    updates[`/appState/transactions_public/${tx.id}`] = tx;
                    currentPublicIds.add(tx.id);
                } else if (tx.type === 'expense') {
                    // All expense transactions written to private node (admin-only visibility)
                    updates[`/appState/transactions_private/${tx.id}`] = tx;
                    currentPrivateIds.add(tx.id);
                }
                // Note: 'income' type transactions are not currently synced
            }
        });
    }

    // Compare with the memory cache to identify and delete removed transactions
    if (window._firebasePublicCache) {
        Object.keys(window._firebasePublicCache).forEach(id => {
            if (!currentPublicIds.has(id)) updates[`/appState/transactions_public/${id}`] = null;
        });
    }
    if (window._firebasePrivateCache) {
        Object.keys(window._firebasePrivateCache).forEach(id => {
            if (!currentPrivateIds.has(id)) updates[`/appState/transactions_private/${id}`] = null;
        });
    }

    const housesObj = {};
    if (appState.houses) {
        appState.houses.forEach(house => {
            if (house && house.id) housesObj[house.id] = house;
        });
    }

    // Non-transactional data should only be written by admin.
    // OPTIMIZATION: Only write settings that actually changed (not all on every save)
    if (appState.userRole === 'admin') {
        if (!window._lastWrittenSettings || JSON.stringify(window._lastWrittenSettings.houses) !== JSON.stringify(housesObj)) {
            updates['/appState/houses'] = housesObj;
        }
        if (!window._lastWrittenSettings || JSON.stringify(window._lastWrittenSettings.categories) !== JSON.stringify(appState.categories || {})) {
            updates['/appState/categories'] = appState.categories || {};
        }
        if (!window._lastWrittenSettings || JSON.stringify(window._lastWrittenSettings.budgets) !== JSON.stringify(appState.budgets || {})) {
            updates['/appState/budgets'] = appState.budgets || {};
        }
        updates['/appState/recurringTemplates'] = appState.recurringTemplates || [];
        updates['/appState/payers'] = appState.payers || [];
        updates['/appState/currency'] = appState.currency || '₹';
        updates['/appState/electricRate'] = appState.electricRate || 8;
        updates['/appState/transactions'] = null; // WIPE LEGACY DATA
        
        // Remember what we wrote
        window._lastWrittenSettings = {
            houses: JSON.parse(JSON.stringify(housesObj)),
            categories: JSON.parse(JSON.stringify(appState.categories || {})),
            budgets: JSON.parse(JSON.stringify(appState.budgets || {}))
        };
    }

    // Generate a unique write ID for echo prevention (more reliable than timestamps)
    const writeId = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    _pendingWriteIds.add(writeId);
    // Clean up old write IDs (keep last 20)
    if (_pendingWriteIds.size > 20) {
        const arr = Array.from(_pendingWriteIds);
        _pendingWriteIds = new Set(arr.slice(arr.length - 20));
    }
    
    updates['/appState/lastUpdated'] = Date.now();
    updates['/appState/lastWriteId'] = writeId;

    // Skip write if nothing to update (only lastUpdated/writeId)
    if (Object.keys(updates).length <= 2) return Promise.resolve();

    return update(ref(database), updates).then(() => {
        // Keep writeId in pending set for echo prevention
        window._firebasePendingWriteIds = _pendingWriteIds;
    }).catch((error) => {
        _pendingWriteIds.delete(writeId);
        window._firebasePendingWriteIds = _pendingWriteIds;
        console.error("Firebase save error: ", error.message);
        throw error;
    });
}

export function listenToFirebaseState(onDataReceived, userRole) {
    if (!auth.currentUser) return; // Prevent listening if not authenticated    
    
    detachFirebaseListeners();
    
    let publicCache = {};
    let privateCache = {};
    let otherState = {};
    let mergePending = false;
    
    const mergeAndCallback = () => {
        // Debounce: batch multiple rapid onValue firings into one callback
        if (mergePending) return;
        mergePending = true;
        setTimeout(() => {
            mergePending = false;
            const mergedTxs = {...publicCache, ...privateCache};
            const fullState = { ...otherState };

            fullState.transactions = Object.values(mergedTxs).sort((a, b) => {
                const dateA = new Date(a.createdAt || a.date).getTime();
                const dateB = new Date(b.createdAt || b.date).getTime();
                return dateB - dateA;
            });

            if (otherState.houses && typeof otherState.houses === 'object' && !Array.isArray(otherState.houses)) {
                fullState.houses = Object.values(otherState.houses).filter(Boolean);
            } else if (Array.isArray(otherState.houses)) {
                fullState.houses = otherState.houses;
            } else {
                fullState.houses = [];
            }
            
            // Include lastWriteId for echo prevention
            fullState._cloudWriteId = otherState.lastWriteId || null;
            fullState._cloudLastUpdated = otherState.lastUpdated || 0;
            
            onDataReceived(fullState);
        }, 150); // 150ms debounce for listener merges
    };

    // Listen to individual nodes instead of root 'appState' to avoid PERMISSION_DENIED for non-admins
    const settingsNodes = ['houses', 'categories', 'budgets', 'recurringTemplates', 'payers', 'currency', 'electricRate', 'lastUpdated', 'lastWriteId'];
    settingsNodes.forEach(node => {
        const nodeRef = ref(database, `appState/${node}`);
        const unsub = onValue(nodeRef, (snapshot) => {
            otherState[node] = snapshot.val() || null;
            mergeAndCallback();
        });
        unsubscribeNodes.push(unsub);
    });

    // Listener for public transactions (all users)
    const publicTxsRef = ref(database, 'appState/transactions_public');
    unsubscribePublicTxs = onValue(publicTxsRef, (snapshot) => {
        publicCache = snapshot.val() || {};
        window._firebasePublicCache = publicCache;
        mergeAndCallback();
    });

    // Listener for private transactions (admin only, but also anyone who might have been admin)
    // Always listen to private node — Firebase rules will restrict access server-side
    const privateTxsRef = ref(database, 'appState/transactions_private');
    unsubscribePrivateTxs = onValue(privateTxsRef, (snapshot) => {
        privateCache = snapshot.val() || {};
        window._firebasePrivateCache = privateCache;
        mergeAndCallback();
    });
}

export function detachFirebaseListeners() {
    unsubscribeNodes.forEach(unsub => unsub());
    unsubscribeNodes = [];
    if (unsubscribePublicTxs) { unsubscribePublicTxs(); unsubscribePublicTxs = null; }
    if (unsubscribePrivateTxs) { unsubscribePrivateTxs(); unsubscribePrivateTxs = null; }
    // Also detach connection listener to prevent stale callbacks
    if (unsubscribeConnectionListener) { unsubscribeConnectionListener(); unsubscribeConnectionListener = null; }
    // Clear memory caches
    window._firebasePublicCache = null;
    window._firebasePrivateCache = null;
}

// NEW: Listen for real-time connection status
export function listenToConnectionStatus(onStatusChanged) {
    const connectedRef = ref(database, '.info/connected');
    
    if (unsubscribeConnectionListener) {
        unsubscribeConnectionListener(); // Detach existing
        unsubscribeConnectionListener = null;
    }
    
    unsubscribeConnectionListener = onValue(connectedRef, (snap) => {
        onStatusChanged(snap.val() === true);
    });
}

// NEW: Dynamically check if user is an Admin from the database
export async function checkUserRole(user) {
    if (!user) return 'user';
    const encodedEmail = user.email ? user.email.toLowerCase().replace(/\./g, ',') : '';
    try {
        const emailSnap = await get(ref(database, `admins/emails/${encodedEmail}`));
        const uidSnap = await get(ref(database, `admins/uids/${user.uid}`));
        return (emailSnap.val() === true || uidSnap.val() === true) ? 'admin' : 'user';
    } catch (e) { return 'user'; }
}

// NEW: Load user profile from Firebase
export async function loadUserProfile(user) {
    if (!user) return null;
    try {
        const snap = await get(ref(database, `profiles/${user.uid}`));
        return snap.val() || null;
    } catch (e) { return null; }
}

// NEW: Save user profile to Firebase
export async function saveUserProfile(user, profileData) {
    if (!user) return Promise.reject('Not authenticated');
    try {
        await update(ref(database, `profiles/${user.uid}`), profileData);
        return true;
    } catch (e) {
        console.error('Profile save error:', e.message);
        throw e;
    }
}

// NEW: Link Google account to current email/password account
export async function linkGoogleAccount() {
    if (!auth.currentUser) throw new Error('Not logged in');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        const result = await linkWithPopup(auth.currentUser, provider);
        return result;
    } catch (e) {
        console.error('Link Google error:', e.message);
        throw e;
    }
}

// NEW: Unlink Google provider from current account
export async function unlinkGoogleAccount() {
    if (!auth.currentUser) throw new Error('Not logged in');
    try {
        await unlink(auth.currentUser, GoogleAuthProvider.PROVIDER_ID);
        return true;
    } catch (e) {
        console.error('Unlink Google error:', e.message);
        throw e;
    }
}

// NEW: Check if user has Google linked
export function hasGoogleLinked() {
    if (!auth.currentUser) return false;
    return auth.currentUser.providerData.some(
        p => p.providerId === GoogleAuthProvider.PROVIDER_ID
    );
}

// 7. Expose functions globally so storage.js can use them
window.saveStateToFirebase = saveStateToFirebase;
window.listenToFirebaseState = listenToFirebaseState;
window.detachFirebaseListeners = detachFirebaseListeners;
window.listenToConnectionStatus = listenToConnectionStatus;
window.checkUserRole = checkUserRole;
window.loadUserProfile = loadUserProfile;
window.saveUserProfile = saveUserProfile;
window.linkGoogleAccount = linkGoogleAccount;
window.unlinkGoogleAccount = unlinkGoogleAccount;
window.hasGoogleLinked = hasGoogleLinked;

// 8. Auth logic: Only sync if logged in
window.showLoginUI = (isMandatory = false) => {
    if (document.getElementById('firebaseLoginModal')) return;
    const modal = document.createElement('div');
    modal.id = 'firebaseLoginModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);animation:fbBackdropFade 0.3s ease-out;';
    modal.innerHTML = `
        <style>
            @keyframes fbBackdropFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fbModalPop { from { opacity: 0; transform: scale(0.95) translateY(15px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        </style>
        <div class="glass-card" style="width:90%;max-width:320px;padding:24px;text-align:center;animation:fbModalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <h3 id="fbLoginTitle" style="margin-top:0;margin-bottom:8px;">${isMandatory ? 'Home Finlytics' : 'Cloud Sync'}</h3>
            <p id="fbLoginDesc" style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">${isMandatory ? 'Log in to access your dashboard.' : 'Log in to enable real-time Firebase sync.'}</p>
            <input type="email" id="fbLoginEmail" placeholder="Email Address" class="form-input" style="margin-bottom:12px;width:100%;box-sizing:border-box;">
            <div style="position:relative; margin-bottom:8px;">
                <input type="password" id="fbLoginPwd" placeholder="Password" class="form-input" style="width:100%;box-sizing:border-box;padding-right:32px;">
                <i class="fas fa-eye fb-toggle-pwd" data-target="fbLoginPwd" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--text-tertiary);"></i>
            </div>
            <div id="fbLoginConfirmPwdWrap" style="position:relative; margin-bottom:8px; display:none;">
                <input type="password" id="fbLoginConfirmPwd" placeholder="Confirm Password" class="form-input" style="width:100%;box-sizing:border-box;padding-right:32px;">
                <i class="fas fa-eye fb-toggle-pwd" data-target="fbLoginConfirmPwd" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--text-tertiary);"></i>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <a href="#" id="fbToggleMode" style="font-size: 0.8rem; color: var(--accent); text-decoration: none;">Create Account</a>
                <a href="#" id="fbForgotPassword" style="font-size: 0.8rem; color: var(--text-secondary); text-decoration: none;">Forgot Password?</a>
            </div>
            <div style="display:flex;gap:10px;">
                ${!isMandatory ? '<button id="fbLoginCancel" class="btn btn-secondary" style="flex:1;">Cancel</button>' : ''}
                <button id="fbLoginBtn" class="btn btn-primary" style="flex:1;">Log In</button>
            </div>
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
                <button id="fbGoogleSignInBtn" class="btn btn-secondary btn-full" style="display:flex;align-items:center;justify-content:center;gap:8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Sign in with Google
                </button>
            </div>
            <p id="fbLoginError" style="color:var(--danger);font-size:0.8rem;margin-top:12px;display:none;"></p>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.fb-toggle-pwd').forEach(icon => {
        icon.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input.type === 'password') {
                input.type = 'text';
                e.target.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                e.target.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });

    let isSignUpMode = false;

    document.getElementById('fbToggleMode').addEventListener('click', (e) => {
        e.preventDefault();
        isSignUpMode = !isSignUpMode;
        
        const btn = document.getElementById('fbLoginBtn');
        const title = document.getElementById('fbLoginTitle');
        const desc = document.getElementById('fbLoginDesc');
        const toggleBtn = document.getElementById('fbToggleMode');
        const forgotPwd = document.getElementById('fbForgotPassword');
        const confirmPwdWrap = document.getElementById('fbLoginConfirmPwdWrap');
        
        if (isSignUpMode) {
            btn.textContent = 'Sign Up';
            title.textContent = 'Create Account';
            desc.textContent = 'Sign up for a new account.';
            toggleBtn.textContent = 'Back to Log In';
            forgotPwd.style.display = 'none';
            confirmPwdWrap.style.display = 'block';
        } else {
            btn.textContent = 'Log In';
            title.textContent = isMandatory ? 'Home Finlytics' : 'Cloud Sync';
            desc.textContent = isMandatory ? 'Log in to access your dashboard.' : 'Log in to enable real-time Firebase sync.';
            toggleBtn.textContent = 'Create Account';
            forgotPwd.style.display = 'inline';
            confirmPwdWrap.style.display = 'none';
        }
    });

    document.getElementById('fbLoginBtn').addEventListener('click', () => {
        const email = document.getElementById('fbLoginEmail').value;
        const pwd = document.getElementById('fbLoginPwd').value;
        const errEl = document.getElementById('fbLoginError');
        errEl.style.display = 'none';
        
        if (!email || !pwd) {
            errEl.textContent = 'Please enter both email and password.';
            errEl.style.display = 'block';
            return;
        }

        if (isSignUpMode) {
            const confirmPwdVal = document.getElementById('fbLoginConfirmPwd').value;
            if (pwd !== confirmPwdVal) {
                errEl.textContent = 'Passwords do not match.';
                errEl.style.display = 'block';
                return;
            }
            if (pwd.length < 6) {
                errEl.textContent = 'Password must be at least 6 characters long.';
                errEl.style.display = 'block';
                return;
            }
            createUserWithEmailAndPassword(auth, email, pwd)
                .then(() => {
                    modal.remove();
                    if (typeof showToast === 'function') showToast('Account created and logged in!', 'user-plus');
                    // Auto-check admin role for newly created account
                    if (auth.currentUser && typeof window.checkUserRole === 'function') {
                        window.checkUserRole(auth.currentUser).then(role => {
                            if (typeof window.handleAuthStateChanged === 'function') {
                                // Force re-evaluate with fresh role
                                window.handleAuthStateChanged(auth.currentUser);
                            }
                        });
                    }
                })
                .catch(err => {
                    errEl.textContent = err.message;
                    errEl.style.display = 'block';
                });
        } else {
            signInWithEmailAndPassword(auth, email, pwd)
                .then(() => {
                    modal.remove();
                    if (typeof showToast === 'function') showToast('Logged in to Firebase!', 'cloud');
                })
                .catch(err => {
                    errEl.textContent = err.message;
                    errEl.style.display = 'block';
                });
        }
    });

    // Google Sign-In handler
    document.getElementById('fbGoogleSignInBtn')?.addEventListener('click', () => {
        const errEl = document.getElementById('fbLoginError');
        errEl.style.display = 'none';
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        
        signInWithPopup(auth, provider)
            .then(() => {
                modal.remove();
                if (typeof showToast === 'function') showToast('Signed in with Google!', 'cloud');
            })
            .catch(err => {
                // Don't show error for popup-closed-by-user
                if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
                errEl.textContent = err.message;
                errEl.style.display = 'block';
            });
    });

    document.getElementById('fbForgotPassword').addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('fbLoginEmail').value.trim();
        const errEl = document.getElementById('fbLoginError');
        errEl.style.display = 'none';

        if (!email) {
            errEl.textContent = 'Please enter your email address above to reset your password.';
            errEl.style.display = 'block';
            return;
        }

        sendPasswordResetEmail(auth, email)
            .then(() => {
                if (typeof showToast === 'function') showToast('Password reset email sent!', 'envelope');
            })
            .catch(err => {
                errEl.textContent = err.message;
                errEl.style.display = 'block';
            });
    });

    if (!isMandatory) {
        document.getElementById('fbLoginCancel').addEventListener('click', () => modal.remove());
    }
};

onAuthStateChanged(auth, (user) => {
    if (typeof window.handleAuthStateChanged === 'function') {
        window.handleAuthStateChanged(user);
    }
});

// 9. Make the sync button clickable to show the login UI or sign out
function setupAuthButton() {
    const syncBtn = document.getElementById('headerSyncBtn');
    const settingsSignOutBtn = document.getElementById('settingsSignOutBtn');
    const settingsResetPwdBtn = document.getElementById('settingsResetPwdBtn');
    const settingsDeleteAccountBtn = document.getElementById('settingsDeleteAccountBtn');
    const settingsSignInBtn = document.getElementById('settingsSignInBtn');

    const handleSignOut = () => {
        // Use app's showConfirm if available, fallback to native confirm
        const doSignOut = () => {
            auth.signOut().then(() => {
                localStorage.removeItem('home_finlytics_state');
                if (typeof showToast === 'function') showToast('Signed out. Data cleared for privacy.', 'info-circle');
            });
        };
        if (typeof showConfirm === 'function') {
            showConfirm('Sign Out', 'You are logged into Firebase. Do you want to sign out? Your local data will be cleared for privacy.', 'sign-out-alt', doSignOut);
        } else if (confirm("You are logged into Firebase. Do you want to sign out? Your local data will be cleared for privacy.")) {
            doSignOut();
        }
    };

    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            if (!auth.currentUser) {
                window.showLoginUI();
            } else {
                // If there are unsynced changes, make the cloud icon act as a global "Retry Sync" button
                const badge = document.getElementById('dashboardSyncBadge');
                if (badge && badge.style.display !== 'none') {
                    if (typeof window.triggerManualSync === 'function') {
                        window.triggerManualSync();
                        return;
                    }
                }
                handleSignOut();
            }
        });
    }

    if (settingsSignOutBtn) {
        settingsSignOutBtn.addEventListener('click', handleSignOut);
    }

    if (settingsResetPwdBtn) {
        settingsResetPwdBtn.addEventListener('click', () => {
            if (auth.currentUser && auth.currentUser.email) {
                const doReset = () => {
                    sendPasswordResetEmail(auth, auth.currentUser.email)
                        .then(() => {
                            if (typeof showToast === 'function') showToast('Password reset email sent!', 'envelope');
                        })
                        .catch(err => {
                            if (typeof showToast === 'function') showToast(err.message, 'times-circle');
                        });
                };
                if (typeof showConfirm === 'function') {
                    showConfirm('Reset Password', `Send a password reset email to ${auth.currentUser.email}?`, 'key', doReset);
                } else if (confirm(`Send a password reset email to ${auth.currentUser.email}?`)) {
                    doReset();
                }
            }
        });
    }

    if (settingsDeleteAccountBtn) {
        settingsDeleteAccountBtn.addEventListener('click', () => {
            if (auth.currentUser) {
                checkUserRole(auth.currentUser).then(role => {
                    if (role !== 'admin') {
                        if (typeof showToast === 'function') showToast('Only admins can delete accounts.', 'exclamation-triangle');
                        return;
                    }
                    const doDelete = () => {
                        deleteUser(auth.currentUser).then(() => {
                            localStorage.removeItem('home_finlytics_state');
                            if (typeof showToast === 'function') showToast('Account deleted successfully.', 'check-circle');
                        }).catch(err => {
                            if (err.code === 'auth/requires-recent-login') {
                                if (typeof showToast === 'function') showToast('Please sign out and log back in to verify your identity before deleting your account.', 'times-circle');
                            } else {
                                if (typeof showToast === 'function') showToast(err.message, 'times-circle');
                            }
                        });
                    };
                    if (typeof showConfirm === 'function') {
                        showConfirm('Delete Account', 'DANGER: Are you sure you want to permanently delete your Firebase account? This cannot be undone.', 'user-times', doDelete);
                    } else if (confirm("DANGER: Are you sure you want to permanently delete your Firebase account? This cannot be undone.")) {
                        doDelete();
                    }
                });
            }
        });
    }

    if (settingsSignInBtn) {
        settingsSignInBtn.addEventListener('click', () => {
            if (!auth.currentUser && typeof window.showLoginUI === 'function') window.showLoginUI();
        });
    }
}

// Because module scripts are deferred, the DOM might already be loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthButton);
} else {
    setupAuthButton();
}
