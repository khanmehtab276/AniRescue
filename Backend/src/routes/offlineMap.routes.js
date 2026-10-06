const express = require("express");

const { verifyToken } = require("../middleware/auth");
const {
  getOfflineMapDownloadUrl,
} = require("../controllers/offlineMap.controller");

const router = express.Router();

router.get("/:zoneId/url", verifyToken, getOfflineMapDownloadUrl);

module.exports = router;
