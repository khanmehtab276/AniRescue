const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/auth");
const ctrl = require("../controllers/admin.controller");

router.use(verifyToken, authorizeRoles("ADMIN"));

router.get("/users", ctrl.listUsers);
router.put("/users/:id/status", ctrl.updateUserStatus);

module.exports = router;
