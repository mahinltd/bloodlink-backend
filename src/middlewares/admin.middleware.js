// BloodLink Backend - Middleware: Admin Auth + Role-Based Permission
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const AdminUser = require('../models/AdminUser');

const adminProtect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw new ApiError(401, 'Admin authentication required.');

  let payload;
  try {
    payload = jwt.verify(token, env.admin.jwtSecret);
  } catch {
    throw new ApiError(401, 'Invalid or expired admin session.');
  }
  if (payload.type !== 'admin') throw new ApiError(401, 'Invalid admin token.');

  const admin = await AdminUser.findById(payload.sub);
  if (!admin) throw new ApiError(401, 'Admin account no longer exists.');
  if (!admin.isActive) throw new ApiError(403, 'This admin account has been deactivated.');

  req.admin = admin;
  next();
});

// §৬.৮ Role-Based Permission
const requireAdminRoles = (...roles) => (req, res, next) => {
  if (!req.admin) return next(new ApiError(401, 'Admin authentication required.'));
  if (req.admin.role === 'super_admin') return next(); // Super Admin-এর সব access
  if (!roles.includes(req.admin.role)) {
    return next(new ApiError(403, 'You do not have permission for this action.'));
  }
  next();
};

module.exports = { adminProtect, requireAdminRoles };