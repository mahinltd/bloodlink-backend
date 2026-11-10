import crypto from 'crypto';
import { env } from '../config/env.js';

// ৬ সংখ্যার OTP
export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

// OTP সরাসরি নয়, হ্যাশ করে সংরক্ষণ (রোডম্যাপ পর্ব ২/১৩)
export const hashOtp = (code, email, purpose) =>
  crypto
    .createHash('sha256')
    .update(`${email}:${purpose}:${code}:${env.JWT_ACCESS_SECRET}`)
    .digest('hex');

export const otpExpiresAt = () => new Date(Date.now() + 10 * 60 * 1000); // ১০ মিনিট