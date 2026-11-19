// BloodLink Backend - Middleware: Auth (JWT Protect)
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw new ApiError(401, 'Authentication required. Please log in.');

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret);
  } catch {
    throw new ApiError(401, 'Invalid or expired token. Please log in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Account no longer exists.');

  if (user.accountStatus === 'suspended') throw new ApiError(403, 'Your account has been suspended.');
  if (user.accountStatus === 'banned') throw new ApiError(403, 'Your account has been banned.');
  if (user.accountStatus === 'deleted') throw new ApiError(403, 'This account has been deleted.');
  if (user.accountStatus === 'pending_verification') {
    throw new ApiError(403, 'Please verify your email first.');
  }

  req.user = user;
  next();
});

// Donor-only routes: req.donorProfile attach করে
const requireDonor = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'donor') {
    throw new ApiError(403, 'This action requires a donor account.');
  }
  const donorProfile = await DonorProfile.findOne({ user: req.user._id });
  if (!donorProfile) throw new ApiError(404, 'Donor profile not found.');
  req.donorProfile = donorProfile;
  next();
});

module.exports = { protect, requireDonor };
