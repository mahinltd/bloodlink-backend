import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect } from '../../middlewares/auth.middleware.js';
import { authLimiter, otpLimiter } from '../../middlewares/rateLimiter.middleware.js';
import * as ctrl from './auth.controller.js';
import * as v from './auth.validation.js';

const router = Router();

router.post('/register', authLimiter, validate(v.registerSchema), ctrl.register);
router.post('/verify-email', authLimiter, validate(v.verifyEmailSchema), ctrl.verifyEmail);
router.post('/resend-otp', otpLimiter, validate(v.resendOtpSchema), ctrl.resendOtp);
router.post('/login', authLimiter, validate(v.loginSchema), ctrl.login);
router.post('/refresh', validate(v.refreshSchema), ctrl.refresh);
router.post('/logout', protect, ctrl.logout);
router.post('/logout-all', protect, ctrl.logoutAll);
router.post('/forgot-password', otpLimiter, validate(v.forgotPasswordSchema), ctrl.forgotPassword);
router.post('/verify-reset-otp', authLimiter, validate(v.verifyResetOtpSchema), ctrl.verifyResetOtp);
router.post('/reset-password', authLimiter, validate(v.resetPasswordSchema), ctrl.resetPassword);
router.post('/change-password', protect, validate(v.changePasswordSchema), ctrl.changePassword);

export default router;