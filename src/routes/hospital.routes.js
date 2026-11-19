const express = require('express');
const router = express.Router();
const { listHospitals } = require('../controllers/publicDirectory.controller');

router.get('/', listHospitals);

module.exports = router;