import { getResend } from '../../config/resend.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import ApiError from '../../utils/ApiError.js';
import { emailHtmlToText, renderBrandedEmail, renderOtpEmail } from './emailTemplates.js';

export const sendEmail = async ({ to, subject, html, text }) => {
  if (!env.RESEND_API_KEY) {
    if (!['development', 'test'].includes(env.NODE_ENV)) {
      throw ApiError.internal('Resend is not configured', 'RESEND_NOT_CONFIGURED');
    }
    logger.warn(`[DEV EMAIL] to=${to} | subject=${subject}`);
    return { dev: true };
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: `BloodLink <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
    text: text || emailHtmlToText(html),
  });

  if (error) {
    logger.error('Resend error:', error);
    throw ApiError.internal('Failed to send email', 'EMAIL_SEND_FAILED');
  }
  return data;
};

export const sendOtpEmail = async (email, code, purpose, { name, expiryMinutes }) => {
  const isVerify = purpose === 'verify_email';
  const rendered = renderOtpEmail({ name, code, purpose, expiryMinutes });
  return sendEmail({
    to: email,
    subject: isVerify ? 'Your BloodLink verification code' : 'Your BloodLink password reset code',
    ...rendered,
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
    html: renderBrandedEmail({ content: `
    <h2 style="margin:0 0 12px;font-size:18px;color:#d32f2f;text-align:center;">🚨 জরুরি: ${escapeHtml(bloodGroup)} রক্ত প্রয়োজন</h2>
    <table role="presentation" style="width:100%;font-size:14px;color:#333333;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;">হাসপাতাল</td><td style="padding:6px 0;">${escapeHtml(hospitalName)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">পরিমাণ</td><td style="padding:6px 0;">${escapeHtml(bagsNeeded)} ব্যাগ</td></tr>
      <tr><td style="padding:6px 0;color:#888;">কখন লাগবে</td><td style="padding:6px 0;">${escapeHtml(new Date(neededBy).toLocaleString('bn-BD'))}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">দূরত্ব</td><td style="padding:6px 0;">~${escapeHtml(distanceKm)} কিমি</td></tr>
    </table>
    <p style="font-size:14px;color:#333333;text-align:center;margin:20px 0;">আপনি যদি দিতে পারেন, এখনই <b>BloodLink</b> অ্যাপটি খুলুন। একটি ব্যাগ রক্ত, একটি জীবন।</p>
    <p style="font-size:11px;color:#aaaaaa;text-align:center;">BloodLink — রক্ত বিনামূল্যে, কেনাবেচা নিষিদ্ধ।</p>` }),
  });