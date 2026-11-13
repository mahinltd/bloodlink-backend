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

export const sendRequestNotificationEmail = async (
  email,
  { bloodGroup, hospitalName, bagsNeeded, neededBy, urgency, language = 'bn' }
) => {
  const isEnglish = language === 'en';
  const labels = {
    sos: isEnglish ? 'SOS blood request' : 'জরুরি SOS রক্তের অনুরোধ',
    urgent: isEnglish ? 'Urgent blood request' : 'জরুরি রক্তের অনুরোধ',
    normal: isEnglish ? 'Blood request near you' : 'আপনার কাছাকাছি রক্তের অনুরোধ',
  };
  const title = labels[urgency] || labels.normal;
  const needed = new Date(neededBy).toLocaleString(isEnglish ? 'en-BD' : 'bn-BD');
  const quantity = isEnglish ? 'Units needed' : 'প্রয়োজনীয় ব্যাগ';
  const hospital = isEnglish ? 'Hospital' : 'হাসপাতাল';
  const when = isEnglish ? 'Needed by' : 'প্রয়োজন';
  const content = `
    <h2 style="margin:0 0 12px;font-size:18px;color:#d32f2f;text-align:center;">${escapeHtml(title)}: ${escapeHtml(bloodGroup)}</h2>
    <table role="presentation" style="width:100%;font-size:14px;color:#333333;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#888;">${hospital}</td><td style="padding:6px 0;">${escapeHtml(hospitalName)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">${quantity}</td><td style="padding:6px 0;">${escapeHtml(bagsNeeded)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">${when}</td><td style="padding:6px 0;">${escapeHtml(needed)}</td></tr>
    </table>
    <p style="font-size:14px;text-align:center;margin:20px 0;">${isEnglish ? 'Open BloodLink to view the request and respond if you can help.' : 'অনুরোধটি দেখতে এবং সাহায্য করতে BloodLink অ্যাপ খুলুন।'}</p>
    <p style="font-size:11px;color:#888888;text-align:center;">BloodLink — ${isEnglish ? 'Blood is free; selling is prohibited.' : 'রক্ত বিনামূল্যে, কেনাবেচা নিষিদ্ধ।'}</p>`;
  const text = [
    `${title}: ${bloodGroup}`,
    `${hospital}: ${hospitalName}`,
    `${quantity}: ${bagsNeeded}`,
    `${when}: ${needed}`,
    isEnglish ? 'Open BloodLink to view and respond.' : 'অনুরোধটি দেখতে BloodLink অ্যাপ খুলুন।',
  ].join('\n');

  return sendEmail({
    to: email,
    subject: `${title}: ${bloodGroup}`,
    html: renderBrandedEmail({ content }),
    text,
  });
};