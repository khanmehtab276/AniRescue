const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not configured.");
}

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Firebase service account file not found: ${serviceAccountPath}`,
  );
}

const serviceAccount = require(serviceAccountPath);

if (admin.getApps().length === 0) {
  admin.initializeApp({
    credential: admin.cert(serviceAccount),
  });
}

module.exports = admin;