import crypto from 'crypto';
import { env } from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import { hashPassword, comparePassword } from '../../utils/hash.util.js';
import { generateOtp, hashOtp, otpExpiresAt } from '../../utils/otp.util.js';
import {
  signAccessToken,
  signRefreshToken,
  signPasswordResetToken,
  verifyAccessToken,
  verifyRefreshToken,
  durationToMs,
} from '../../utils/jwt.util.js';
import { sendOtpEmail } from '../notifications/email.service.js';
import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { getBusinessRules } from '../config/config.service.js';
import { resolveVillageName, touchVillageUsage } from '../locations/locations.service.js';
import { OtpCode } from './otpCode.model.js';
import { RefreshToken } from './refreshToken.model.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const calcAge = (dob) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

const isAvailableDonor = (donor, donationGapDays) => {
  const health = donor.healthDeclaration || {};
  const healthEligible =
    !health.surgery &&
    !health.tattooOrPiercing &&
    !health.onMedication &&
    !health.pregnantOrBreastfeeding &&
    !health.chronicDisease &&
    !health.recentIllness?.length;
  const donationEligible =
    !donor.lastDonationDate ||
    new Date(donor.lastDonationDate).getTime() + donationGapDays * 86400000 <= Date.now();
  return healthEligible && donationEligible;
};

/* ---------------- OTP helpers ---------------- */

const createAndSendOtp = async (email, purpose) => {
  const code = generateOtp();
  // deleteMany + create এর বদলে atomic upsert — দুটি OTP ডকুমেন্ট কখনোই হবে না
  await OtpCode.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        codeHash: hashOtp(code, email, purpose),
        attempts: 0,
        expiresAt: otpExpiresAt(),
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await sendOtpEmail(email, code, purpose);
};

const verifyOtp = async (email, purpose, code) => {
  const rules = await getBusinessRules();
  const record = await OtpCode.findOne({ email, purpose }).sort({ createdAt: -1 });
  if (!record) throw ApiError.badRequest('OTP not found. Please request a new code.', 'OTP_NOT_FOUND');

  if (record.attempts >= rules.otp.maxAttempts) {
    await OtpCode.deleteOne({ _id: record._id });
    throw ApiError.badRequest('Too many wrong attempts. Please request a new code.', 'OTP_MAX_ATTEMPTS');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await OtpCode.deleteOne({ _id: record._id });
    throw ApiError.badRequest('OTP has expired. Please request a new code.', 'OTP_EXPIRED');
  }
  if (record.codeHash !== hashOtp(code, email, purpose)) {
    record.attempts += 1;
    await record.save();
    throw ApiError.badRequest('Invalid OTP code.', 'OTP_INVALID');
  }
  await OtpCode.deleteOne({ _id: record._id });
};

/* ---------------- Token helpers ---------------- */

const issueTokenPair = async (user, req) => {
  const accessToken = signAccessToken({ sub: user._id.toString(), scope: 'user' });
  const refreshToken = signRefreshToken({ sub: user._id.toString(), scope: 'user' });

  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    deviceId: req.body?.deviceId || null,
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || null,
    expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES)),
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES,
  };
};

const revokeAllTokens = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/* ---------------- Service functions ---------------- */

export const register = async (payload, req) => {
  const email = payload.email.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing && existing.status !== 'unverified') {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
  }

  // ডোনার যোগ্যতা যাচাই (পরে admin config থেকে আসবে)
  let donorRules = null;
  if (payload.role === 'donor') {
    donorRules = (await getBusinessRules()).donor;
    const age = calcAge(payload.donor.dob);
    if (age < donorRules.minAge || age > donorRules.maxAge) {
      throw ApiError.badRequest(`Donor age must be between ${donorRules.minAge} and ${donorRules.maxAge}`, 'DONOR_AGE_NOT_ELIGIBLE');
    }
    if (payload.donor.weightKg < donorRules.minWeightKg) {
      throw ApiError.badRequest(`Donor weight must be at least ${donorRules.minWeightKg} kg`, 'DONOR_WEIGHT_NOT_ELIGIBLE');
    }
    if (payload.donor.lastDonationDate && new Date(payload.donor.lastDonationDate) > new Date()) {
      throw ApiError.badRequest('Last donation date cannot be in the future', 'INVALID_DONATION_DATE');
    }
  }

  const passwordHash = await hashPassword(payload.password);

  const userData = {
    name: payload.name,
    phone: payload.phone,
    email,
    passwordHash,
    language: payload.language,
    modes: { donor: payload.role === 'donor', requester: true },
    consents: { termsAcceptedAt: new Date(), contactAllowed: true, noBloodSelling: true },
    status: 'unverified',
  };

  // unverified অ্যাকাউন্টে আবার রেজিস্টার করলে তথ্য আপডেট + নতুন OTP
  const user = existing
    ? await User.findByIdAndUpdate(existing._id, userData, { new: true })
    : await User.create(userData);

  if (payload.role === 'donor') {
    const d = payload.donor;
    let villageId = d.villageId || null;
    if (villageId) {
      await touchVillageUsage(villageId, user._id);
    } else if (d.villageName && d.unionId) {
      const village = await resolveVillageName({
        unionId: d.unionId,
        nameBn: d.villageName,
        userId: user._id,
      });
      villageId = village?._id || null;
    }

    await DonorProfile.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        bloodGroup: d.bloodGroup,
        dob: d.dob,
        gender: d.gender,
        weightKg: d.weightKg,
        lastDonationDate: d.lastDonationDate || null,
        donationCount: d.donationCount || 0,
        healthDeclaration: d.healthDeclaration,
        isAvailable: isAvailableDonor(d, donorRules.donationGapDays),
        radiusKm: d.radiusKm,
        nightOk: d.nightOk,
        location: { type: 'Point', coordinates: [d.coordinates.lng, d.coordinates.lat] },
        divisionId: d.divisionId || null,
        districtId: d.districtId || null,
        upazilaId: d.upazilaId || null,
        unionId: d.unionId || null,
        villageId,
        villageName: d.villageName || null,
        addressDetail: d.addressDetail || null,
      },
      { upsert: true, new: true }
    );
  }

  await createAndSendOtp(email, 'verify_email');
  return { email, requiresEmailVerification: true };
};

export const verifyEmail = async ({ email, code }, req) => {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized });
  if (!user) throw ApiError.badRequest('Invalid or expired OTP', 'OTP_INVALID');
  if (user.status !== 'unverified') throw ApiError.badRequest('Email is already verified', 'ALREADY_VERIFIED');

  await verifyOtp(normalized, 'verify_email', code);

  user.status = 'active';
  user.emailVerifiedAt = new Date();
  user.lastSeen = new Date();
  await user.save();

  const tokens = await issueTokenPair(user, req);
  return { user: user.toJSON(), tokens };
};

export const resendOtp = async ({ email, purpose }) => {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized });

  if (!user) return { sent: true }; // enumeration protection
  if (purpose === 'verify_email' && user.status !== 'unverified') {
    throw ApiError.badRequest('Email is already verified', 'ALREADY_VERIFIED');
  }

  // ৬০ সেকেন্ড কুলডাউন (updatedAt = সর্বশেষ OTP পাঠানোর সময়)
  const last = await OtpCode.findOne({ email: normalized, purpose });
  const rules = await getBusinessRules();
  const cooldown = rules.otp.resendCooldownSec;
  if (last) {
    const elapsed = (Date.now() - last.updatedAt.getTime()) / 1000;
    if (elapsed < cooldown) {
      throw ApiError.tooMany(`Please wait ${Math.ceil(cooldown - elapsed)}s before requesting a new code`, 'OTP_RESEND_TOO_SOON');
    }
  }

  await createAndSendOtp(normalized, purpose);
  return { sent: true };
};

export const login = async ({ email, password }, req) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || user.status === 'deleted') {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const match = await comparePassword(password, user.passwordHash);
  if (!match) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  if (user.status === 'unverified') {
    throw ApiError.forbidden('Please verify your email first', 'EMAIL_NOT_VERIFIED');
  }
  if (user.status === 'suspended') {
    throw ApiError.forbidden('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  user.lastSeen = new Date();
  await user.save();

  const tokens = await issueTokenPair(user, req);
  return { user: user.toJSON(), tokens };
};

export const refresh = async (presentedToken, req) => {
  if (!presentedToken) throw ApiError.unauthorized('Refresh token required', 'REFRESH_TOKEN_REQUIRED');

  let payload;
  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    throw ApiError.unauthorized('Session expired. Please login again.', 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = sha256(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });

  // Reuse detection: ভ্যালিড JWT কিন্তু DB-তে নেই/বাতিল → পুরনো টোকেন কেউ ব্যবহার করছে → সব সেশন বাতিল
  if (!record || record.revokedAt) {
    await revokeAllTokens(payload.sub);
    throw ApiError.unauthorized('Session expired. Please login again.', 'TOKEN_REUSE_DETECTED');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Session expired. Please login again.', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    await revokeAllTokens(payload.sub);
    throw ApiError.unauthorized('Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  const tokens = await issueTokenPair(user, req);
  record.revokedAt = new Date();
  record.replacedByHash = sha256(tokens.refreshToken);
  await record.save();

  return { tokens };
};

export const logout = async (userId, presentedToken) => {
  if (presentedToken) {
    await RefreshToken.updateOne(
      { tokenHash: sha256(presentedToken), userId },
      { $set: { revokedAt: new Date() } }
    );
  }
  return { loggedOut: true };
};

export const logoutAll = async (userId) => {
  await revokeAllTokens(userId);
  return { loggedOut: true };
};

export const forgotPassword = async ({ email }) => {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized });

  if (!user || user.status === 'deleted') return { sent: true }; // enumeration protection

  await createAndSendOtp(normalized, 'reset_password');
  return { sent: true };
};

export const verifyResetOtp = async ({ email, code }) => {
  const normalized = email.toLowerCase();
  const user = await User.findOne({ email: normalized });
  if (!user) throw ApiError.badRequest('Invalid or expired OTP', 'OTP_INVALID');

  await verifyOtp(normalized, 'reset_password', code);

  const resetToken = signPasswordResetToken({ sub: user._id.toString(), scope: 'password_reset' });
  return { resetToken };
};

export const resetPassword = async ({ resetToken, newPassword }) => {
  let payload;
  try {
    payload = verifyAccessToken(resetToken);
  } catch {
    throw ApiError.unauthorized('Reset session expired. Please start again.', 'INVALID_RESET_TOKEN');
  }
  if (payload.scope !== 'password_reset') {
    throw ApiError.unauthorized('Invalid reset token', 'INVALID_RESET_TOKEN');
  }

  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.status === 'deleted') {
    throw ApiError.unauthorized('Invalid reset token', 'INVALID_RESET_TOKEN');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllTokens(user._id);

  return { reset: true };
};

export const changePassword = async (userId, { oldPassword, newPassword }) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();

  const match = await comparePassword(oldPassword, user.passwordHash);
  if (!match) throw ApiError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllTokens(user._id);

  return { changed: true };
};