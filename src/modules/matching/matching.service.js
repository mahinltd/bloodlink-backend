import { DonorProfile } from '../users/donorProfile.model.js';
import { RequestResponse } from '../requests/requestResponse.model.js';
import { BloodRequest } from '../requests/bloodRequest.model.js';
import { Notification } from '../notifications/notification.model.js';
import { notifyRequestDonors } from '../notifications/notifications.service.js';
import { getBusinessRules, getPublishedConfig } from '../config/config.service.js';
import { User } from '../users/user.model.js';
import { COMPATIBLE_DONORS } from '../../constants/bloodGroups.js';
import { sendRequestNotificationEmail } from '../notifications/email.service.js';
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
  const maxRecipients = options.maxRecipients ?? matching.maxRecipientsPerRequest ?? MAX_NOTIFY_PER_ROUND;
  const gapDays = rules.donor?.donationGapDays ?? 120;
  const dailyNotifyLimit = matching.dailyNotifyLimit ?? matching.perDonorPerDay ?? 5;
  const compatible = COMPATIBLE_DONORS[request.bloodGroup] || [request.bloodGroup];
  const eligibleBefore = new Date(Date.now() - gapDays * DAY);
  const [lng, lat] = request.location.coordinates;
  const excludedIds = [
    request.requesterId,
    ...(request.notifiedDonorIds || []),
    ...(options.excludeIds || []),
  ].filter(Boolean);
  const query = {
    bloodGroup: { $in: compatible },
    isAvailable: true,
    userId: { $nin: [...new Map(excludedIds.map((id) => [id.toString(), id])).values()] },
    $or: [{ lastDonationDate: null }, { lastDonationDate: { $lte: eligibleBefore } }],
  };
  if (options.locationScope) {
    const [field, value] = Object.entries(options.locationScope)[0] || [];
    if (field && value) query[field] = value;
  }

  const donors = await DonorProfile.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: maxRadiusKm * 1000,
        query,
      },
    },
    {
      $match: {
        $or: [
          { $expr: { $lte: ['$distanceMeters', { $multiply: ['$radiusKm', 1000] }] } },
          ...(request.upazilaId ? [{ upazilaId: request.upazilaId }] : []),
          ...(request.districtId ? [{ districtId: request.districtId }] : []),
        ],
      },
    },
    { $lookup: { from: User.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
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

  const requestPref = request.urgency === 'normal' ? 'normalRequests' : 'urgentRequests';
  const healthyDonors = donors.filter(
    (donor) =>
      isHealthy(donor) &&
      donor.user.notificationPrefs?.push !== false &&
      donor.user.notificationPrefs?.[requestPref] !== false
  );
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
        type: {
          $in: [
            'blood_request',
            'urgent_request',
            'normal_request',
            'request_sos',
            'request_urgent',
            'request_normal',
          ],
        },
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
  return matches.slice(0, maxRecipients);
};

export const findMatchedDonors = async (request, radiusKm) => {
  const matches = await findMatchingDonors(request, { maxRadiusKm: radiusKm });
  return matches.map((match) => ({ donorId: match.userId, score: match.score, distKm: match.distanceKm }));
};

export const fanOutRequestNotifications = async (request, matched, options = {}) => {
  const type = request.urgency === 'sos'
    ? 'request_sos'
    : request.urgency === 'urgent'
      ? 'request_urgent'
      : 'request_normal';
  const title = {
    bn: request.urgency === 'sos'
      ? `SOS: ${request.bloodGroup} রক্ত প্রয়োজন`
      : request.urgency === 'urgent'
        ? `জরুরি: ${request.bloodGroup} রক্ত প্রয়োজন`
        : `${request.bloodGroup} রক্ত প্রয়োজন`,
    en: request.urgency === 'sos'
      ? `SOS: ${request.bloodGroup} blood needed`
      : request.urgency === 'urgent'
        ? `Urgent: ${request.bloodGroup} blood needed`
        : `${request.bloodGroup} blood needed`,
  };
  const body = {
    bn: `${request.hospitalName} · ${request.bagsNeeded} ব্যাগ`,
    en: `${request.hospitalName} · ${request.bagsNeeded} bag(s)`,
  };
  const data = {
    requestId: String(request._id),
    bloodGroup: request.bloodGroup,
    hospitalName: request.hospitalName,
    urgency: request.urgency,
    ...(request.urgency === 'sos' ? { sound: 'default' } : {}),
  };
  const recipients = await (options.notificationSender || notifyRequestDonors)(
    {
      userIds: matched.map((match) => match.userId),
      requestId: request._id,
      type,
      title,
      body,
      data,
      priority: request.urgency === 'normal' ? 'normal' : 'high',
    },
    options.pushSender ? { pushSender: options.pushSender } : undefined
  );

  const config = await getPublishedConfig();
  const urgentEmailEnabled =
    config?.featureFlags?.urgentEmail ?? config?.featureFlags?.emailForUrgentRequests ?? true;
  const shouldEmail = request.urgency === 'sos' || (request.urgency === 'urgent' && urgentEmailEnabled);
  if (!shouldEmail) return recipients;

  const topN = request.urgency === 'urgent'
    ? config?.businessRules?.matching?.urgentEmailTopN ?? config?.businessRules?.urgentEmailTopN ?? 10
    : recipients.users.length;
  const users = recipients.users
    .filter((user) => user.email && user.notificationPrefs?.email !== false)
    .slice(0, Math.max(0, topN));
  const results = await Promise.allSettled(
    users.map((user) =>
      (options.emailSender || sendRequestNotificationEmail)(user.email, {
        bloodGroup: request.bloodGroup,
        hospitalName: request.hospitalName,
        bagsNeeded: request.bagsNeeded,
        neededBy: request.neededBy,
        urgency: request.urgency,
        language: user.language === 'en' ? 'en' : 'bn',
      })
    )
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(`request email failed for ${request._id} to recipient ${index}:`, result.reason?.message);
    }
  });
  return recipients;
};

export const matchAndNotify = async (requestId) => {
  try {
    const request = await BloodRequest.findById(requestId);
    if (!request || request.status !== 'open' || request.isHidden) return { notified: 0 };

    const rules = await getBusinessRules();
    const matching = rules.matching || {};
    const maxRecipients = matching.maxRecipientsPerRequest ?? MAX_NOTIFY_PER_ROUND;
    let matched;
    if (request.urgency === 'sos') {
      const maxRadiusKm = matching.sosMaxRadiusKm ?? 200;
      const area = request.upazilaId
        ? { upazilaId: request.upazilaId }
        : request.districtId
          ? { districtId: request.districtId }
          : null;
      matched = await findMatchingDonors(request, {
        maxRadiusKm,
        maxRecipients,
        threshold: 0,
        ...(area ? { locationScope: area } : {}),
      });
      if (
        request.upazilaId &&
        request.districtId &&
        matched.length < (matching.sosMinRecipients ?? 5)
      ) {
        const districtMatches = await findMatchingDonors(request, {
          maxRadiusKm,
          maxRecipients: maxRecipients - matched.length,
          threshold: 0,
          locationScope: { districtId: request.districtId },
          excludeIds: matched.map((match) => match.userId),
        });
        matched = [...matched, ...districtMatches];
      }
    } else {
      matched = await findMatchingDonors(request, {
        maxRadiusKm: request.matchRadiusKm || undefined,
        maxRecipients,
      });
    }

    if (matched.length) {
      const result = await fanOutRequestNotifications(request, matched);
      const notified = new Set((request.notifiedDonorIds || []).map((id) => id.toString()));
      for (const donorId of result.recipientIds || []) notified.add(donorId.toString());
      request.notifiedDonorIds = [...notified];
      logger.info(`Matched ${result.notified} donor(s) for request ${requestId}`);
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