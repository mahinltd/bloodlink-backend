// BloodLink Backend - Service: Email (Resend)
const { Resend } = require('resend');
const env = require('../config/env');
const logger = require('../utils/logger');

let resend = null;
if (env.resend.apiKey) {
  resend = new Resend(env.resend.apiKey);
  logger.success('Resend email service initialized.');
} else {
  logger.warn('RESEND_API_KEY missing — emails will be printed to console in dev mode.');
}

// Email clients (Gmail, Outlook) do not render inline <svg> or data: images,
// so the logo lockup (logo + "BloodLink") is served as a hosted PNG.
const LOGO_URL = 'https://res.cloudinary.com/dfmjmwdrr/image/upload/v1794940443/bloodlink_email_logo_omoykc.png';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const brandTemplate = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(17,24,39,0.06);">

          <!-- Brand bar -->
          <tr><td style="height:5px;line-height:5px;font-size:0;background-color:#C62828;">&nbsp;</td></tr>

          <!-- Logo lockup -->
          <tr>
            <td align="center" style="padding:34px 32px 26px 32px;background-color:#FFFFFF;">
              <img src="${LOGO_URL}" alt="BloodLink" width="220" style="display:block;width:220px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:1px;line-height:1px;font-size:0;background-color:#EEEEF0;">&nbsp;</div></td></tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px 36px 40px;font-family:${FONT};color:#374151;">
              <h2 style="margin:0 0 18px 0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:#111827;">${title}</h2>
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:26px 32px 28px 32px;background-color:#FAFAFB;border-top:1px solid #EEEEF0;font-family:${FONT};">
              <p style="margin:0 0 4px 0;font-size:14px;line-height:20px;font-weight:700;color:#C62828;">BloodLink</p>
              <p style="margin:0 0 14px 0;font-size:13px;line-height:19px;color:#6B7280;">Donate Blood, Save Lives.</p>
              <p style="margin:0 0 2px 0;font-size:12px;line-height:19px;color:#6B7280;">Polytechnic College Mor, Khalishpur</p>
              <p style="margin:0 0 12px 0;font-size:12px;line-height:19px;color:#6B7280;">Khulna 9000, Bangladesh</p>
              <p style="margin:0 0 18px 0;font-size:12px;line-height:19px;"><a href="https://bloodlink.tech" style="color:#C62828;text-decoration:none;font-weight:600;">bloodlink.tech</a></p>
              <div style="height:1px;line-height:1px;font-size:0;background-color:#E5E7EB;margin:0 auto 16px auto;max-width:240px;">&nbsp;</div>
              <p style="margin:0 0 3px 0;font-size:12px;line-height:18px;color:#9CA3AF;">&copy; ${new Date().getFullYear()} BloodLink. All rights reserved.</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#9CA3AF;">Developed by <span style="color:#6B7280;font-weight:600;">Tanvir</span></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const sendEmail = async ({ to, subject, html }) => {
  if (!resend) {
    if (env.isDevelopment) return { sent: false, dev: true };
    logger.error(`Email not sent (no API key): ${to} — ${subject}`);
    return { sent: false };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: env.resend.emailFrom,
      to,
      subject,
      html,
    });
    if (error) {
      logger.error('Resend error:', error);
      return { sent: false, error: error.message };
    }
    logger.info(`Email sent → ${to}: ${subject}`);
    return { sent: true, id: data && data.id };
  } catch (err) {
    logger.error('Email send failed:', err.message);
    return { sent: false, error: err.message };
  }
};

// purpose: 'verification' | 'password_reset'
const sendOtpEmail = async ({ to, name, otp, purpose }) => {
  const isReset = purpose === 'password_reset';
  const subject = isReset
    ? `${otp} — BloodLink Password Reset Code`
    : `${otp} — BloodLink Verification Code`;

  const html = brandTemplate(
    isReset ? 'Password Reset Code' : 'Verify Your Email',
    `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Hi <b style="color:#111827;">${name}</b>,</p>
     <p style="margin:0 0 22px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Your BloodLink ${isReset ? 'password reset' : 'verification'} code is:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
       <tr>
         <td align="center" style="padding:24px 12px;background-color:#FEF2F2;border:1px solid #FECACA;border-radius:12px;">
           <span style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;line-height:44px;letter-spacing:12px;padding-left:12px;font-weight:700;color:#C62828;">${otp}</span>
         </td>
       </tr>
     </table>
     <p style="margin:0 0 14px 0;font-family:${FONT};font-size:14px;line-height:22px;color:#4B5563;">This code expires in <b style="color:#111827;">${env.otp.expiresInMinutes} minutes</b>. Please do not share it with anyone.</p>
     <p style="margin:0;font-family:${FONT};font-size:13px;line-height:21px;color:#6B7280;">If you did not request this, please ignore this email.</p>`
  );

  const result = await sendEmail({ to, subject, html });

  return result;
};

const sendWelcomeEmail = async ({ to, name }) => {
  const html = brandTemplate(
    'Welcome to BloodLink!',
    `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Hi <b style="color:#111827;">${name}</b>,</p>
     <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Your account is now active. Thank you for joining Bangladesh's voluntary blood donation network.</p>`
  );
  return sendEmail({ to, subject: 'Welcome to BloodLink 🩸', html });
};

// Emergency Donor Alert — top matched donor-দের জন্য
const sendEmergencyDonorAlert = async ({ to, donorName, request, distanceKm }) => {
  const distanceText = distanceKm != null ? ` (~${distanceKm} km away)` : '';
  const html = brandTemplate(
    `🆘 ${request.bloodGroup} Blood Needed Urgently!`,
    `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Hi <b style="color:#111827;">${donorName}</b>,</p>
     <p style="margin:0 0 22px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">A patient needs <b style="color:#C62828;">${request.bloodGroup}</b> blood${distanceText}. You are one of the closest eligible donors.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 22px 0;border-collapse:collapse;font-family:${FONT};font-size:14px;">
       <tr>
         <td style="width:38%;padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#6B7280;">Patient</td>
         <td style="padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#111827;font-weight:700;">${request.patientName}</td>
       </tr>
       <tr style="background-color:#FAFAFB;">
         <td style="width:38%;padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#6B7280;">Hospital</td>
         <td style="padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#111827;font-weight:700;">${request.hospitalName}</td>
       </tr>
       <tr>
         <td style="width:38%;padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#6B7280;">Address</td>
         <td style="padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#374151;">${request.hospitalAddress}</td>
       </tr>
       <tr style="background-color:#FAFAFB;">
         <td style="width:38%;padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#6B7280;">Bags Needed</td>
         <td style="padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#C62828;font-weight:700;">${request.numberOfBags}</td>
       </tr>
       <tr>
         <td style="width:38%;padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#6B7280;">Required</td>
         <td style="padding:10px 12px;border-bottom:1px solid #EEEEF0;color:#374151;">${request.requiredDate} at ${request.requiredTime}</td>
       </tr>
       <tr style="background-color:#FAFAFB;">
         <td style="width:38%;padding:10px 12px;color:#6B7280;">Request ID</td>
         <td style="padding:10px 12px;color:#374151;">${request.requestId}</td>
       </tr>
     </table>
     <p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#374151;">Open the <b style="color:#111827;">BloodLink app</b> to respond. Your response can save a life.</p>
     <p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:#C62828;font-weight:700;">রক্ত দিন, জীবন বাঁচান।</p>`
  );

  const result = await sendEmail({ to, subject: `🆘 Urgent: ${request.bloodGroup} blood needed — ${request.hospitalName}`, html });
  if (result.dev) logger.warn(`[DEV MODE] Emergency alert email for ${to} (${request.requestId})`);
  return result;
};

module.exports = { sendEmail, sendOtpEmail, sendWelcomeEmail, sendEmergencyDonorAlert };