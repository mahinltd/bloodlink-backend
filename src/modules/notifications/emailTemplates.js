import { env } from '../../config/env.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character];
  });

const getFirstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';

const formatCode = (code) => {
  const value = String(code);
  if (!/^\d{6}$/.test(value)) throw new TypeError('Verification code must contain exactly 6 digits');
  return `${value.slice(0, 3)} ${value.slice(3)}`;
};

const renderLogo = (logoUrl) =>
  logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="168" height="44" alt="BloodLink" style="display:block;width:168px;height:44px;max-width:100%;margin:0 auto;border:0;">`
    : '<span style="font-size:26px;font-weight:bold;color:#d32f2f;">Blood<span style="color:#222222;">Link</span></span>';

export const renderBrandedEmail = ({ content, logoUrl = env.LOGO_URL, year = new Date().getFullYear() }) => `
<!DOCTYPE html>
<html lang="en">
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px 12px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #eeeeee;border-radius:12px;border-collapse:separate;">
    <tr><td align="center" style="padding:28px 24px 20px;">${renderLogo(logoUrl)}</td></tr>
    <tr><td style="padding:0 32px 28px;">${content}</td></tr>
    <tr><td align="center" style="padding:16px 24px;border-top:1px solid #eeeeee;font-size:11px;line-height:18px;color:#888888;">BloodLink &copy; ${escapeHtml(year)}</td></tr>
  </table>
</body>
</html>`;

const htmlToText = (html) =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const renderVerificationEmail = ({
  name,
  code,
  expiryMinutes = 10,
  logoUrl = env.LOGO_URL,
  supportEmail = env.SUPPORT_EMAIL || env.EMAIL_FROM,
  year = new Date().getFullYear(),
}) => {
  const firstName = getFirstName(name);
  const formattedCode = formatCode(code);
  const expiry = Number(expiryMinutes);
  if (!Number.isFinite(expiry) || expiry < 1) throw new TypeError('Expiry must be a positive number of minutes');

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;text-align:center;color:#222222;">Verify your BloodLink account</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:23px;">Hello ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;">Use this 6-digit code to verify your email address:</p>
    <p style="margin:0 0 20px;text-align:center;">
      <span style="display:inline-block;padding:14px 22px;border-radius:8px;background:#fdecea;color:#d32f2f;font-size:30px;line-height:38px;letter-spacing:6px;font-weight:bold;">${formattedCode}</span>
    </p>
    <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#555555;">This code expires in ${expiry} minutes. If you did not request it, you can ignore this email.</p>
    <p style="margin:0;font-size:12px;line-height:20px;color:#888888;">Need help? Contact ${escapeHtml(supportEmail)}.</p>`;
  const html = renderBrandedEmail({ content, logoUrl, year });
  const text = [
    'Verify your BloodLink account',
    '',
    `Hello ${firstName},`,
    '',
    'Use this 6-digit code to verify your email address:',
    formattedCode,
    '',
    `This code expires in ${expiry} minutes. If you did not request it, you can ignore this email.`,
    '',
    `Need help? Contact ${supportEmail}.`,
    `BloodLink © ${year}`,
  ].join('\n');

  return { html, text };
};

export const renderOtpEmail = ({ name, code, expiryMinutes = 10, purpose, ...options }) => {
  if (purpose === 'verify_email') {
    return renderVerificationEmail({ name, code, expiryMinutes, ...options });
  }

  const firstName = getFirstName(name);
  const formattedCode = formatCode(code);
  const expiry = Number(expiryMinutes);
  if (!Number.isFinite(expiry) || expiry < 1) throw new TypeError('Expiry must be a positive number of minutes');
  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;text-align:center;color:#222222;">Reset your BloodLink password</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:23px;">Hello ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;">Use this 6-digit code to reset your password:</p>
    <p style="margin:0 0 20px;text-align:center;"><span style="display:inline-block;padding:14px 22px;border-radius:8px;background:#fdecea;color:#d32f2f;font-size:30px;line-height:38px;letter-spacing:6px;font-weight:bold;">${formattedCode}</span></p>
    <p style="margin:0;font-size:14px;line-height:22px;color:#555555;">This code expires in ${expiry} minutes. If you did not request it, you can ignore this email.</p>`;
  const html = renderBrandedEmail({ content, ...options });
  const text = [
    'Reset your BloodLink password',
    '',
    `Hello ${firstName},`,
    '',
    'Use this 6-digit code to reset your password:',
    formattedCode,
    '',
    `This code expires in ${expiry} minutes. If you did not request it, you can ignore this email.`,
  ].join('\n');

  return { html, text };
};

export const emailHtmlToText = htmlToText;
