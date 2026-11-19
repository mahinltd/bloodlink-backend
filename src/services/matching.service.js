// BloodLink Backend - Service: Smart Donor Matching Engine
const env = require('../config/env');
const logger = require('../utils/logger');
const DonorProfile = require('../models/DonorProfile');
const BloodRequest = require('../models/BloodRequest');
const DonorResponse = require('../models/DonorResponse');
const NotificationJob = require('../models/NotificationJob');
const notificationService = require('./notification.service');
const { COMPATIBLE_DONOR_GROUPS, REQUEST_STATUS } = require('../constants');

const ACTIVE_STATUSES = [REQUEST_STATUS.PENDING, REQUEST_STATUS.SEARCHING, REQUEST_STATUS.DONOR_RESPONDED];

// ধাপে ধাপে radius expansion (duplicate সরিয়ে sort)
const RADIUS_STAGES = [...new Set([env.matching.defaultRadiusKm, 25, 50, env.matching.maxRadiusKm])].sort((a, b) => a - b);
const MIN_MATCH_TARGET = 15;

// ⚠️ Operational Priority Score — শুধু donor ranking-এর জন্য।
// এটি Medical Compatibility বা Clinical Approval Score নয় (ডকুমেন্ট §৪)।
const computeScore = (donor, radiusKm) => {
  let score = 0;

  if (donor.distanceKm != null) score += Math.max(0, 50 * (1 - donor.distanceKm / radiusKm)); // কাছে = বেশি
  else score += 25; // location না থাকলে neutral

  if (donor.user.isVerified) score += 25; // NID verified badge

  score += Math.min(donor.totalDonationCount || 0, 10) * 1.5; // অভিজ্ঞতা (max 15)

  const daysSince = donor.lastDonationDate
    ? Math.floor((Date.now() - new Date(donor.lastDonationDate).getTime()) / 86400000)
    : null;
  if (daysSince === null || daysSince >= 180) score += 10;
  else if (daysSince >= 120) score += 5;

  return Math.round(score);
};

// Hard filters: compatibility + availability + eligibility + prefs + geo
const findMatchingDonors = async (request, radiusKm, excludeUserIds = []) => {
  const compatibleGroups = COMPATIBLE_DONOR_GROUPS[request.bloodGroup] || [request.bloodGroup];

  const match = {
    bloodGroup: { $in: compatibleGroups },
    availabilityStatus: 'available',
    'notificationPrefs.enabled': true,
    [`notificationPrefs.${request.urgency}`]: true,
    $or: [{ nextEligibleDate: null }, { nextEligibleDate: { $lte: new Date() } }],
    user: { $nin: excludeUserIds },
  };

  const hasGeo = request.hospitalLocation && request.hospitalLocation.coordinates;
  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: request.hospitalLocation.coordinates },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.accountStatus': 'active' } },
    { $limit: 100 },
    {
      $project: {
        bloodGroup: 1, gender: 1, availabilityStatus: 1, totalDonationCount: 1,
        lastDonationDate: 1, address: 1, distanceMeters: 1,
        'user._id': 1, 'user.fullName': 1, 'user.email': 1, 'user.avatar': 1, 'user.isVerified': 1,
      },
    }
  );

  const donors = await DonorProfile.aggregate(pipeline);

  return donors
    .map((d) => ({
      ...d,
      distanceKm: d.distanceMeters != null ? Math.round((d.distanceMeters / 1000) * 10) / 10 : null,
      distanceMeters: undefined,
    }))
    .map((d) => ({ ...d, score: computeScore(d, radiusKm) }))
    .sort((a, b) => b.score - a.score);
};

// ইতিমধ্যে notify করা + not_available বলা donor-দের বাদ
const getExcludedDonorIds = async (request) => {
  const [notAvailable, notified] = await Promise.all([
    DonorResponse.find({ request: request._id, responseType: 'not_available' }).distinct('donor'),
    NotificationJob.find({ request: request._id, channel: 'fcm' }).distinct('donor'),
  ]);
  return [request.requester, ...notAvailable, ...notified];
};

const runMatchingPipeline = async (request, stages) => {
  let totalMatched = 0;

  for (const radiusKm of stages) {
    const excludeIds = await getExcludedDonorIds(request);
    const donors = await findMatchingDonors(request, radiusKm, excludeIds);

    if (donors.length > 0) {
      await notificationService.notifyMatchedDonors(request, donors, radiusKm);
      totalMatched += donors.length;
    }

    logger.info(`Matching [${request.requestId}] radius=${radiusKm}km → found=${donors.length}, total=${totalMatched}`);

    if (totalMatched >= MIN_MATCH_TARGET) break;
  }

  return totalMatched;
};

// Request তৈরির পর মূল entry point
const startMatching = async (requestId) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw new Error(`Request not found: ${requestId}`);
  if (!ACTIVE_STATUSES.includes(request.status)) {
    logger.info(`Matching skipped for ${request.requestId} — status: ${request.status}`);
    return 0;
  }

  const totalMatched = await runMatchingPipeline(request, RADIUS_STAGES);

  if (totalMatched === 0) {
    // Emergency Escalation — reminder.job প্রতি ৩০ মিনিটে SOS-এর জন্য retry করবে
    logger.warn(`⚠️ No donors matched for ${request.requestId}. Escalation will retry.`);
    await notificationService.notifyRequester(request, {
      type: 'system',
      title: '🔍 Searching for donors...',
      body: `We are expanding the search for your request ${request.requestId}. You will be notified as donors are found.`,
      data: { requestId: request._id },
    });
  }

  return totalMatched;
};

// SOS escalation — শুধু max radius-এ
const escalateRequest = async (requestId) => {
  const request = await BloodRequest.findById(requestId);
  if (!request || !ACTIVE_STATUSES.includes(request.status)) return 0;
  logger.warn(`🚨 Escalating ${request.requestId} to max radius (${env.matching.maxRadiusKm}km)`);
  return runMatchingPipeline(request, [env.matching.maxRadiusKm]);
};

// Fire-and-forget wrapper (controller থেকে await ছাড়া call)
const queueMatching = (requestId) => {
  startMatching(requestId).catch((err) => logger.error(`Matching failed for ${requestId}:`, err.message));
};

// Requester-এর জন্য preview (score গোপন থাকবে — operational only)
const previewMatches = async (request) => {
  const excludeIds = [request.requester];
  const donors = await findMatchingDonors(request, env.matching.maxRadiusKm, excludeIds);
  const notifiedCount = await NotificationJob.countDocuments({ request: request._id, channel: 'fcm' });

  return {
    totalMatched: donors.length,
    alreadyNotified: notifiedCount,
    donors: donors.slice(0, 50).map((d) => ({
      donorId: d._id,
      fullName: d.user.fullName,
      avatar: d.user.avatar,
      isVerified: d.user.isVerified,
      bloodGroup: d.bloodGroup,
      address: d.address,
      distanceKm: d.distanceKm,
      totalDonationCount: d.totalDonationCount,
    })),
  };
};

module.exports = { startMatching, escalateRequest, queueMatching, previewMatches, findMatchingDonors };