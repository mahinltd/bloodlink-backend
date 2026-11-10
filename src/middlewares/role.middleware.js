import ApiError from '../utils/ApiError.js';

// protectAdmin-এর পরে ব্যবহার করুন
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) return next(ApiError.unauthorized());
  if (!roles.includes(req.admin.role)) {
    return next(ApiError.forbidden('You do not have permission for this action', 'INSUFFICIENT_ROLE'));
  }
  next();
};