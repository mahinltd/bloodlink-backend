import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { User } from '../users/user.model.js';
import { getBusinessRules } from '../config/config.service.js';

const DAY = 86400000;
const oid = (id) => new mongoose.Types.ObjectId(id);
const isHealthEligible = (health = {}) =>
  !health.surgery &&
  !health.tattooOrPiercing &&
  !health.onMedication &&
  !health.pregnantOrBreastfeeding &&
  !health.chronicDisease &&
  !(health.recentIllness && health.recentIllness.length);

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* শুধু যারা: ডোনার মোডে, available, সক্রিয়+ভেরিফাইড, এবং দান-যোগ্য (ব্যবধান পার) */
export const searchDonors = async (query, viewerId) => {
  const rules = await getBusinessRules();
  const gapDays = rules.donor?.donationGapDays ?? 120;
  const cutoff = new Date(Date.now() - gapDays * DAY);

  const { bloodGroup, divisionId, districtId, upazilaId, unionId, villageId, lat, lng, page, limit } = query;

  const match = {
    isAvailable: true,
    userId: { $ne: oid(viewerId) },
    $or: [{ lastDonationDate: null }, { lastDonationDate: { $lte: cutoff } }],
    $nor: [
      { 'healthDeclaration.surgery': true },
      { 'healthDeclaration.tattooOrPiercing': true },
      { 'healthDeclaration.onMedication': true },
      { 'healthDeclaration.pregnantOrBreastfeeding': true },
      { 'healthDeclaration.chronicDisease': true },
      { 'healthDeclaration.recentIllness.0': { $exists: true } },
    ],
  };
  if (bloodGroup) match.bloodGroup = bloodGroup;
  if (divisionId) match.divisionId = oid(divisionId);
  if (districtId) match.districtId = oid(districtId);
  if (upazilaId) match.upazilaId = oid(upazilaId);
  if (unionId) match.unionId = oid(unionId);
  if (villageId) match.villageId = oid(villageId);

  const hasGeo = lat !== undefined && lng !== undefined;
  const pipeline = [];
  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: 200 * 1000,
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }
  pipeline.push(
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $match: {
        'user.status': 'active',
        'user.emailVerifiedAt': { $ne: null },
        'user.modes.donor': true,
      },
    },
    { $lookup: { from: 'districts', localField: 'districtId', foreignField: '_id', as: 'district' } },
    { $lookup: { from: 'upazilas', localField: 'upazilaId', foreignField: '_id', as: 'upazila' } }
  );
  if (!hasGeo) pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

  const rows = await DonorProfile.aggregate(pipeline);

  const items = rows.map((d) => ({
    id: d.userId,
    name: d.user.name,
    avatar: d.user.avatar,
    phone: d.user.phone,
    bloodGroup: d.bloodGroup,
    gender: d.gender,
    donationCount: d.donationCount,
    idVerified: d.idVerified,
    distanceKm: d.distanceMeters != null ? Math.round((d.distanceMeters / 1000) * 10) / 10 : null,
    area: {
      district: d.district?.[0] ? { bn: d.district[0].nameBn, en: d.district[0].nameEn } : null,
      upazila: d.upazila?.[0] ? { bn: d.upazila[0].nameBn, en: d.upazila[0].nameEn } : null,
    },
  }));
  return { items, page, limit };
};

export const getDonor = async (donorUserId, viewerId, query) => {
  const rules = await getBusinessRules();
  const gapDays = rules.donor?.donationGapDays ?? 120;
  const cutoff = Date.now() - gapDays * DAY;

  const d = await DonorProfile.findOne({ userId: donorUserId })
    .populate('districtId', 'nameBn nameEn')
    .populate('upazilaId', 'nameBn nameEn')
    .lean();
  if (!d) throw ApiError.notFound('Donor not found', 'DONOR_NOT_FOUND');

  const user = await User.findById(donorUserId)
    .select('name avatar phone status emailVerifiedAt modes')
    .lean();
  if (!user || user.status !== 'active' || !user.emailVerifiedAt || !user.modes?.donor) {
    throw ApiError.notFound('Donor not found', 'DONOR_NOT_FOUND');
  }

  const [lng, lat] = d.location?.coordinates || [];
  let distanceKm = null;
  if (query.lat !== undefined && query.lng !== undefined && lat !== undefined) {
    distanceKm = Math.round(haversineKm(query.lat, query.lng, lat, lng) * 10) / 10;
  }

  const isEligible =
    (!d.lastDonationDate || new Date(d.lastDonationDate).getTime() <= cutoff) &&
    isHealthEligible(d.healthDeclaration);

  return {
    donor: {
      id: d.userId,
      name: user.name,
      avatar: user.avatar,
      bloodGroup: d.bloodGroup,
      gender: d.gender,
      donationCount: d.donationCount,
      idVerified: d.idVerified,
      isAvailable: d.isAvailable,
      isEligible,
      distanceKm,
      area: {
        district: d.districtId ? { bn: d.districtId.nameBn, en: d.districtId.nameEn } : null,
        upazila: d.upazilaId ? { bn: d.upazilaId.nameBn, en: d.upazilaId.nameEn } : null,
      },
      phone: user.phone,
    },
  };
};

/* Deprecated compatibility endpoint; verified viewers can now see phones directly. */
export const revealPhone = async (_viewerId, donorUserId) => {
  const donorUser = await User.findOne({
    _id: donorUserId,
    status: 'active',
    emailVerifiedAt: { $ne: null },
  })
    .select('phone')
    .lean();
  if (!donorUser) {
    throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  }
  return { phone: donorUser.phone };
};