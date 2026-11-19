// BloodLink Backend - Route: /donations
const express = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/donation.controller');
const validate = require('../middlewares/validate.middleware');
const { protect, requireDonor } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

const idRule = [param('id').isMongoId().withMessage('Invalid donation ID.')];

// ⚠️ Static routes /:id-এর আগে
router.post(
  '/',
  requireDonor,
  [
    body('requestId').optional().isMongoId().withMessage('Invalid request ID.'),
    body('donationDate').isISO8601().withMessage('Donation date must be valid (YYYY-MM-DD).').bail()
      .custom((value) => {
        if (new Date(value) > new Date()) throw new Error('Donation date cannot be in the future.');
        return true;
      }),
    // requestId না থাকলে hospitalName বাধ্যতামূলক
    body('hospitalName').if(body('requestId').not().exists())
      .trim().notEmpty().withMessage('Hospital name is required.').bail()
      .isLength({ max: 200 }),
    body('hospitalAddress').optional().trim().isLength({ max: 500 }),
    body('units').optional().isInt({ min: 1, max: 2 }).withMessage('Units must be 1 or 2.'),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  controller.logDonation
);

router.get('/me', requireDonor, controller.getMyDonations);
router.get('/me/stats', requireDonor, controller.getMyStats);
router.get('/me/badges', requireDonor, controller.getMyBadges);
router.get('/to-confirm', controller.getPendingConfirmations);

router.post('/:id/confirm', idRule, validate, controller.confirmDonation);
router.post('/:id/reject', idRule, validate, controller.rejectDonation);
router.get('/:id/certificate', requireDonor, idRule, validate, controller.getCertificate);
router.delete('/:id', requireDonor, idRule, validate, controller.deleteDonation);

module.exports = router;