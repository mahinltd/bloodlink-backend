import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import { BloodRequest } from './bloodRequest.model.js';
import { RequestResponse } from './requestResponse.model.js';
import { Donation } from './donation.model.js';
import { Report } from '../reports/report.model.js';
import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { getBusinessRules } from '../config/config.service.js';
import { COMPATIBLE_DONORS } from '../../constants/bloodGroups.js';
import { BANNED_WORDS } from '../../constants/index.js';
import { findMatchingDonors, matchAndNotify } from '../matching/matching.service.js';
import { notifyOne } from '../notifications/notifications.service.js';
import { logger } from '../../utils/logger.js';
import { normalMaxDays, resolveUrgency } from './urgencyRules.js';

const DAY = 86400000;

const notFound = () => ApiError.notFound('Request not found', 'REQUEST_NOT_FOUND');

const containsBannedWord = (...texts) => {
  const text = texts.filter(Boolean).join(' ').toLowerCase();
  return BANNED_WORDS.find((word) => text.includes(word.toLowerCase())) || null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const activeRequesterStages = () => [
  {
    $lookup: {
      from: User.collection.name,
      localField: 'requesterId',
      foreignField: '_id',
      as: '_requester',
    },
  },
  { $match: { '_requester.status': 'active', '_requester.emailVerifiedAt': { $ne: null } } },
];

const formatRequestItems = (items) =>
  items.map(({ distanceMeters, urgencyRank, ...request }) => ({
    ...request,
    distanceKm: distanceMeters != null ? Math.round((distanceMeters / 1000) * 10) / 10 : null,
  }));

const notify = (userId, type, title, body, data = {}) =>
  notifyOne({ userId, type, title, body, data }).catch((error) =>
    logger.error('notify failed:', error.message)
  );

/* ---------------- CRUD ---------------- */

export const createRequest = async (userId, payload) => {
  const rules = await getBusinessRules();
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') {
    throw ApiError.forbidden('Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  // দৈনিক সীমা — নতুন অ্যাকাউন্টে (৭ দিনের কম) ১টি, পরে ২টি
  const accountAgeDays = (Date.now() - user.createdAt.getTime()) / DAY;
  const isNewAccount = accountAgeDays < 7;
  const dailyLimit = isNewAccount ? rules.requests.newAccountDailyLimit : rules.requests.dailyLimit;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await BloodRequest.countDocuments({ requesterId: userId, createdAt: { $gte: startOfDay } });
  if (todayCount >= dailyLimit) {
    throw ApiError.tooMany(`You can create at most ${dailyLimit} request(s) per day`, 'DAILY_REQUEST_LIMIT');
  }

  const neededBy = new Date(payload.neededBy);
  if (neededBy.getTime() <= Date.now()) {
    throw ApiError.badRequest('Needed-by time must be in the future', 'INVALID_NEEDED_BY');
  }
  const maxDaysAhead = normalMaxDays(rules.matching);
  if (neededBy.getTime() - Date.now() > maxDaysAhead * DAY) {
    throw ApiError.badRequest(`Needed-by must be within ${maxDaysAhead} days`, 'NEEDED_BY_TOO_FAR');
  }

  const urgency = resolveUrgency(payload.urgency, neededBy, rules.matching);
  if (urgency === 'sos') {
    const sosDailyLimit = isNewAccount
      ? rules.requests.newAccountSosDailyLimit
      : rules.requests.sosDailyLimit;
    const sosCount = await BloodRequest.countDocuments({
      requesterId: userId,
      urgency: 'sos',
      createdAt: { $gte: startOfDay },
    });
    if (sosCount >= sosDailyLimit) {
      throw ApiError.tooMany(`You can create at most ${sosDailyLimit} SOS request(s) per day`, 'DAILY_SOS_REQUEST_LIMIT');
    }
  }
  const banned = containsBannedWord(payload.note?.bn, payload.note?.en);
  const radii = rules.matching.radiiKm || rules.matching.radiusStepsKm || [10, 25, 50];

  const request = await BloodRequest.create({
    requesterId: userId,
    patientName: payload.patientName,
    patientCondition: payload.patientCondition || null,
    bloodGroup: payload.bloodGroup,
    component: payload.component,
    bagsNeeded: payload.bagsNeeded,
    neededBy,
    urgency,
    hospitalId: payload.hospitalId || null,
    hospitalName: payload.hospitalName,
    hospitalAddress: payload.hospitalAddress || null,
    wardOrUnit: payload.wardOrUnit || null,
    location: { type: 'Point', coordinates: [payload.coordinates.lng, payload.coordinates.lat] },
    divisionId: payload.divisionId || null,
    districtId: payload.districtId || null,
    upazilaId: payload.upazilaId || null,
    attendantName: payload.attendantName,
    attendantRelation: payload.attendantRelation || null,
    attendantPhone: payload.attendantPhone,
    contactPreference: payload.contactPreference || 'any',
    note: payload.note,
    consentAccepted: true,
    expiresAt: neededBy,
    matchRadiusKm: radii[0],
    flagged: !!banned,
    flagReason: banned ? `banned_keyword:${banned}` : null,
  });

  matchAndNotify(request._id).catch((error) => logger.error('matchAndNotify failed:', error.message));
  return { request };
};

export const listRequests = async (query) => {
  const { urgency, bloodGroup, component, divisionId, districtId, upazilaId, q, lat, lng, page, limit } = query;
  const now = new Date();
  const match = { status: 'open', isHidden: false, expiresAt: { $gt: now } };
  if (urgency) match.urgency = urgency;
  if (bloodGroup) match.bloodGroup = bloodGroup;
  if (component) match.component = component;
  if (divisionId) match.divisionId = new mongoose.Types.ObjectId(divisionId);
  if (districtId) match.districtId = new mongoose.Types.ObjectId(districtId);
  if (upazilaId) match.upazilaId = new mongoose.Types.ObjectId(upazilaId);
  if (q) {
    const search = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ hospitalName: search }, { patientName: search }];
  }

  const hasCoordinates = lat !== undefined && lng !== undefined;
  const basePipeline = [];
  if (hasCoordinates) {
    basePipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: (query.radiusKm ?? 50) * 1000,
        query: match,
      },
    });
  } else {
    basePipeline.push({ $match: match });
  }
  basePipeline.push(...activeRequesterStages());

  const urgencyRankStage = {
    $addFields: {
      urgencyRank: {
        $switch: {
          branches: [
            { case: { $eq: ['$urgency', 'sos'] }, then: 0 },
            { case: { $eq: ['$urgency', 'urgent'] }, then: 1 },
          ],
          default: 2,
        },
      },
    },
  };
  let sort;
  if (query.sort === 'nearest') {
    sort = { distanceMeters: 1 };
  } else if (query.sort === 'newest') {
    sort = { createdAt: -1 };
  } else {
    sort = hasCoordinates
      ? { urgencyRank: 1, distanceMeters: 1, createdAt: -1 }
      : { urgencyRank: 1, createdAt: -1 };
  }

  const [items, countResult] = await Promise.all([
    BloodRequest.aggregate([
      ...basePipeline,
      { $project: { _requester: 0 } },
      urgencyRankStage,
      { $sort: sort },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    BloodRequest.aggregate([...basePipeline, { $count: 'total' }]),
  ]);
  await BloodRequest.populate(items, { path: 'requesterId', select: 'name avatar' });

  const total = countResult[0]?.total || 0;
  return {
    items: formatRequestItems(items),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
};

export const listSosRequests = async ({ lat, lng, limit, bloodGroup }) => {
  const now = new Date();
  const match = {
    status: 'open',
    urgency: 'sos',
    isHidden: false,
    expiresAt: { $gt: now },
    neededBy: { $gt: now },
  };
  if (bloodGroup) match.bloodGroup = bloodGroup;

  const hasCoordinates = lat !== undefined && lng !== undefined;
  const pipeline = [];
  if (hasCoordinates) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        spherical: true,
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }
  pipeline.push(
    ...activeRequesterStages(),
    { $project: { _requester: 0 } },
    { $sort: hasCoordinates ? { distanceMeters: 1, createdAt: -1 } : { createdAt: -1 } },
    { $limit: limit }
  );
  const items = await BloodRequest.aggregate(pipeline);
  await BloodRequest.populate(items, { path: 'requesterId', select: 'name avatar' });
  const formatted = formatRequestItems(items);
  return { items: formatted, banner: formatted[0] || null };
};

export const listMine = async (userId, { page, limit }) => {
  const items = await BloodRequest.find({ requesterId: userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return { items, page, limit };
};

export const listRespondedRequests = async (userId, { page, limit }) => {
  const [result] = await RequestResponse.aggregate([
    { $match: { donorId: new mongoose.Types.ObjectId(userId) } },
    {
      $lookup: {
        from: BloodRequest.collection.name,
        localField: 'requestId',
        foreignField: '_id',
        as: 'request',
      },
    },
    { $unwind: '$request' },
    { $match: { 'request.isHidden': { $ne: true } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'request.requesterId',
        foreignField: '_id',
        as: '_requester',
      },
    },
    { $match: { '_requester.status': 'active', '_requester.emailVerifiedAt': { $ne: null } } },
    {
      $addFields: {
        'request.requesterId': {
          _id: { $arrayElemAt: ['$_requester._id', 0] },
          name: { $arrayElemAt: ['$_requester.name', 0] },
          avatar: { $arrayElemAt: ['$_requester.avatar', 0] },
        },
      },
    },
    { $sort: { respondedAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: { _requester: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const items = result?.items || [];
  const total = result?.total?.[0]?.count || 0;
  return {
    items: items.map(({ _id, status, respondedAt, request }) => ({ id: _id, status, respondedAt, request })),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
};

export const getRequest = async (id, userId) => {
  const request = await BloodRequest.findById(id)
    .populate({
      path: 'requesterId',
      select: 'name avatar',
      match: { status: 'active', emailVerifiedAt: { $ne: null } },
    })
    .lean();
  if (!request || !request.requesterId) throw notFound();
  if (request.isHidden && request.requesterId._id.toString() !== userId) throw notFound();

  const responsesCount = await RequestResponse.countDocuments({
    requestId: id,
    status: { $in: ['accepted', 'donated'] },
  });
  const myResponse = userId
    ? await RequestResponse.findOne({ requestId: id, donorId: userId }).select('status').lean()
    : null;
  const requesterDonor = await DonorProfile.findOne({ userId: request.requesterId._id }).select('idVerified').lean();

  return {
    request: { ...request, requesterVerified: !!requesterDonor?.idVerified },
    responsesCount,
    myResponse: myResponse?.status || null,
  };
};

export const revealRequestPhone = async (id, userId) => {
  const { request } = await getRequest(id, userId);
  return { phone: request.attendantPhone };
};

export const matchingPreview = async (requestId, userId) => {
  const request = await BloodRequest.findById(requestId).lean();
  if (!request || (request.isHidden && request.requesterId.toString() !== String(userId))) throw notFound();
  if (request.requesterId.toString() !== String(userId)) {
    throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');
  }
  return { matches: await findMatchingDonors(request) };
};

export const updateRequest = async (requestId, ownerId, payload) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw notFound();
  if (request.requesterId.toString() !== ownerId) throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');
  if (request.status !== 'open') throw ApiError.badRequest('Only open requests can be edited', 'REQUEST_NOT_OPEN');

  const allowed = [
    'patientName', 'bloodGroup', 'component', 'bagsNeeded', 'hospitalName',
    'hospitalAddress', 'wardOrUnit', 'patientCondition', 'contactPreference',
    'attendantName', 'attendantRelation', 'attendantPhone',
  ];
  for (const key of allowed) if (payload[key] !== undefined) request[key] = payload[key];
  if (payload.note) request.note = payload.note;
  if (payload.hospitalId !== undefined) request.hospitalId = payload.hospitalId;
  if (payload.coordinates) {
    request.location = { type: 'Point', coordinates: [payload.coordinates.lng, payload.coordinates.lat] };
  }
  if (payload.neededBy !== undefined || payload.urgency !== undefined) {
    const rules = await getBusinessRules();
    const neededBy = payload.neededBy !== undefined ? new Date(payload.neededBy) : request.neededBy;
    if (neededBy.getTime() <= Date.now()) {
      throw ApiError.badRequest('Needed-by time must be in the future', 'INVALID_NEEDED_BY');
    }
    const maxDaysAhead = normalMaxDays(rules.matching);
    if (neededBy.getTime() - Date.now() > maxDaysAhead * DAY) {
      throw ApiError.badRequest(`Needed-by must be within ${maxDaysAhead} days`, 'NEEDED_BY_TOO_FAR');
    }
    request.neededBy = neededBy;
    request.expiresAt = neededBy;
    request.urgency = resolveUrgency(payload.urgency, neededBy, rules.matching);
  }

  const banned = containsBannedWord(request.note?.bn, request.note?.en);
  request.flagged = !!banned;
  request.flagReason = banned ? `banned_keyword:${banned}` : null;

  await request.save();
  return { request };
};

/* ---------------- Response / Donation ---------------- */

export const respond = async (requestId, userId, action) => {
  const request = await BloodRequest.findById(requestId);
  if (!request || request.isHidden) throw notFound();
  if (request.requesterId.toString() === userId) {
    throw ApiError.badRequest('You cannot respond to your own request', 'CANNOT_RESPOND_OWN');
  }
  if (request.status !== 'open' || request.expiresAt <= new Date()) {
    throw ApiError.badRequest('This request is no longer open', 'REQUEST_NOT_OPEN');
  }
  const donorUser = await User.findById(userId).select('status emailVerifiedAt modes').lean();
  if (!donorUser || donorUser.status !== 'active' || !donorUser.emailVerifiedAt || !donorUser.modes?.donor) {
    throw ApiError.forbidden('An active, verified donor account is required', 'DONOR_NOT_ACTIVE');
  }
  const profile = await DonorProfile.findOne({ userId });
  if (!profile) throw ApiError.badRequest('Donor mode is not enabled', 'DONOR_MODE_OFF');

  if (action === 'accept') {
    if (!profile.isAvailable) {
      throw ApiError.badRequest('You are not currently available to donate', 'DONOR_UNAVAILABLE');
    }
    if (!COMPATIBLE_DONORS[request.bloodGroup]?.includes(profile.bloodGroup)) {
      throw ApiError.badRequest('Your blood group is not compatible with this request', 'BLOOD_GROUP_INCOMPATIBLE');
    }
    const rules = await getBusinessRules();
    const eligibleAfter = profile.lastDonationDate
      ? new Date(profile.lastDonationDate.getTime() + rules.donor.donationGapDays * DAY)
      : null;
    const health = profile.healthDeclaration || {};
    if (eligibleAfter && eligibleAfter > new Date()) {
      throw ApiError.badRequest('You have not completed the donation cooldown period', 'DONATION_COOLDOWN_ACTIVE');
    }
    if (
      health.surgery || health.tattooOrPiercing || health.onMedication ||
      health.pregnantOrBreastfeeding || health.chronicDisease || health.recentIllness?.length
    ) {
      throw ApiError.badRequest('Your health declaration temporarily makes you ineligible to donate', 'DONOR_HEALTH_NOT_ELIGIBLE');
    }
  }

  const status = action === 'accept' ? 'accepted' : 'declined';
  const response = await RequestResponse.findOneAndUpdate(
    { requestId, donorId: userId },
    { $set: { status, respondedAt: new Date() } },
    { upsert: true, new: true }
  );

  if (status === 'accepted') {
    await notify(
      request.requesterId,
      'response',
      { bn: 'একজন ডোনার সাড়া দিয়েছেন', en: 'A donor responded' },
      {
        bn: `${donorUser?.name || 'একজন ডোনার'} "${request.patientName}"-এর জন্য রক্ত দিতে পারবেন`,
        en: `${donorUser?.name || 'A donor'} can donate for ${request.patientName}`,
      },
      { requestId: requestId.toString(), responseId: response._id.toString() }
    );
  }

  return { status: response.status };
};

export const listResponses = async (requestId, ownerId) => {
  const request = await BloodRequest.findById(requestId).select('requesterId').lean();
  if (!request) throw notFound();
  if (request.requesterId.toString() !== ownerId) throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');

  const responses = await RequestResponse.find({ requestId })
    .sort({ respondedAt: -1 })
    .populate({
      path: 'donorId',
      select: 'name avatar phone status emailVerifiedAt',
      match: { status: 'active', emailVerifiedAt: { $ne: null } },
    })
    .lean();

  const items = responses.filter((response) => response.donorId).map((response) => {
    const donor = response.donorId || {};
    return {
      id: response._id,
      status: response.status,
      respondedAt: response.respondedAt,
      donor: donor._id
        ? { id: donor._id, name: donor.name, avatar: donor.avatar, phone: donor.phone }
        : null,
    };
  });
  return { responses: items };
};

export const confirmDonation = async (requestId, ownerId, donorId) => {
  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const request = await BloodRequest.findById(requestId).session(session);
      if (!request) throw notFound();
      if (request.requesterId.toString() !== ownerId) {
        throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');
      }
      if (request.status !== 'open' || request.bagsCollected >= request.bagsNeeded) {
        throw ApiError.badRequest('This request is no longer open', 'REQUEST_NOT_OPEN');
      }

      const donor = await User.findOne({
        _id: donorId,
        status: 'active',
        emailVerifiedAt: { $ne: null },
        'modes.donor': true,
      }).session(session);
      const donorProfile = await DonorProfile.findOne({ userId: donorId }).session(session);
      if (!donor || !donorProfile) {
        throw ApiError.badRequest('User is not an active donor', 'DONOR_NOT_ACTIVE');
      }

      const response = await RequestResponse.findOne({ requestId, donorId }).session(session);
      if (response?.status === 'declined') {
        throw ApiError.badRequest('This donor declined the request', 'DONOR_DECLINED');
      }
      if (response?.status === 'donated') {
        throw ApiError.badRequest('Donation already confirmed for this donor', 'ALREADY_CONFIRMED');
      }
      if (!response || response.status !== 'accepted') {
        throw ApiError.badRequest('The donor must accept the request first', 'DONOR_RESPONSE_REQUIRED');
      }

      const now = new Date();
      response.status = 'donated';
      await response.save({ session });
      await Donation.create(
        [{ requestId, donorId, requesterId: ownerId, confirmedBy: ownerId, date: now }],
        { session }
      );

      donorProfile.lastDonationDate = now;
      donorProfile.eligibilityNotifiedFor = null;
      donorProfile.isAvailable = false;
      donorProfile.donationCount += 1;
      await donorProfile.save({ session });

      request.bagsCollected += 1;
      if (request.bagsCollected >= request.bagsNeeded) {
        request.status = 'fulfilled';
        request.fulfilledAt = now;
      }
      await request.save({ session });
      outcome = { status: request.status, bagsCollected: request.bagsCollected, bagsNeeded: request.bagsNeeded };
    });
  } finally {
    await session.endSession();
  }

  await notify(
    donorId,
    'donation',
    { bn: 'রক্তদান নিশ্চিত হয়েছে', en: 'Donation confirmed' },
    {
      bn: 'আপনার রক্তদান নিশ্চিত করা হয়েছে। জীবন বাঁচানোর জন্য ধন্যবাদ! ❤️',
      en: 'Your blood donation was confirmed. Thank you for saving a life! ❤️',
    },
    { requestId: requestId.toString() }
  );

  return outcome;
};

export const fulfillRequest = async (requestId, ownerId) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw notFound();
  if (request.requesterId.toString() !== ownerId) throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');
  if (request.status !== 'open') throw ApiError.badRequest('This request is no longer open', 'REQUEST_NOT_OPEN');
  request.status = 'fulfilled';
  request.fulfilledAt = new Date();
  await request.save();
  return { status: request.status };
};

export const cancelRequest = async (requestId, ownerId) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw notFound();
  if (request.requesterId.toString() !== ownerId) throw ApiError.forbidden('Not your request', 'NOT_REQUEST_OWNER');
  if (request.status !== 'open') throw ApiError.badRequest('This request is no longer open', 'REQUEST_NOT_OPEN');
  request.status = 'cancelled';
  request.cancelledAt = new Date();
  await request.save();
  return { status: request.status };
};

export const reportRequest = async (requestId, userId, reason) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw notFound();
  if (request.requesterId.toString() === userId) {
    throw ApiError.badRequest('You cannot report your own request', 'CANNOT_REPORT_OWN');
  }
  const existing = await Report.findOne({ reporterId: userId, targetType: 'request', targetId: requestId });
  if (existing) throw ApiError.badRequest('You have already reported this request', 'ALREADY_REPORTED');

  await Report.create({ reporterId: userId, targetType: 'request', targetId: requestId, reason });
  request.reportsCount += 1;
  if (request.reportsCount >= 3) request.isHidden = true;
  await request.save();
  return { reported: true };
};