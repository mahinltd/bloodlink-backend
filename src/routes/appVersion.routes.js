const express = require('express');
const router = express.Router();
const { getAppVersion } = require('../controllers/appVersion.controller');

router.get('/', getAppVersion);

module.exports = router;