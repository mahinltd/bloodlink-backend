const express = require('express');
const router = express.Router();
const { getPublicConfig, getPublicStats } = require('../controllers/config.controller');

router.get('/', getPublicConfig);
router.get('/stats', getPublicStats);

module.exports = router;