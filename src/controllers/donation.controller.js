// BloodLink Backend - Controller: Donation
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const DonationHistory = require('../models/DonationHistory');
const BloodRequest = require('../models/BloodRequest');
const DonorResponse = require('../models/DonorResponse');
const donationService = require('../services/donation.service');
const notificationService = require('../services/notification.service');
const { buildPagination } = require('../utils/helpers');

// @route POST /donations (donor self-log)
const logDonation = asyncHandler(async (req, res) => {
  const { requestId, donationDate, hospitalName, hospitalAddress, units, notes } = req.body;

  let request = null;
  let status = 'self_reported';
  let recipientId = null;

  if (requestId) {
    request = await BloodRequest.findById(requestId);
    if (!request) throw new ApiError(404, 'Blood request not found.');

    if (String(request.requester) === String(req.user._id)) {
      throw new ApiError(400, 'You cannot log a donation for your own request.');
    }

    // শুধু responded donor-ই request-linked donation log করতে পারবে
    const responded = await DonorResponse.findOne({
      request: request._id,
      donor: req.user._id,
      responseType: { $in: ['interested', 'contact_requester'] },
    }).lean();
    if (!responded) {
      throw new ApiError(403, 'You can only log donations for requests you responded to.');
    }

    status = 'pending_confirmation';
    recipientId = request.requester;
  }

  const donation = await donationService.recordDonation({
    donorUserId: req.user._id,
    recipientUserId: recipientId,
    requestId: request ? request._id : null,
    donationDate,
    hospitalName: hospitalName || request.hospitalName,
    hospitalAddress: hospitalAddress !== undefined ? hospitalAddress : (request ? request.hospitalAddress : ''),
    units: units || 1,
    notes: notes || '',
    status,
    source: request ? 'bloodlink_request' : 'donor_log',
  });

  // Recipient-কে confirmation-এর জন্য জানাও
  if (status === 'pending_confirmation') {
    notificationService.notifyUser(recipientId, {
      type: 'system',
      title: '🩸 Donation confirmation needed',
      body: `${req.user.fullName} logged a donation for your request ${request.requestId}. Please confirm if the donation happened.`,
      data: { donationId: donation._id, requestId: request._id, screen: 'donation_confirm' },
    }).catch(() => {});
  }

  res.status(201).json(
    new ApiResponse(
      201,
      { donation },
      status === 'pending_confirmation'
        ? 'Donation logged. It will be confirmed once the recipient verifies it.'
        : 'Donation recorded. Your cooldown has been updated.'
    )
  );
});

// @route GET /donations/me
const getMyDonations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const filter = { donor: req.user._id, status: { $ne: 'rejected' } };

  const [donations, total] = await Promise.all([
    DonationHistory.find(filter)
      .populate('request', 'requestId patientName urgency')
      .sort({ donationDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DonationHistory.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      { donations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Donation timeline fetched successfully.'
    )
  );
});

// @route GET /donations/me/stats
const getMyStats = asyncHandler(async (req, res) => {
  const donorId = req.user._id;

  const [totalDonations, badgeData] = await Promise.all([
    DonationHistory.countDocuments({ donor: donorId, status: { $ne: 'rejected' } }),
    donationService.computeBadges(donorId),
  ]);

  const profile = req.donorProfile;
  const now = new Date();
  const isEligibleNow = !profile.nextEligibleDate || profile.nextEligibleDate <= now;
  const daysUntilEligible = isEligibleNow
    ? 0
    : Math.ceil((new Date(profile.nextEligibleDate) - now) / (24 * 60 * 60 * 1000));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        totalDonations,
        confirmedDonations: badgeData.confirmedCount,
        platformTotalDonationCount: profile.totalDonationCount,
        lastDonationDate: profile.lastDonationDate,
        nextEligibleDate: profile.nextEligibleDate,
        isEligibleNow,
        daysUntilEligible,
        badges: badgeData.badges,
        nextMilestone: badgeData.nextMilestone,
        // ডকুমেন্ট §৩.১৩ — count কখনো Medical Eligibility নয়
        disclaimer: 'Donation history is for record only. Medical eligibility is always determined by qualified health professionals at the donation center.',
      },
      'Donation stats fetched successfully.'
    )
  );
});

// @route GET /donations/me/badges
const getMyBadges = asyncHandler(async (req, res) => {
  const badgeData = await donationService.computeBadges(req.user._id);
  res.status(200).json(new ApiResponse(200, badgeData, 'Badges fetched successfully.'));
});

// @route GET /donations/to-confirm (recipient view)
const getPendingConfirmations = asyncHandler(async (req, res) => {
  const donations = await DonationHistory.find({ recipient: req.user._id, status: 'pending_confirmation' })
    .populate('donor', 'fullName avatar isVerified phone')
    .populate('request', 'requestId bloodGroup patientName hospitalName')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(
    new ApiResponse(200, { donations, total: donations.length }, 'Pending confirmations fetched successfully.')
  );
});

// @route POST /donations/:id/confirm (recipient)
const confirmDonation = asyncHandler(async (req, res) => {
  const donation = await DonationHistory.findById(req.params.id);
  if (!donation) throw new ApiError(404, 'Donation record not found.');

  if (String(donation.recipient) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the recipient can confirm this donation.');
  }
  if (donation.status !== 'pending_confirmation') {
    throw new ApiError(400, `This donation is already '${donation.status}'.`);
  }

  donation.status = 'confirmed';
  donation.confirmedAt = new Date();
  await donation.save();

  notificationService.notifyUser(donation.donor, {
    type: 'system',
    title: '✅ Donation confirmed!',
    body: `Your donation at ${donation.hospitalName} has been confirmed by the recipient. Your certificate is ready!`,
    data: { donationId: donation._id, screen: 'donation_history' },
  }).catch(() => {});

  res.status(200).json(new ApiResponse(200, { donation }, 'Donation confirmed. Thank you!'));
});

// @route POST /donations/:id/reject (recipient)
const rejectDonation = asyncHandler(async (req, res) => {
  const donation = await DonationHistory.findById(req.params.id);
  if (!donation) throw new ApiError(404, 'Donation record not found.');

  if (String(donation.recipient) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the recipient can reject this donation.');
  }
  if (donation.status !== 'pending_confirmation') {
    throw new ApiError(400, `This donation is already '${donation.status}'.`);
  }

  donation.status = 'rejected';
  await donation.save();

  await donationService.rollbackDonationFromProfile(donation.donor);

  notificationService.notifyUser(donation.donor, {
    type: 'system',
    title: '⚠️ Donation claim not confirmed',
    body: `Your donation log at ${donation.hospitalName} was not confirmed by the recipient. Contact support if this is a mistake.`,
    data: { donationId: donation._id },
  }).catch(() => {});

  res.status(200).json(new ApiResponse(200, null, 'Donation claim rejected.'));
});

// @route GET /donations/:id/certificate (owner, confirmed only)
const getCertificate = asyncHandler(async (req, res) => {
  const donation = await DonationHistory.findById(req.params.id)
    .populate('request', 'requestId')
    .lean();

  if (!donation) throw new ApiError(404, 'Donation record not found.');
  if (String(donation.donor) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only view your own certificate.');
  }
  if (donation.status !== 'confirmed') {
    throw new ApiError(400, 'Certificate is available only for confirmed donations.');
  }

  const certificate = {
    certificateNo: `BLC-${String(donation._id).slice(-8).toUpperCase()}`,
    issuedTo: req.user.fullName,
    bloodGroup: donation.bloodGroup,
    donationDate: donation.donationDate,
    hospitalName: donation.hospitalName,
    hospitalAddress: donation.hospitalAddress,
    units: donation.units,
    requestCode: donation.request ? donation.request.requestId : null,
    verification:
      donation.source === 'bloodlink_request'
        ? 'Confirmed by recipient via BloodLink'
        : 'Verified by BloodLink',
    issuedAt: donation.confirmedAt,
    platform: 'BloodLink — bloodlink.tech',
    message: 'This certificate honors a voluntary blood donation that helped save a life. রক্ত দিন, জীবন বাঁচান।',
  };

  res.status(200).json(new ApiResponse(200, { certificate }, 'Certificate fetched successfully.'));
});

// @route DELETE /donations/:id (owner; self_reported/pending only)
const deleteDonation = asyncHandler(async (req, res) => {
  const donation = await DonationHistory.findById(req.params.id);
  if (!donation) throw new ApiError(404, 'Donation record not found.');

  if (String(donation.donor) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only delete your own donation records.');
  }
  if (donation.status === 'confirmed') {
    throw new ApiError(400, 'Confirmed donations cannot be deleted. Contact support if there is an error.');
  }

  await donation.deleteOne();
  await donationService.rollbackDonationFromProfile(req.user._id);

  res.status(200).json(new ApiResponse(200, null, 'Donation record deleted.'));
});

module.exports = {
  logDonation,
  getMyDonations,
  getMyStats,
  getMyBadges,
  getPendingConfirmations,
  confirmDonation,
  rejectDonation,
  getCertificate,
  deleteDonation,
};