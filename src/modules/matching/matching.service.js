import mongoose from 'mongoose';
import { DonorProfile } from '../users/donorProfile.model.js';
import { RequestResponse } from '../requests/requestResponse.model.js';
import { BloodRequest } from '../requests/bloodRequest.model.js';
import { Notification } from '../notifications/notification.model.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { getBusinessRules, getPublishedConfig } from '../config/config.service.js';
import { User } from '../users/user.model.js';
import { COMPATIBLE_DONORS } from '../../constants/bloodGroups.js';
import { sendUrgentRequestEmail } from '../notifications/email.service.js';
import { logger } from '../../utils/logger.js';

const MAX_NOTIFY_PER_ROUND = 50;
const DAY = 86400000;

// স্বাস্থ্য ঘোষণায় কোনো "হ্যাঁ" থাকলে সাময়িক অযোগ্য (রোডম্যাপ পর্ব ৬)
const isHealthy = (d) => {
  const h = d.healthDeclaration || {};
  return (
    !h.surgery &&
    !h.tattooOrPiercing &&
    !h.onMedication &&
    !h.pregnantOrBreastfeeding &&
    !h.chronicDisease &&
    !(h.recentIllness && h.recentIllness.length)
  );
};

export const findMatchingDonors = async (request, options = {}) => {
  const rules = await getBusinessRules();
  const matching = rules.matching || {};
  const radii = matching.radiiKm || matching.radiusStepsKm || [10, 25, 50];
  const threshold = options.threshold ?? matching.threshold ?? matching.thresholdScore ?? 80;
  const maxRadiusKm = options.maxRadiusKm ?? Math.max(...radii);
  const gapDays = rules.donor?.donationGapDays ?? 120;
  const dailyNotifyLimit = matching.dailyNotifyLimit ?? matching.perDonorPerDay ?? 5;
  const compatible = COMPATIBLE_DONORS[request.bloodGroup] || [request.bloodGroup];
  const eligibleBefore = new Date(Date.now() - gapDays * DAY);
  const [lng, lat] = request.location.coordinates;

  const donors = await DonorProfile.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: maxRadiusKm * 1000,
        query: {
          bloodGroup: { $in: compatible },
          isAvailable: true,
          userId: { $ne: new mongoose.Types.ObjectId(request.requesterId) },
          $or: [{ lastDonationDate: null }, { lastDonationDate: { $lte: eligibleBefore } }],
        },
      },
    },
    { $match: { $expr: { $lte: ['$distanceMeters', { $multiply: ['$radiusKm', 1000] }] } } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $match: {
        'user.status': 'active',
        'user.emailVerifiedAt': { $ne: null },
        'user.modes.donor': true,
      },
    },
    { $limit: 500 },
  ]);

  if (!donors.length) return [];

  const healthyDonors = donors.filter(isHealthy);
  const donorIds = healthyDonors.map((donor) => donor.userId);
  const declined = await RequestResponse.find({
    requestId: request._id,
    donorId: { $in: donorIds },
    status: 'declined',
  }).select('donorId').lean();
  const declinedIds = new Set(declined.map((response) => response.donorId.toString()));
  const alreadyNotifiedIds = new Set((request.notifiedDonorIds || []).map((id) => id.toString()));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCounts = await Notification.aggregate([
    {
      $match: {
        userId: { $in: donorIds },
        type: { $in: ['blood_request', 'urgent_request', 'normal_request'] },
        createdAt: { $gte: startOfDay },
      },
    },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(todayCounts.map((count) => [count._id.toString(), count.count]));

  const matches = [];
  for (const donor of healthyDonors) {
    const userId = donor.userId.toString();
    if (declinedIds.has(userId) || alreadyNotifiedIds.has(userId)) continue;
    if ((countMap.get(userId) || 0) >= dailyNotifyLimit) continue;

    let score = donor.bloodGroup === request.bloodGroup ? 40 : 20;
    const maxDistanceMeters = Math.max(1, (donor.radiusKm || 10) * 1000);
    score += Math.round(Math.max(0, 30 * (1 - donor.distanceMeters / maxDistanceMeters)));
    if (request.upazilaId && donor.upazilaId?.toString() === request.upazilaId.toString()) score += 10;
    else if (request.districtId && donor.districtId?.toString() === request.districtId.toString()) score += 5;
    if (donor.user.lastSeen && Date.now() - new Date(donor.user.lastSeen).getTime() < 7 * DAY) score += 5;
    if ((donor.donationCount || 0) > 0) score += 5;
    if (donor.idVerified) score += 5;
    if (request.urgency === 'urgent' && donor.nightOk) score += 5;
    score = Math.min(100, score);

    if (score >= threshold) {
      matches.push({
        userId: donor.userId,
        name: donor.user.name,
        bloodGroup: donor.bloodGroup,
        distanceKm: Math.round(donor.distanceMeters / 100) / 10,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, MAX_NOTIFY_PER_ROUND);
};

export const findMatchedDonors = async (request, radiusKm) => {
  const matches = await findMatchingDonors(request, { maxRadiusKm: radiusKm });
  return matches.map((match) => ({ donorId: match.userId, score: match.score, distKm: match.distanceKm }));
};

export const matchAndNotify = async (requestId) => {
  try {
    const request = await BloodRequest.findById(requestId);
    if (!request || request.status !== 'open' || request.isHidden) return { notified: 0 };

    const matched = await findMatchingDonors(request, { maxRadiusKm: request.matchRadiusKm || undefined });

    if (matched.length) {
      const donorIds = matched.map((match) => match.userId);
      const urgent = request.urgency === 'urgent';
      await notifyUsers(donorIds, {
        type: urgent ? 'urgent_request' : 'normal_request',
        title: urgent ? `জরুরি: ${request.bloodGroup} রক্ত প্রয়োজন` : `${request.bloodGroup} রক্ত প্রয়োজন`,
        body: `${request.hospitalName} · ${request.bagsNeeded} ব্যাগ`,
        data: {
          requestId: request._id.toString(),
          bloodGroup: request.bloodGroup,
          urgency: request.urgency,
          component: request.component,
        },
        channelId: urgent ? 'urgent_requests' : 'requests',
      });

      const config = await getPublishedConfig();
      const topN = config?.businessRules?.matching?.urgentEmailTopN ??
        config?.businessRules?.urgentEmailTopN ?? 10;
      const emailEnabled =
        config?.featureFlags?.urgentEmail ?? config?.featureFlags?.emailForUrgentRequests ?? true;
      if (urgent && emailEnabled && topN > 0) {
        const topMatches = matched.slice(0, topN);
        const users = await User.find({
          _id: { $in: topMatches.map((match) => match.userId) },
          status: 'active',
        }).select('email notificationPrefs').lean();
        await Promise.allSettled(
          users
            .filter((user) => user.notificationPrefs?.email !== false && user.notificationPrefs?.urgentRequests !== false)
            .map((user) => {
              const match = topMatches.find((item) => item.userId.toString() === user._id.toString());
              return sendUrgentRequestEmail(user.email, {
                bloodGroup: request.bloodGroup,
                hospitalName: request.hospitalName,
                bagsNeeded: request.bagsNeeded,
                neededBy: request.neededBy,
                distanceKm: match?.distanceKm ?? '?',
              });
            })
        );
      }

      const notified = new Set((request.notifiedDonorIds || []).map((id) => id.toString()));
      for (const donorId of donorIds) notified.add(donorId.toString());
      request.notifiedDonorIds = [...notified];
      logger.info(`Matched ${donorIds.length} donor(s) for request ${requestId}`);
    }

    request.lastNotifiedAt = new Date();
    await request.save();
    return { notified: matched.length };
  } catch (err) {
    logger.error(`matchAndNotify failed for ${requestId}:`, err.message);
    return { notified: 0 };
  }
};

// cron থেকে ডাকা হয়: সাড়া না পেলে ব্যাসার্ধ ধাপে ধাপে বাড়ায় (১০ → ২৫ → ৫০)
export const escalateMatching = async () => {
  const rules = await getBusinessRules();
  const radii = rules.matching.radiiKm || rules.matching.radiusStepsKm || [10, 25, 50];
  const escalationMinutes = rules.matching.escalateAfterMinutes ?? rules.matching.escalationMinutes ?? 30;
  const cutoff = new Date(Date.now() - escalationMinutes * 60000);

  const candidates = await BloodRequest.find({
    status: 'open',
    isHidden: false,
    expiresAt: { $gt: new Date() },
    $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: cutoff } }],
  }).limit(20);

  let escalated = 0;
  for (const req of candidates) {
    const idx = radii.indexOf(req.matchRadiusKm);
    const nextIdx = idx === -1 ? 0 : idx + 1;
    if (nextIdx < radii.length) {
      req.matchRadiusKm = radii[nextIdx];
      await req.save();
      await matchAndNotify(req._id);
      escalated++;
    }
  }
  return { escalated };
};