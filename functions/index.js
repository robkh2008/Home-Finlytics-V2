const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Only allow admin users to call these functions
async function verifyAdmin(context) {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    const uidSnap = await admin.database().ref(`admins/uids/${context.auth.uid}`).once('value');
    const email = context.auth.token.email || '';
    const encodedEmail = email.toLowerCase().replace(/\./g, ',');
    const emailSnap = await admin.database().ref(`admins/emails/${encodedEmail}`).once('value');
    
    if (uidSnap.val() !== true && emailSnap.val() !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }
    return true;
}

// List all registered users
exports.adminListUsers = functions.https.onCall(async (data, context) => {
    await verifyAdmin(context);
    
    const users = [];
    let pageToken;
    do {
        const result = await admin.auth().listUsers(1000, pageToken);
        result.users.forEach(user => {
            users.push({
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
                provider: user.providerData.map(p => p.providerId).join(', '),
                created: user.metadata.creationTime,
                lastSignIn: user.metadata.lastSignInTime,
                disabled: user.disabled
            });
        });
        pageToken = result.pageToken;
    } while (pageToken);
    
    // Get admin status and profiles for all users
    const [adminsSnap, profilesSnap] = await Promise.all([
        admin.database().ref('admins').once('value'),
        admin.database().ref('profiles').once('value')
    ]);
    
    const admins = adminsSnap.val() || {};
    const profiles = profilesSnap.val() || {};
    
    // Enrich users with admin status and profile
    return users.map(user => ({
        ...user,
        isAdmin: (admins.uids && admins.uids[user.uid] === true) || 
                 (admins.emails && user.email && admins.emails[user.email.toLowerCase().replace(/\./g, ',')] === true),
        profile: profiles[user.uid] || null
    }));
});

// Promote or demote a user as admin
exports.adminSetAdmin = functions.https.onCall(async (data, context) => {
    await verifyAdmin(context);
    
    const { uid, email, isAdmin } = data;
    if (!uid && !email) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide uid or email.');
    }
    
    const updates = {};
    if (uid) {
        updates[`admins/uids/${uid}`] = isAdmin ? true : null;
    }
    if (email) {
        const encodedEmail = email.toLowerCase().replace(/\./g, ',');
        updates[`admins/emails/${encodedEmail}`] = isAdmin ? true : null;
    }
    
    await admin.database().ref().update(updates);
    return { success: true };
});

// Delete a user account
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
    await verifyAdmin(context);
    
    const { uid } = data;
    if (!uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide uid.');
    }
    
    // Don't allow deleting yourself
    if (uid === context.auth.uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot delete your own account.');
    }
    
    // Delete user from Firebase Auth
    await admin.auth().deleteUser(uid);
    
    // Clean up their admin entries
    const updates = {};
    updates[`admins/uids/${uid}`] = null;
    updates[`profiles/${uid}`] = null;
    await admin.database().ref().update(updates);
    
    return { success: true };
});

// Get user activity summary
exports.adminGetUserStats = functions.https.onCall(async (data, context) => {
    await verifyAdmin(context);
    
    const { uid } = data;
    if (!uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide uid.');
    }
    
    // Get transaction counts for this user from the profile
    const profile = await admin.database().ref(`profiles/${uid}`).once('value');
    
    // Count transactions by payer name
    // Note: This is lightweight - we don't scan all transactions
    const stats = {
        profile: profile.val() || null,
        // Transaction counts would require scanning all transactions,
        // which is expensive. We return profile data for now.
    };
    
    return stats;
});
