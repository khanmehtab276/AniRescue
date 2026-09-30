const admin = require("firebase-admin");
const fs = require("fs");

let firebaseAdmin = null;

function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
    return null;
  }

  try {
    const serviceAccount = require(serviceAccountPath);

    if (admin.getApps().length === 0) {
      admin.initializeApp({
        credential: admin.cert(serviceAccount),
      });
    }

    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.error(
      "Firebase Admin initialization failed. Push notifications will remain disabled:",
      error?.message || error,
    );
    return null;
  }
}

module.exports = {
  getFirebaseAdmin,
};
