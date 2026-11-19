// BloodLink Backend - Service: OTP (4-digit, hashed, expiring)
const crypto = require('crypto');
const env = require('../config/env');

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const generateOtp = () => crypto.randomInt(1000, 10000).toString(); // 4-digit

// OTP কখনো plain-text এ DB-তে রাখি না
const hashOtp = (otp, salt) =>
  crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');

const buildOtpPayload = (userId) => {
  const otp = generateOtp();
  return {
    otp, // শুধু email-এ পাঠানোর জন্য — DB-তে যাবে না
    payload: {
      hash: hashOtp(otp, userId.toString()),
      expiresAt: new Date(Date.now() + env.otp.expiresInMinutes * 60 * 1000),
      attempts: 0,
      lastSentAt: new Date(),
    },
  };
};

const verifyOtp = (stored, otp, userId) => {
  if (!stored || !stored.hash) {
    return { ok: false, reason: 'No OTP found. Please request a new one.' };
  }
  if (stored.expiresAt < new Date()) {
    return { ok: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if (stored.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Please request a new OTP.' };
  }
  if (stored.hash !== hashOtp(otp, userId.toString())) {
    return { ok: false, reason: 'Incorrect OTP. Please try again.' };
  }
  return { ok: true };
};

const canResend = (stored) => {
  if (!stored || !stored.lastSentAt) return true;
  const elapsed = Date.now() - new Date(stored.lastSentAt).getTime();
  return elapsed >= RESEND_COOLDOWN_SECONDS * 1000;
};

module.exports = { buildOtpPayload, verifyOtp, canResend, MAX_ATTEMPTS, RESEND_COOLDOWN_SECONDS };