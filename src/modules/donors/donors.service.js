import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import { COMPATIBLE_DONORS } from '../../constants/bloodGroups.js';
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
  const {
    bloodGroup, compatible, availableOnly = true, eligibleOnly = true,
    divisionId, districtId, upazilaId, unionId, villageId,
    lat, lng, radiusKm, sort, page, limit,
  } = query;

  const match = { userId: { $ne: oid(viewerId) } };
  if (availableOnly) match.isAvailable = true;
  if (eligibleOnly) {
    match.$or = [{ lastDonationDate: null }, { lastDonationDate: { $lte: cutoff } }];
    match.$nor = [
      { 'healthDeclaration.surgery': true },
      { 'healthDeclaration.tattooOrPiercing': true },
      { 'healthDeclaration.onMedication': true },
      { 'healthDeclaration.pregnantOrBreastfeeding': true },
      { 'healthDeclaration.chronicDisease': true },
      { 'healthDeclaration.recentIllness.0': { $exists: true } },
    ];
  }
  if (bloodGroup) {
    match.bloodGroup = compatible
      ? { $in: COMPATIBLE_DONORS[bloodGroup] || [bloodGroup] }
      : bloodGroup;
  }
  if (divisionId) match.divisionId = oid(divisionId);
  if (districtId) match.districtId = oid(districtId);
  if (upazilaId) match.upazilaId = oid(upazilaId);
  if (unionId) match.unionId = oid(unionId);
  if (villageId) match.villageId = oid(villageId);

  const hasGeo = lat !== undefined && lng !== undefined;
  const basePipeline = [];
  if (hasGeo) {
    basePipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: (radiusKm ?? 200) * 1000,
        query: match,
      },
    });
  } else {
    basePipeline.push({ $match: match });
  }
  basePipeline.push(
    { $lookup: { from: User.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $match: {
        'user.status': 'active',
        'user.emailVerifiedAt': { $ne: null },
        'user.modes.donor': true,
      },
    },
  );

  const sortStage = hasGeo && sort !== 'recently_active'
    ? { $sort: { distanceMeters: 1 } }
    : { $sort: { 'user.lastSeen': -1, updatedAt: -1 } };
  const [rows, countResult] = await Promise.all([
    DonorProfile.aggregate([
      ...basePipeline,
      { $lookup: { from: 'divisions', localField: 'divisionId', foreignField: '_id', as: 'division' } },
      { $lookup: { from: 'districts', localField: 'districtId', foreignField: '_id', as: 'district' } },
      { $lookup: { from: 'upazilas', localField: 'upazilaId', foreignField: '_id', as: 'upazila' } },
      { $lookup: { from: 'unions', localField: 'unionId', foreignField: '_id', as: 'union' } },
      sortStage,
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    DonorProfile.aggregate([...basePipeline, { $count: 'total' }]),
  ]);

  const items = rows.map((d) => {
    const item = {
      id: d.userId,
      name: d.user.name,
      avatar: d.user.avatar,
      phone: d.user.phone,
      bloodGroup: d.bloodGroup,
      gender: d.gender,
      donationCount: d.donationCount,
      idVerified: d.idVerified,
      isAvailable: d.isAvailable,
      isEligible:
        (!d.lastDonationDate || new Date(d.lastDonationDate).getTime() <= cutoff.getTime()) &&
        isHealthEligible(d.healthDeclaration),
      distanceKm: d.distanceMeters != null ? Math.round((d.distanceMeters / 1000) * 10) / 10 : null,
      area: {
        division: d.division?.[0] ? { bn: d.division[0].nameBn, en: d.division[0].nameEn } : null,
        district: d.district?.[0] ? { bn: d.district[0].nameBn, en: d.district[0].nameEn } : null,
        upazila: d.upazila?.[0] ? { bn: d.upazila[0].nameBn, en: d.upazila[0].nameEn } : null,
        union: d.union?.[0] ? { bn: d.union[0].nameBn, en: d.union[0].nameEn } : null,
      },
    };
    if (d.user.privacy?.showLastDonation === true) item.lastDonationDate = d.lastDonationDate || null;
    return item;
  });
  const total = countResult[0]?.total || 0;
  return { items, page, limit, total, hasMore: page * limit < total };
};

export const getDonor = async (donorUserId, viewerId, query) => {
  const rules = await getBusinessRules();
  const gapDays = rules.donor?.donationGapDays ?? 120;
  const cutoff = Date.now() - gapDays * DAY;

  const d = await DonorProfile.findOne({ userId: donorUserId })
    .populate('divisionId', 'nameBn nameEn')
    .populate('districtId', 'nameBn nameEn')
    .populate('upazilaId', 'nameBn nameEn')
    .populate('unionId', 'nameBn nameEn')
    .lean();
  if (!d) throw ApiError.notFound('Donor not found', 'DONOR_NOT_FOUND');

  const user = await User.findById(donorUserId)
    .select('name avatar phone privacy status emailVerifiedAt modes')
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
        division: d.divisionId ? { bn: d.divisionId.nameBn, en: d.divisionId.nameEn } : null,
        district: d.districtId ? { bn: d.districtId.nameBn, en: d.districtId.nameEn } : null,
        upazila: d.upazilaId ? { bn: d.upazilaId.nameBn, en: d.upazilaId.nameEn } : null,
        union: d.unionId ? { bn: d.unionId.nameBn, en: d.unionId.nameEn } : null,
      },
      phone: user.phone,
      ...(user.privacy?.showLastDonation === true ? { lastDonationDate: d.lastDonationDate || null } : {}),
    },
  };
};

/* Deprecated compatibility endpoint; verified viewers can now see phones directly. */
export const revealPhone = async (_viewerId, donorUserId) => {
  const donorUser = await User.findOne({
    _id: donorUserId,
    status: 'active',
    emailVerifiedAt: { $ne: null },
    'modes.donor': true,
  })
    .select('phone')
    .lean();
  if (!donorUser) {
    throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  }
  return { phone: donorUser.phone };
};