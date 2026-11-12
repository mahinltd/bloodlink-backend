import crypto from 'crypto';
import { env } from '../config/env.js';

// ৬ সংখ্যার OTP
export const generateOtp = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

// OTP সরাসরি নয়, হ্যাশ করে সংরক্ষণ (রোডম্যাপ পর্ব ২/১৩)
export const hashOtp = (code, email, purpose) =>
  crypto
    .createHash('sha256')
    .update(`${email}:${purpose}:${code}:${env.JWT_ACCESS_SECRET}`)
    .digest('hex');

export const otpExpiresAt = (ttlMinutes = 10) => new Date(Date.now() + ttlMinutes * 60 * 1000);