// BloodLink Backend - Route: /matching
const express = require('express');
const { param } = require('express-validator');
const controller = require('../controllers/matching.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

const requestIdRule = [param('requestId').isMongoId().withMessage('Invalid request ID.')];

router.use(protect);

router.post('/trigger/:requestId', requestIdRule, validate, controller.triggerMatching);
router.get('/preview/:requestId', requestIdRule, validate, controller.previewMatches);

module.exports = router;