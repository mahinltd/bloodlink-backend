// BloodLink Backend - Route: /reports
const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/report.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const Report = require('../models/Report');

const router = express.Router();
router.use(protect);

router.post(
  '/',
  [
    body('category').isIn(Report.REPORT_CATEGORIES).withMessage(`Category must be one of: ${Report.REPORT_CATEGORIES.join(', ')}`),
    body('description').trim().notEmpty().withMessage('Description is required.').bail()
      .isLength({ max: 2000 }).withMessage('Description is too long (max 2000 characters).'),
    body('reportedUser').optional().isMongoId().withMessage('Invalid user ID.'),
    body('requestRef').optional().isMongoId().withMessage('Invalid request ID.'),
  ],
  validate,
  controller.createReport
);

router.get('/my', controller.getMyReports);

module.exports = router;