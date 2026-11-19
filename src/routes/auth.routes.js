// BloodLink Backend - Route: /auth
const express = require('express');
const controller = require('../controllers/auth.controller');
const validators = require('../validators/auth.validator');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');

const router = express.Router();

// ---------- Public ----------
router.post('/register/donor', authLimiter, validators.registerDonor, validate, controller.registerDonor);
router.post('/register/user', authLimiter, validators.registerUser, validate, controller.registerUser);
router.post('/verify-email', authLimiter, validators.verifyEmail, validate, controller.verifyEmail);
router.post('/resend-otp', authLimiter, validators.resendOtp, validate, controller.resendOtp);
router.post('/login', authLimiter, validators.login, validate, controller.login);
router.post('/refresh', authLimiter, validators.refresh, validate, controller.refresh);
router.post('/logout', validators.refresh, validate, controller.logout);
router.post('/forgot-password', authLimiter, validators.forgotPassword, validate, controller.forgotPassword);
router.post('/reset-password', authLimiter, validators.resetPassword, validate, controller.resetPassword);

// ---------- Protected ----------
router.post('/logout-all', protect, controller.logoutAll);
router.post('/change-password', protect, validators.changePassword, validate, controller.changePassword);
router.get('/me', protect, controller.getMe);

module.exports = router;