import { verifyAccessToken } from '../utils/jwt.util.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../modules/users/user.model.js';

// Bearer অ্যাক্সেস টোকেন যাচাই (scope: user)
export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED'));

    const payload = verifyAccessToken(token);
    if (payload.scope !== 'user') {
      return next(ApiError.unauthorized('Invalid token scope', 'INVALID_TOKEN_SCOPE'));
    }

    const user = await User.findById(payload.sub).select('_id status emailVerifiedAt').lean();
    if (!user || user.status !== 'active' || !user.emailVerifiedAt) {
      return next(ApiError.unauthorized('Account is not active', 'ACCOUNT_NOT_ACTIVE'));
    }

    req.auth = { userId: payload.sub };
    return next();
  } catch (error) {
    return next(error);
  }
};

// টোকন থাকলে req.auth বসায়, না থাকলেও পাস করে (গ্রাম/হাসপাতালে "নিজের pending আইটেম" দেখানোর জন্য)
export const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      if (payload.scope === 'user') req.auth = { userId: payload.sub };
    } catch {
      /* টোকেন অবৈধ হলে উপেক্ষা — পাবলিক হিসেবেই চলবে */
    }
  }
  next();
};