// BloodLink Backend - Route: /config (public)
const express = require('express');
const controller = require('../controllers/config.controller');

const router = express.Router();
router.get('/', controller.getPublicConfig);
router.get('/stats', controller.getPublicStats);

module.exports = router;