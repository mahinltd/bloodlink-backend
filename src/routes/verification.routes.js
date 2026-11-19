// BloodLink Backend - Route: /verification
const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/verification.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');

const router = express.Router();
router.use(protect);

// §৫: In-app camera capture — gallery upload নয় (app-side enforcement; captureMethod flag দেওয়া আছে)
router.post(
  '/submit',
  uploadImage.fields([
    { name: 'nid', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  [
    body('nidNumber').optional().trim().isLength({ max: 30 }).withMessage('NID number is too long.'),
    body('fullNameAsPerNid').optional().trim().isLength({ max: 100 }),
    body('nidDateOfBirth').optional().trim().isLength({ max: 30 }),
  ],
  validate,
  controller.submitVerification
);

router.get('/my', controller.getMyVerification);

module.exports = router;