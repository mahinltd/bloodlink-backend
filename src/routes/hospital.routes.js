// BloodLink Backend - Route: /hospitals (public)
const express = require('express');
const controller = require('../controllers/hospital.controller');

const router = express.Router();
router.get('/', controller.listHospitals);

module.exports = router;