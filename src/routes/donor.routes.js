// BloodLink Backend - Route: /donors
const express = require('express');
const controller = require('../controllers/donor.controller');
const validators = require('../validators/donor.validator');
const validate = require('../middlewares/validate.middleware');
const { protect, requireDonor } = require('../middlewares/auth.middleware');

const router = express.Router();

// ⚠️ Static routes অবশ্যই /:id-এর আগে থাকবে
router.get('/search', protect, validators.searchDonors, validate, controller.searchDonors);

router.get('/me', protect, requireDonor, controller.getMyDonorProfile);
router.patch('/me', protect, requireDonor, validators.updateDonorProfile, validate, controller.updateDonorProfile);
router.put('/me/availability', protect, requireDonor, validators.updateAvailability, validate, controller.updateAvailability);
router.put('/me/location', protect, requireDonor, validators.updateLocation, validate, controller.updateLocation);

router.get('/:id', protect, validators.donorIdParam, validate, controller.getDonorById);

module.exports = router;