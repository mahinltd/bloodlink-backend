// BloodLink Backend - Rate Limiting
const rateLimit = require('express-rate-limit');

const buildLimiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, statusCode: 429, message },
  });

// General API limiter — পুরো /api/v1-এ apply হবে
const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  message: 'Too many requests. Please try again later.',
});

// Strict limiter — Auth routes-এর জন্য (Phase 2-এ ব্যবহার হবে)
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: 'Too many attempts. Please try again after 15 minutes.',
});

module.exports = { apiLimiter, authLimiter };