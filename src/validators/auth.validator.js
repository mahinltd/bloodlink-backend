// BloodLink Backend - Validator: Auth
const { body } = require('express-validator');
const { BLOOD_GROUPS } = require('../constants');

const fullNameRules = body('fullName')
  .trim()
  .notEmpty().withMessage('Full name is required.').bail()
  .isLength({ min: 3, max: 100 }).withMessage('Full name must be 3–100 characters.');

const emailRules = body('email')
  .trim()
  .notEmpty().withMessage('Email is required.').bail()
  .isEmail().withMessage('Enter a valid email address.')
  .normalizeEmail();

const phoneRules = body('phone')
  .trim()
  .matches(/^01[3-9]\d{8}$/)
  .withMessage('Enter a valid Bangladeshi mobile number (e.g. 01712345678).');

const passwordRules = (field = 'password') =>
  body(field)
    .isLength({ min: 8, max: 64 }).withMessage(`${field === 'password' ? 'Password' : 'New password'} must be 8–64 characters.`).bail()
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number.');

const otpRules = body('otp')
  .trim()
  .isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits.').bail()
  .isNumeric().withMessage('OTP must contain digits only.');

// ---------- Donor-specific rules ----------
const donorFieldRules = [
  body('bloodGroup')
    .isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),

  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female or other.'),

  body('weightKg')
    .isFloat({ min: 30, max: 300 })
    .withMessage('Weight must be between 30 and 300 kg.'),

  body('dateOfBirth')
    .isISO8601().withMessage('Date of birth must be a valid date (YYYY-MM-DD).').bail()
    .custom((value) => {
      const dob = new Date(value);
      if (dob > new Date()) throw new Error('Date of birth cannot be in the future.');
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 18) throw new Error('Donors must be at least 18 years old.');
      if (age >= 65) throw new Error('Donor age must be below 65 years.');
      return true;
    }),

  body('division').trim().notEmpty().withMessage('Division is required.'),
  body('district').trim().notEmpty().withMessage('District is required.'),
  body('upazila').trim().notEmpty().withMessage('Upazila/Thana is required.'),
  body('union').optional().trim().isLength({ max: 100 }),
  body('village').optional().trim().isLength({ max: 100 }),

  body('lastDonationDate')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('Last donation date must be a valid date (YYYY-MM-DD).').bail()
    .custom((value) => {
      if (new Date(value) > new Date()) throw new Error('Last donation date cannot be in the future.');
      return true;
    }),

  body('medicalHistory')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Medical history is too long (max 2000 characters).'),

  body('totalDonationCount')
    .optional()
    .isInt({ min: 0, max: 500 }).withMessage('Total donation count must be a non-negative number.'),
];

// ---------- Rule Groups ----------
const registerDonor = [fullNameRules, emailRules, phoneRules, passwordRules(), ...donorFieldRules];
const registerUser = [fullNameRules, emailRules, phoneRules, passwordRules()];
const login = [emailRules, body('password').notEmpty().withMessage('Password is required.')];
const verifyEmail = [emailRules, otpRules];
const resendOtp = [emailRules];
const forgotPassword = [emailRules];
const resetPassword = [emailRules, otpRules, passwordRules('newPassword')];
const refresh = [body('refreshToken').notEmpty().withMessage('Refresh token is required.')];
const changePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  passwordRules('newPassword'),
];

module.exports = {
  registerDonor,
  registerUser,
  login,
  verifyEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  refresh,
  changePassword,
  donorFieldRules,
};