// BloodLink Backend - Route: /blood-banks (public)
const express = require('express');
const controller = require('../controllers/bloodBank.controller');

const router = express.Router();
router.get('/', controller.listBloodBanks);

module.exports = router;