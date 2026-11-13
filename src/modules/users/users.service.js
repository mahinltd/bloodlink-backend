import { z } from 'zod';
import ApiError from '../../utils/ApiError.js';
import { comparePassword } from '../../utils/hash.util.js';
import { User } from './user.model.js';
import { DonorProfile } from './donorProfile.model.js';
import { IdVerification } from './idVerification.model.js';
import { Device } from '../notifications/device.model.js';
import { Donation } from '../requests/donation.model.js';
import { RefreshToken } from '../auth/refreshToken.model.js';
import { getBusinessRules, getTermsVersion } from '../config/config.service.js';
import { resolveVillageName, touchVillageUsage } from '../locations/locations.service.js';

const DAY_MS = 86400000;

const assertActiveUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.status === 'deleted') throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  if (user.status !== 'active') throw ApiError.forbidden('Your account is not active', 'ACCOUNT_NOT_ACTIVE');
  return user;
};

const calcAge = (dob) => Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * DAY_MS));

const calcEligibility = async (profile) => {
  const rules = (await getBusinessRules()).donor;
  const last = profile?.lastDonationDate ? new Date(profile.lastDonationDate) : null;
  const nextEligibleDate = last ? new Date(last.getTime() + rules.donationGapDays * DAY_MS) : null;
  return {
    isEligible: !nextEligibleDate || nextEligibleDate.getTime() <= Date.now(),
    nextEligibleDate,
    gapDays: rules.donationGapDays,
  };
};

const isHealthEligible = (health = {}) =>
  !health.surgery &&
  !health.tattooOrPiercing &&
  !health.onMedication &&
  !health.pregnantOrBreastfeeding &&
  !health.chronicDisease &&
  !(health.recentIllness && health.recentIllness.length);

const assertDonorEligible = async (donor) => {
  const rules = (await getBusinessRules()).donor;
  const age = calcAge(donor.dob);
  if (age < rules.minAge || age > rules.maxAge) {
    throw ApiError.badRequest(`Donor age must be between ${rules.minAge} and ${rules.maxAge}`, 'DONOR_AGE_NOT_ELIGIBLE');
  }
  if (donor.weightKg < rules.minWeightKg) {
    throw ApiError.badRequest(`Donor weight must be at least ${rules.minWeightKg} kg`, 'DONOR_WEIGHT_NOT_ELIGIBLE');
  }
  if (donor.lastDonationDate && new Date(donor.lastDonationDate) > new Date()) {
    throw ApiError.badRequest('Last donation date cannot be in the future', 'INVALID_DONATION_DATE');
  }
};

const resolveVillage = async (userId, donor) => {
  if (donor.villageId) {
    await touchVillageUsage(donor.villageId, userId);
    return donor.villageId;
  }
  if (donor.villageName && donor.unionId) {
    const village = await resolveVillageName({
      unionId: donor.unionId,
      nameBn: donor.villageName,
      userId,
    });
    return village?._id || null;
  }
  return null;
};

const applyDonorFields = (profile, donor, villageId) => {
  const fields = [
    'bloodGroup', 'dob', 'gender', 'weightKg', 'lastDonationDate', 'donationCount',
    'healthDeclaration', 'radiusKm', 'nightOk', 'divisionId', 'districtId', 'upazilaId',
    'unionId', 'villageName', 'addressDetail',
  ];
  for (const field of fields) {
    if (donor[field] !== undefined) profile[field] = donor[field];
  }
  if (donor.coordinates) {
    profile.location = { type: 'Point', coordinates: [donor.coordinates.lng, donor.coordinates.lat] };
  }
  if (villageId !== undefined) profile.villageId = villageId;
};

export const getMe = async (userId) => {
  const user = await assertActiveUser(userId);
  const donorProfile = await DonorProfile.findOne({ userId }).lean();
  const termsVersion = await getTermsVersion();
  return {
    user: user.toJSON(),
    donorProfile,
    eligibility: donorProfile ? await calcEligibility(donorProfile) : null,
    termsVersion,
    needsTermsAcceptance: user.acceptedTermsVersion !== termsVersion,
  };
};

export const acceptTerms = async (userId, submittedVersion) => {
  const user = await assertActiveUser(userId);
  const termsVersion = await getTermsVersion();
  if (submittedVersion !== termsVersion) {
    throw ApiError.conflict('Terms have been updated; please accept the current version', 'TERMS_VERSION_MISMATCH');
  }

  user.acceptedTermsVersion = termsVersion;
  user.consents.termsAcceptedAt = new Date();
  await user.save();
  return { accepted: true, acceptedTermsVersion: user.acceptedTermsVersion };
};

export const updateMe = async (userId, payload) => {
  const user = await assertActiveUser(userId);
  if (payload.name !== undefined) user.name = payload.name;
  if (payload.phone !== undefined) user.phone = payload.phone;

  if (payload.donor) {
    const profile = await DonorProfile.findOne({ userId });
    if (!profile) throw ApiError.badRequest('Donor mode is not enabled', 'DONOR_MODE_OFF');
    const villageId =
      payload.donor.villageId !== undefined || payload.donor.villageName !== undefined
        ? await resolveVillage(userId, { ...profile.toObject(), ...payload.donor })
        : undefined;
    const candidate = { ...profile.toObject(), ...payload.donor };
    await assertDonorEligible(candidate);
    applyDonorFields(profile, payload.donor, villageId);
    await profile.save();
  }

  await user.save();
  return getMe(userId);
};

export const updateAvatar = async (userId, avatar) => {
  const user = await assertActiveUser(userId);
  user.avatar = avatar;
  await user.save();
  return { avatar: user.avatar };
};

export const enableDonorMode = async (userId, payload) => {
  const user = await assertActiveUser(userId);
  const { consents, ...donor } = payload;
  if (consents?.phonePublicInApp !== true) {
    throw ApiError.badRequest('Phone visibility consent is required for donor mode', 'PHONE_CONSENT_REQUIRED');
  }
  await assertDonorEligible(donor);
  const villageId = await resolveVillage(userId, donor);
  const profile = await DonorProfile.findOne({ userId }) || new DonorProfile({ userId });
  applyDonorFields(profile, donor, villageId);
  const eligibility = await calcEligibility(profile);
  profile.isAvailable = eligibility.isEligible && isHealthEligible(profile.healthDeclaration);
  await profile.save();
  user.modes.donor = true;
  const termsVersion = await getTermsVersion();
  user.consents.phonePublicInApp = true;
  user.consents.phonePublicInAppAcceptedAt = new Date();
  user.consents.phonePublicInAppTermsVersion = termsVersion;
  await user.save();
  return { user: user.toJSON(), donorProfile: profile };
};

export const setAvailability = async (userId, isAvailable) => {
  await assertActiveUser(userId);
  const profile = await DonorProfile.findOne({ userId });
  if (!profile) throw ApiError.badRequest('Donor mode is not enabled', 'DONOR_MODE_OFF');
  if (isAvailable) {
    await assertDonorEligible(profile);
    const eligibility = await calcEligibility(profile);
    if (!eligibility.isEligible) {
      throw ApiError.badRequest('You have not completed the donation cooldown period', 'DONATION_COOLDOWN_ACTIVE');
    }
    if (!isHealthEligible(profile.healthDeclaration)) {
      throw ApiError.badRequest('Your health declaration temporarily makes you ineligible to donate', 'DONOR_HEALTH_NOT_ELIGIBLE');
    }
  }
  profile.isAvailable = isAvailable;
  await profile.save();
  return { isAvailable: profile.isAvailable };
};

export const updateSettings = async (userId, settings) => {
  const user = await assertActiveUser(userId);
  if (settings.language !== undefined) user.language = settings.language;
  if (settings.theme !== undefined) user.theme = settings.theme;
  if (settings.notificationPrefs) {
    const currentPrefs = user.notificationPrefs?.toObject?.() || user.notificationPrefs || {};
    user.notificationPrefs = { ...currentPrefs, ...settings.notificationPrefs };
  }
  if (settings.privacy) {
    const currentPrivacy = user.privacy?.toObject?.() || user.privacy || {};
    user.privacy = { ...currentPrivacy, ...settings.privacy };
  }
  await user.save();
  return {
    language: user.language,
    theme: user.theme,
    notificationPrefs: user.notificationPrefs,
    privacy: user.privacy,
  };
};

export const updateLocation = async (userId, payload) => {
  await assertActiveUser(userId);
  const profile = await DonorProfile.findOne({ userId });
  if (!profile) throw ApiError.badRequest('Donor mode is not enabled', 'DONOR_MODE_OFF');
  profile.location = { type: 'Point', coordinates: [payload.coordinates.lng, payload.coordinates.lat] };

  for (const field of ['divisionId', 'districtId', 'upazilaId', 'unionId', 'villageName', 'addressDetail']) {
    if (payload[field] !== undefined) profile[field] = payload[field];
  }
  if (payload.villageId !== undefined || payload.villageName !== undefined || payload.unionId !== undefined) {
    profile.villageId = await resolveVillage(userId, {
      villageId: payload.villageId ?? null,
      villageName: payload.villageName ?? profile.villageName,
      unionId: payload.unionId ?? profile.unionId,
    });
  }

  await profile.save();
  return {
    coordinates: { lat: payload.coordinates.lat, lng: payload.coordinates.lng },
    divisionId: profile.divisionId,
    districtId: profile.districtId,
    upazilaId: profile.upazilaId,
    unionId: profile.unionId,
    villageId: profile.villageId,
    villageName: profile.villageName,
  };
};

export const registerDevice = async (userId, { fcmToken, platform, appVersion, deviceId }) => {
  await assertActiveUser(userId);
  const device = await Device.findOneAndUpdate(
    { fcmToken },
    { $set: { userId, platform, appVersion: appVersion || null, deviceId: deviceId || null, lastActiveAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return { deviceId: device._id, platform: device.platform };
};

export const removeDevice = async (userId, fcmToken) => {
  await assertActiveUser(userId);
  const result = await Device.deleteOne({ userId, fcmToken });
  return { removed: result.deletedCount > 0 };
};

export const submitIdVerification = async (userId, images) => {
  await assertActiveUser(userId);
  let idv = await IdVerification.findOne({ userId }).select('+frontImage +backImage +selfie');
  if (idv && ['pending', 'approved'].includes(idv.status)) {
    throw ApiError.conflict('An ID verification is already pending or approved', 'ID_VERIFICATION_EXISTS');
  }
  if (!idv) idv = new IdVerification({ userId });
  idv.frontImage = images.frontImage;
  idv.backImage = images.backImage;
  idv.selfie = images.selfie;
  idv.status = 'pending';
  idv.rejectReason = null;
  idv.reviewNote = '';
  idv.reviewedBy = null;
  idv.reviewedAt = null;
  await idv.save();
  return { id: idv._id, status: idv.status };
};

export const getIdVerification = async (userId) => {
  await assertActiveUser(userId);
  const idv = await IdVerification.findOne({ userId })
    .select('status rejectReason reviewNote reviewedAt createdAt updatedAt')
    .lean();
  return { verification: idv || null };
};

export const getDonations = async (userId) => {
  await assertActiveUser(userId);
  const items = await Donation.find({ donorId: userId })
    .sort({ date: -1 })
    .populate('requestId', 'patientName bloodGroup component hospitalName bagsNeeded')
    .lean();
  return { items };
};

export const deleteAccount = async (userId, password) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || user.status === 'deleted') throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  if (!(await comparePassword(password, user.passwordHash))) {
    throw ApiError.badRequest('Password is incorrect', 'INVALID_PASSWORD');
  }

  user.status = 'deleted';
  user.deletedAt = new Date();
  user.modes.donor = false;
  await user.save();
  await Promise.all([
    DonorProfile.updateOne({ userId }, { $set: { isAvailable: false } }),
    RefreshToken.deleteMany({ userId }),
    Device.deleteMany({ userId }),
  ]);
  return { deleted: true, hardDeleteAfter: new Date(user.deletedAt.getTime() + 30 * DAY_MS) };
};