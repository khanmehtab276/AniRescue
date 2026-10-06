const OFFLINE_MAP_FILES = Object.freeze({
  "western-india": "western-india.pmtiles",
  "central-india": "central-india.pmtiles",
  "northern-india": "northern-india.pmtiles",
  "eastern-india": "eastern-india.pmtiles",
  "southern-india": "southern-india.pmtiles",
  "north-eastern-india": "north-eastern-india.pmtiles",
});

async function getOfflineMapDownloadUrl(req, res) {
  const zoneId = String(req.params?.zoneId || "");
  const filename = OFFLINE_MAP_FILES[zoneId];

  if (!filename) {
    return res.status(404).json({
      error: "Unknown offline map zone.",
    });
  }

  const { getFirebaseAdmin } = require("../config/firebase");
  const firebaseAdmin = getFirebaseAdmin();

  if (!firebaseAdmin) {
    return res.status(503).json({
      error: "Firebase Storage signing is not configured on the backend.",
    });
  }

  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.FIREBASE_PROJECT_ID
      ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`
      : "");

  if (!bucketName) {
    return res.status(503).json({
      error: "FIREBASE_STORAGE_BUCKET is not configured.",
    });
  }

  try {
    const bucket = firebaseAdmin.storage().bucket(bucketName);
    const file = bucket.file(`offline-maps/${filename}`);
    const [exists] = await file.exists();

    if (!exists) {
      return res.status(404).json({
        error: "This offline map package has not been published yet.",
        zone: zoneId,
      });
    }

    const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    return res.json({
      zone: zoneId,
      filename,
      url,
      expiresAt,
    });
  } catch (error) {
    console.error("Offline map signed URL generation failed:", {
      zone: zoneId,
      message: error?.message || error,
    });

    return res.status(500).json({
      error: "Could not prepare the offline map download.",
    });
  }
}

module.exports = {
  getOfflineMapDownloadUrl,
};
