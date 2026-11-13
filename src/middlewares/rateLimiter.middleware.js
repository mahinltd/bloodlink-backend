import rateLimit from 'express-rate-limit';

const handler = (req, res) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  });

const base = { standardHeaders: true, legacyHeaders: false, handler };

// সাধারণ API
export const apiLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 300 });

// Phone-bearing directory and request reads are stricter than the general API limit.
export const donorDirectoryLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 60 });
export const requestFeedLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 60 });

// লগইন (ব্রুট-ফোর্স প্রতিরোধ)
export const authLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 10 });

// OTP পাঠানো (রোডম্যাপ: রিসেন্ডে ৬০ সেকেন্ড বিরতি + IP/ইমেইল সীমা)
export const otpLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 3 });