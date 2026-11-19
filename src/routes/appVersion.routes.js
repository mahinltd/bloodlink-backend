// BloodLink Backend - Route: /app-version (public)
const express = require('express');
const controller = require('../controllers/appVersion.controller');

const router = express.Router();
router.get('/', controller.getAppVersion);

module.exports = router;