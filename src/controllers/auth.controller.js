// BloodLink Backend - Controller: Auth
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const env = require('../config/env');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const VerificationRequest = require('../models/VerificationRequest');
const tokenService = require('../services/token.service');
const otpService = require('../services/otp.service');
const emailService = require('../services/email.service');

const clientMeta = (req) => ({ userAgent: req.headers['user-agent'] || '', ip: req.ip || '' });

const issueAuthTokens = async (user, req) => {
  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = await tokenService.createRefreshToken(user._id, clientMeta(req));
  return { accessToken, refreshToken };
};

const checkEmailPhoneUnique = async (email, phone) => {
  const existing = await User.findOne({ $or: [{ email }, { phone }] }).lean();
  if (!existing) return;
  if (existing.email === email) throw new ApiError(409, 'An account with this email already exists.');
  throw new ApiError(409, 'An account with this phone number already exists.');
};

// @route POST /auth/register/donor
const registerDonor = asyncHandler(async (req, res) => {
  const {
    fullName, email, phone, password,
    bloodGroup, gender, weightKg, dateOfBirth,
    division, district, upazila, union, village,
    lastDonationDate, medicalHistory, totalDonationCount,
  } = req.body;

  await checkEmailPhoneUnique(email, phone);

  const user = await User.create({ fullName, email, phone, password, role: 'donor' });

  // ৯০ দিনের Auto-Cooldown (lastDonationDate থাকলে)
  let nextEligibleDate = null;
  let availabilityStatus = 'available';
  if (lastDonationDate) {
    nextEligibleDate = new Date(
      new Date(lastDonationDate).getTime() + env.matching.donationCooldownDays * 24 * 60 * 60 * 1000
    );
    if (nextEligibleDate > new Date()) availabilityStatus = 'recently_donated';
  }

  try {
    await DonorProfile.create({
      user: user._id,
      bloodGroup,
      gender,
      weightKg: Number(weightKg),
      dateOfBirth,
      address: { division, district, upazila, union: union || '', village: village || '' },
      lastDonationDate: lastDonationDate || null,
      nextEligibleDate,
      medicalHistory: medicalHistory || '',
      totalDonationCount: Number(totalDonationCount) || 0,
      availabilityStatus,
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id); // rollback
    throw err;
  }

  const { otp, payload } = otpService.buildOtpPayload(user._id);
  user.emailOtp = payload;
  await user.save();

  await emailService.sendOtpEmail({ to: user.email, name: user.fullName, otp, purpose: 'verification' });

  res.status(201).json(
    new ApiResponse(
      201,
      { userId: user._id, email: user.email, role: user.role },
      'Registration successful. A 4-digit OTP has been sent to your email.'
    )
  );
});

// @route POST /auth/register/user
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  await checkEmailPhoneUnique(email, phone);

  const user = await User.create({ fullName, email, phone, password, role: 'user' });

  const { otp, payload } = otpService.buildOtpPayload(user._id);
  user.emailOtp = payload;
  await user.save();

  await emailService.sendOtpEmail({ to: user.email, name: user.fullName, otp, purpose: 'verification' });

  res.status(201).json(
    new ApiResponse(
      201,
      { userId: user._id, email: user.email, role: user.role },
      'Registration successful. A 4-digit OTP has been sent to your email.'
    )
  );
});

// @route POST /auth/verify-email
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email }).select('+emailOtp');
  if (!user) throw new ApiError(404, 'No account found with this email.');
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified. Please log in.');

  const result = otpService.verifyOtp(user.emailOtp, otp, user._id);
  if (!result.ok) {
    if (result.reason.startsWith('Incorrect')) {
      user.emailOtp.attempts += 1;
      await user.save();
    }
    throw new ApiError(400, result.reason);
  }

  user.isEmailVerified = true;
  user.accountStatus = 'active';
  user.emailOtp = undefined;
  await user.save();

  await emailService.sendWelcomeEmail({ to: user.email, name: user.fullName });

  const tokens = await issueAuthTokens(user, req);

  res.status(200).json(
    new ApiResponse(200, { user: user.toJSON(), ...tokens }, 'Email verified successfully. Welcome to BloodLink!')
  );
});

// @route POST /auth/resend-otp
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email }).select('+emailOtp');
  if (!user) throw new ApiError(404, 'No account found with this email.');
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified. Please log in.');

  if (!otpService.canResend(user.emailOtp)) {
    throw new ApiError(429, `Please wait ${otpService.RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP.`);
  }

  const { otp, payload } = otpService.buildOtpPayload(user._id);
  user.emailOtp = payload;
  await user.save();

  await emailService.sendOtpEmail({ to: user.email, name: user.fullName, otp, purpose: 'verification' });

  res.status(200).json(new ApiResponse(200, null, 'A new OTP has been sent to your email.'));
});

// @route POST /auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (user.accountStatus === 'pending_verification') {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Please verify your email before logging in.',
      data: { needsVerification: true, email: user.email },
    });
  }
  if (user.accountStatus === 'suspended') throw new ApiError(403, 'Your account has been suspended. Contact support.');
  if (user.accountStatus === 'banned') throw new ApiError(403, 'Your account has been banned.');
  if (user.accountStatus === 'deleted') throw new ApiError(403, 'This account has been deleted.');

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueAuthTokens(user, req);
  const donorProfile = user.role === 'donor' ? await DonorProfile.findOne({ user: user._id }) : null;

  res.status(200).json(
    new ApiResponse(200, { user: user.toJSON(), donorProfile, ...tokens }, 'Login successful.')
  );
});

// @route POST /auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const { userId, token: newRefreshToken } = await tokenService.rotateRefreshToken(
    refreshToken,
    clientMeta(req)
  );

  const user = await User.findById(userId);
  if (!user || user.accountStatus !== 'active') {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  const accessToken = tokenService.generateAccessToken(user);

  res.status(200).json(
    new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, 'Token refreshed successfully.')
  );
});

// @route POST /auth/logout
const logout = asyncHandler(async (req, res) => {
  await tokenService.revokeRefreshToken(req.body.refreshToken);
  res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// @route POST /auth/logout-all (protect)
const logoutAll = asyncHandler(async (req, res) => {
  await tokenService.revokeAllUserTokens(req.user._id);
  res.status(200).json(new ApiResponse(200, null, 'Logged out from all devices.'));
});

// @route POST /auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const message = 'If an account exists with this email, a password reset OTP has been sent.';

  const user = await User.findOne({ email }).select('+passwordResetOtp');

  // Enumeration protection: user না থাকলেও same response
  if (!user || user.accountStatus === 'banned' || user.accountStatus === 'deleted') {
    return res.status(200).json(new ApiResponse(200, null, message));
  }

  if (!otpService.canResend(user.passwordResetOtp)) {
    throw new ApiError(429, `Please wait ${otpService.RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP.`);
  }

  const { otp, payload } = otpService.buildOtpPayload(user._id);
  user.passwordResetOtp = payload;
  await user.save();

  await emailService.sendOtpEmail({ to: user.email, name: user.fullName, otp, purpose: 'password_reset' });

  res.status(200).json(new ApiResponse(200, null, message));
});

// @route POST /auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({ email }).select('+passwordResetOtp');
  if (!user) throw new ApiError(400, 'Invalid email or OTP.');

  const result = otpService.verifyOtp(user.passwordResetOtp, otp, user._id);
  if (!result.ok) {
    if (result.reason.startsWith('Incorrect')) {
      user.passwordResetOtp.attempts += 1;
      await user.save();
    }
    throw new ApiError(400, result.reason);
  }

  user.password = newPassword;
  user.passwordResetOtp = undefined;
  await user.save();

  // Security: সব পুরোনো session revoke
  await tokenService.revokeAllUserTokens(user._id);

  res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please log in with your new password.'));
});

// @route POST /auth/change-password (protect)
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(400, 'Current password is incorrect.');
  }

  user.password = newPassword;
  await user.save();

  // অন্য সব device logout, বর্তমান device-এ fresh token
  await tokenService.revokeAllUserTokens(user._id);
  const tokens = await issueAuthTokens(user, req);

  res.status(200).json(new ApiResponse(200, tokens, 'Password changed successfully.'));
});

// @route GET /auth/me (protect)
const getMe = asyncHandler(async (req, res) => {
  const donorProfile = req.user.role === 'donor'
    ? await DonorProfile.findOne({ user: req.user._id })
    : null;

  const latestVerification = await VerificationRequest.findOne({ user: req.user._id })
    .select('status reviewReason createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(
    new ApiResponse(
      200,
      { user: req.user.toJSON(), donorProfile, verificationStatus: latestVerification || null },
      'Profile fetched successfully.'
    )
  );
});

module.exports = {
  registerDonor,
  registerUser,
  verifyEmail,
  resendOtp,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
};