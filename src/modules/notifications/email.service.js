import { getResend } from '../../config/resend.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import ApiError from '../../utils/ApiError.js';

const otpTemplate = ({ title, subtitle, code }) => `
<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #eee;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:28px;font-weight:bold;color:#d32f2f;">Blood<span style="color:#222;">Link</span></span>
    </div>
    <h2 style="margin:0 0 8px;font-size:18px;color:#222;text-align:center;">${title}</h2>
    <p style="margin:0 0 8px;font-size:14px;color:#555;text-align:center;">${subtitle}</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;color:#d32f2f;background:#fdecea;padding:16px 28px;border-radius:10px;">${code}</span>
    </div>
    <p style="font-size:12px;color:#888;text-align:center;">
      এই কোডটি ১০ মিনিটের মধ্যে ব্যবহার করুন। This code expires in 10 minutes.<br/>
      আপনি যদি এটি চাননি, এই ইমেইলটি উপেক্ষা করুন।
    </p>
  </div>
</body></html>`;

export const sendEmail = async ({ to, subject, html }) => {
  // Resend key না থাকলে dev-এ কনসোলে OTP দেখানো হবে
  if (!env.RESEND_API_KEY) {
    logger.warn(`[DEV EMAIL] to=${to} | subject=${subject}`);
    const match = html.match(/>(\d{6})</);
    if (match) logger.warn(`[DEV EMAIL] OTP CODE: ${match[1]}`);
    return { dev: true };
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: `BloodLink <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error('Resend error:', error);
    throw ApiError.internal('Failed to send email', 'EMAIL_SEND_FAILED');
  }
  return data;
};

export const sendOtpEmail = async (email, code, purpose) => {
  const isVerify = purpose === 'verify_email';
  return sendEmail({
    to: email,
    subject: isVerify ? `BloodLink ভেরিফিকেশন কোড: ${code}` : `BloodLink পাসওয়ার্ড রিসেট কোড: ${code}`,
    html: otpTemplate({
      title: isVerify ? 'ইমেইল ভেরিফিকেশন' : 'পাসওয়ার্ড রিসেট',
      subtitle: isVerify
        ? 'BloodLink-এ আপনার অ্যাকাউন্ট যাচাই করতে নিচের কোডটি ব্যবহার করুন'
        : 'আপনার পাসওয়ার্ড রিসেট করতে নিচের কোডটি ব্যবহার করুন',
      code,
    }),
  });
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character];
  });

export const sendUrgentRequestEmail = async (
  email,
  { bloodGroup, hospitalName, bagsNeeded, neededBy, distanceKm }
) =>
  sendEmail({
    to: email,
    subject: `জরুরি: ${bloodGroup} রক্ত প্রয়োজন — Urgent blood request`,
    html: `
<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #eee;">
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:24px;font-weight:bold;color:#d32f2f;">Blood<span style="color:#222;">Link</span></span>
    </div>
    <h2 style="margin:0 0 12px;font-size:18px;color:#d32f2f;text-align:center;">🚨 জরুরি: ${escapeHtml(bloodGroup)} রক্ত প্রয়োজন</h2>
    <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;">হাসপাতাল</td><td style="padding:6px 0;">${escapeHtml(hospitalName)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">পরিমাণ</td><td style="padding:6px 0;">${escapeHtml(bagsNeeded)} ব্যাগ</td></tr>
      <tr><td style="padding:6px 0;color:#888;">কখন লাগবে</td><td style="padding:6px 0;">${escapeHtml(new Date(neededBy).toLocaleString('bn-BD'))}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">দূরত্ব</td><td style="padding:6px 0;">~${escapeHtml(distanceKm)} কিমি</td></tr>
    </table>
    <p style="font-size:14px;color:#333;text-align:center;margin:20px 0;">আপনি যদি দিতে পারেন, এখনই <b>BloodLink</b> অ্যাপটি খুলুন। একটি ব্যাগ রক্ত, একটি জীবন।</p>
    <p style="font-size:11px;color:#aaa;text-align:center;">BloodLink — রক্ত বিনামূল্যে, কেনাবেচা নিষিদ্ধ।</p>
  </div>
</body></html>`,
  });