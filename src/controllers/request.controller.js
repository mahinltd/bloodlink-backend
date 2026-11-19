// BloodLink Backend - Controller: Blood Request
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const BloodRequest = require('../models/BloodRequest');
const DonorResponse = require('../models/DonorResponse');
const Conversation = require('../models/Conversation');
const { REQUEST_STATUS, URGENCY_LEVELS } = require('../constants');
const { escapeRegex, buildPagination } = require('../utils/helpers');
const matchingService = require('../services/matching.service');
const notificationService = require('../services/notification.service');
const donationService = require('../services/donation.service');
const socketService = require('../services/socket.service');
const logger = require('../utils/logger');

// Active (matching-এ থাকা) status list — expire করা হয়নি
const ACTIVE_STATUSES = [
  REQUEST_STATUS.PENDING,
  REQUEST_STATUS.SEARCHING,
  REQUEST_STATUS.DONOR_RESPONDED,
];

// Requester-ই শুধু এই transition করতে পারবে
const REQUESTER_TRANSITIONS = {
  [REQUEST_STATUS.SEARCHING]: [REQUEST_STATUS.BLOOD_ARRANGED, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.DONOR_RESPONDED]: [REQUEST_STATUS.DONOR_CONFIRMED, REQUEST_STATUS.BLOOD_ARRANGED, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.DONOR_CONFIRMED]: [REQUEST_STATUS.BLOOD_ARRANGED, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.BLOOD_ARRANGED]: [REQUEST_STATUS.COMPLETED, REQUEST_STATUS.CANCELLED],
};

// @route POST /requests
const createRequest = asyncHandler(async (req, res) => {
  const {
    patientName, bloodGroup, medicalProblem,
    hospitalName, hospitalAddress,
    latitude, longitude,
    numberOfBags, urgency,
    requiredDate, requiredTime, contactNumber, additionalNotes,
  } = req.body;

  // একই রোগীর duplicate active request রোধ
  const duplicate = await BloodRequest.findOne({
    requester: req.user._id,
    patientName: new RegExp(`^${escapeRegex(patientName)}$`, 'i'),
    bloodGroup,
    status: { $in: ACTIVE_STATUSES },
  }).lean();

  if (duplicate) {
    throw new ApiError(
      409,
      `An active request already exists for this patient (ID: ${duplicate.requestId}). Please update or complete it first.`
    );
  }

  const requestData = {
    requester: req.user._id,
    patientName,
    bloodGroup,
    medicalProblem,
    hospitalName,
    hospitalAddress,
    numberOfBags: Number(numberOfBags),
    urgency,
    requiredDate,
    requiredTime,
    contactNumber,
    additionalNotes: additionalNotes || '',
  };

  if (latitude !== undefined && longitude !== undefined) {
    requestData.hospitalLocation = {
      type: 'Point',
      coordinates: [Number(longitude), Number(latitude)],
    };
  }

  const request = await BloodRequest.create(requestData);

  // 🚀 Smart Matching Engine চালু (non-blocking)
  matchingService.queueMatching(request._id);

  res.status(201).json(
    new ApiResponse(
      201,
      { request: request.toJSON() },
      `Blood request created successfully. Request ID: ${request.requestId}`
    )
  );
});

// @route GET /requests/feed?tab=sos|urgent|regular&bloodGroup=O+&search=...&latitude=..&longitude=..
const getFeed = asyncHandler(async (req, res) => {
  const { tab, bloodGroup, search, latitude, longitude, radiusKm } = req.query;
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const match = {
    status: { $in: ACTIVE_STATUSES },
    expiresAt: { $gt: new Date() },
  };

  if (tab && ['sos', 'urgent', 'regular'].includes(tab)) match.urgency = tab;
  if (bloodGroup) match.bloodGroup = bloodGroup;

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    match.$or = [{ patientName: regex }, { hospitalName: regex }, { bloodGroup: regex }];
  }

  const hasGeo = latitude !== undefined && longitude !== undefined;
  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
        distanceField: 'distanceMeters',
        maxDistance: Math.min(Number(radiusKm) || 100, 500) * 1000,
        spherical: true,
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    { $lookup: { from: 'users', localField: 'requester', foreignField: '_id', as: 'requester' } },
    { $unwind: '$requester' },
    { $match: { 'requester.accountStatus': 'active' } }
  );

  const project = {
    requestId: 1,
    patientName: 1,
    bloodGroup: 1,
    medicalProblem: 1,
    hospitalName: 1,
    hospitalAddress: 1,
    numberOfBags: 1,
    urgency: 1,
    requiredDate: 1,
    requiredTime: 1,
    contactNumber: 1,
    status: 1,
    interestedCount: 1,
    createdAt: 1,
    expiresAt: 1,
    'requester._id': 1,
    'requester.fullName': 1,
    'requester.avatar': 1,
    'requester.isVerified': 1,
  };
  if (hasGeo) project.distanceKm = { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] };

  // SOS আগে, তারপর নতুন আগে
  const urgencyOrder = {
    $addFields: {
      urgencyOrder: {
        $switch: {
          branches: [
            { case: { $eq: ['$urgency', URGENCY_LEVELS.SOS] }, then: 0 },
            { case: { $eq: ['$urgency', URGENCY_LEVELS.URGENT] }, then: 1 },
          ],
          default: 2,
        },
      },
    },
  };

  const sortStage = hasGeo
    ? { $sort: { urgencyOrder: 1, distanceMeters: 1 } }
    : { $sort: { urgencyOrder: 1, createdAt: -1 } };

  const [requests, countResult] = await Promise.all([
    BloodRequest.aggregate([...pipeline, urgencyOrder, sortStage, { $skip: skip }, { $limit: limit }, { $project: project }]),
    BloodRequest.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const total = countResult[0] ? countResult[0].total : 0;

  res.status(200).json(
    new ApiResponse(
      200,
      { requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Blood request feed fetched successfully.'
    )
  );
});

// @route GET /requests/my
const getMyRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const filter = { requester: req.user._id };
  if (req.query.status && Object.values(REQUEST_STATUS).includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const [requests, total] = await Promise.all([
    BloodRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BloodRequest.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      { requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Your blood requests fetched successfully.'
    )
  );
});

// @route GET /requests/:id
const getRequestById = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate('requester', 'fullName avatar isVerified phone accountStatus')
    .populate('confirmedDonor', 'fullName avatar isVerified')
    .lean();

  if (!request) throw new ApiError(404, 'Blood request not found.');

  const isOwner = String(request.requester._id) === String(req.user._id);
  if (request.requester.accountStatus !== 'active' && !isOwner) {
    throw new ApiError(404, 'Blood request not found.');
  }

  // আমি কি respond করেছি?
  const myResponse = await DonorResponse.findOne({ request: request._id, donor: req.user._id })
    .select('responseType note createdAt')
    .lean();

  res.status(200).json(
    new ApiResponse(
      200,
      { request, myResponse: myResponse || null, isOwner },
      'Blood request details fetched successfully.'
    )
  );
});

// @route PATCH /requests/:id/status
const updateRequestStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (String(request.requester) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the requester can update this request status.');
  }

  const allowed = REQUESTER_TRANSITIONS[request.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `Cannot change status from '${request.status}' to '${status}'.`);
  }

  request.status = status;
  await request.save();

  // Request বন্ধ হলে interested donor-দের জানাও + escalation auto-বন্ধ (status inactive)
  if (['blood_arranged', 'completed', 'cancelled'].includes(status)) {
    notificationService.notifyInterestedDonorsClosed(request, status).catch(() => {});
  }

  // ⚡ Real-time: requester + সব responder-এর screen-এ live status update
  DonorResponse.find({ request: request._id })
    .distinct('donor')
    .then((donorIds) => {
      socketService.emitRequestUpdate([request.requester, ...donorIds], {
        requestId: request._id,
        requestCode: request.requestId,
        status,
      });
    })
    .catch(() => {});

  // 🎉 Request completed + confirmed donor → auto donation record (recipient confirmation)
  if (status === 'completed' && request.confirmedDonor) {
    donationService.recordDonation({
      donorUserId: request.confirmedDonor,
      recipientUserId: request.requester,
      requestId: request._id,
      donationDate: new Date(),
      hospitalName: request.hospitalName,
      hospitalAddress: request.hospitalAddress,
      units: 1,
      status: 'confirmed',
      source: 'bloodlink_request',
    }).catch((err) => logger.error(`Auto donation record failed for ${request.requestId}:`, err.message));
  }

  res.status(200).json(
    new ApiResponse(200, { request: request.toJSON() }, `Request marked as '${status}'.`)
  );
});

// @route GET /requests/:id/responses (requester only)
const getResponses = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id).lean();
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (String(request.requester) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the requester can view donor responses.');
  }

  const responses = await DonorResponse.find({ request: request._id, responseType: { $ne: 'not_available' } })
    .populate('donor', 'fullName avatar isVerified phone')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(
    new ApiResponse(200, { responses, total: responses.length }, 'Donor responses fetched successfully.')
  );
});

// @route POST /requests/:id/respond (donor only)
const respondToRequest = asyncHandler(async (req, res) => {
  const { responseType, note } = req.body;

  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (!ACTIVE_STATUSES.includes(request.status)) {
    throw new ApiError(400, `This request is no longer active (status: ${request.status}).`);
  }
  if (request.expiresAt && request.expiresAt < new Date()) {
    throw new ApiError(400, 'This request has expired.');
  }

  if (String(request.requester) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot respond to your own blood request.');
  }

  const already = await DonorResponse.findOne({ request: request._id, donor: req.user._id }).lean();
  if (already) throw new ApiError(409, 'You have already responded to this request.');

  const response = await DonorResponse.create({
    request: request._id,
    donor: req.user._id,
    responseType,
    note: note || '',
  });

  if (responseType === 'interested') {
    request.interestedCount += 1;
    if (request.status === REQUEST_STATUS.SEARCHING || request.status === REQUEST_STATUS.PENDING) {
      request.status = REQUEST_STATUS.DONOR_RESPONDED;
    }
    await request.save();
  }

  // Requester-কে real-time জানাও
  if (responseType === 'interested' || responseType === 'contact_requester') {
    notificationService
      .notifyRequester(request, {
        type: 'donor_response',
        title: '🩸 A donor responded!',
        body: `${req.user.fullName} is ${responseType === 'interested' ? 'interested to donate' : 'trying to contact you'} for request ${request.requestId}.`,
        data: { requestId: request._id, requestCode: request.requestId, responseType },
      })
      .catch(() => {});
  }

  // ⚡ Real-time: requester-এর খোলা screen-এ live update
  socketService.emitRequestUpdate([request.requester], {
    requestId: request._id,
    requestCode: request.requestId,
    status: request.status,
    interestedCount: request.interestedCount,
    newResponse: {
      donorId: req.user._id,
      donorName: req.user.fullName,
      responseType,
    },
  });

  // Contact Requester → auto-create conversation (ডকুমেন্ট §৩.৮)
  let conversationId = null;
  if (responseType === 'contact_requester') {
    const existing = await Conversation.findOne({
      participants: { $all: [req.user._id, request.requester] },
    });
    const convo = existing || await Conversation.create({
      participants: [req.user._id, request.requester],
      requestRef: request._id,
    });
    conversationId = convo._id;
  }

  res.status(201).json(
    new ApiResponse(201, { response: response.toJSON(), conversationId }, 'Your response has been recorded. The requester will be notified.')
  );
});

// @route POST /requests/:id/select-donor (requester only)
const selectDonor = asyncHandler(async (req, res) => {
  const { donorId } = req.body;

  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (String(request.requester) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the requester can select a donor.');
  }

  if (request.status !== REQUEST_STATUS.DONOR_RESPONDED) {
    throw new ApiError(400, `Cannot select a donor while status is '${request.status}'. Wait for donor responses.`);
  }

  const response = await DonorResponse.findOne({
    request: request._id,
    donor: donorId,
    responseType: 'interested',
  }).lean();

  if (!response) {
    throw new ApiError(404, 'This donor has not expressed interest in your request.');
  }

  request.confirmedDonor = donorId;
  request.status = REQUEST_STATUS.DONOR_CONFIRMED;
  await request.save();

  res.status(200).json(
    new ApiResponse(200, { request: request.toJSON() }, 'Donor confirmed. Please coordinate with the donor.')
  );
});

module.exports = {
  createRequest,
  getFeed,
  getMyRequests,
  getRequestById,
  updateRequestStatus,
  getResponses,
  respondToRequest,
  selectDonor,
};