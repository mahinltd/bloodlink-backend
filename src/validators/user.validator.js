// BloodLink Backend - Validator: User
const { body } = require('express-validator');
const { donorFieldRules } = require('./auth.validator');

const updateProfile = [
  body('fullName').optional().trim().isLength({ min: 3, max: 100 })
    .withMessage('Full name must be 3–100 characters.'),
  body('phone').optional().trim()
    .matches(/^01[3-9]\d{8}$/)
    .withMessage('Enter a valid Bangladeshi mobile number (e.g. 01712345678).'),
];

const fcmToken = [
  body('token').trim().notEmpty().withMessage('FCM token is required.')
    .isLength({ min: 20, max: 500 }).withMessage('Invalid FCM token.'),
  body('platform').optional().isIn(['android', 'ios', 'web'])
    .withMessage('Platform must be android, ios or web.'),
];

const deleteAccount = [
  body('password').notEmpty().withMessage('Password is required to delete your account.'),
];

// Regular User → Donor: registration-এর donor rules-ই reuse
const convertToDonor = [...donorFieldRules];

module.exports = { updateProfile, fcmToken, deleteAccount, convertToDonor };