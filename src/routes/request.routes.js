// BloodLink Backend - Route: /requests
const express = require('express');
const controller = require('../controllers/request.controller');
const validators = require('../validators/request.validator');
const validate = require('../middlewares/validate.middleware');
const { protect, requireDonor } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect); // সব route protected

// ⚠️ Static routes /:id-এর আগে
router.post('/', validators.createRequest, validate, controller.createRequest);
router.get('/feed', validators.feedQuery, validate, controller.getFeed);
router.get('/my', controller.getMyRequests);

router.get('/:id', validators.requestIdParam, validate, controller.getRequestById);
router.patch('/:id/status', validators.requestIdParam, validate, validators.updateStatus, validate, controller.updateRequestStatus);
router.get('/:id/responses', validators.requestIdParam, validate, controller.getResponses);
router.post('/:id/respond', requireDonor, validators.requestIdParam, validate, validators.respondToRequest, validate, controller.respondToRequest);
router.post('/:id/select-donor', validators.requestIdParam, validate, validators.selectDonor, validate, controller.selectDonor);

module.exports = router;