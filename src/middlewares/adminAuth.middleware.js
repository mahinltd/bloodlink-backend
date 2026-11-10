import { verifyAccessToken } from '../utils/jwt.util.js';
import ApiError from '../utils/ApiError.js';
import { AdminUser } from '../modules/admin/adminUser.model.js';

// অ্যাডমিন টোকেন (scope: admin) — আলাদা adminUsers কালেকশন (রোডম্যাপ পর্ব ৪)
export const protectAdmin = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Admin authentication required', 'AUTH_REQUIRED'));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return next(error);
  }
  if (payload.scope !== 'admin') {
    return next(ApiError.unauthorized('Invalid token scope', 'INVALID_TOKEN_SCOPE'));
  }

  const admin = await AdminUser.findById(payload.sub).select('_id role status').lean();
  if (!admin || admin.status !== 'active') {
    return next(ApiError.unauthorized('Admin account is not active', 'ADMIN_NOT_ACTIVE'));
  }

  req.admin = { adminId: admin._id.toString(), role: admin.role };
  next();
};