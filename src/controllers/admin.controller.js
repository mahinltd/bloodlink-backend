// BloodLink Backend - Controller: Admin (Auth + Verification Center)
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const env = require('../config/env');
const AdminUser = require('../models/AdminUser');
const User = require('../models/User');
const VerificationRequest = require('../models/VerificationRequest');
const DonorProfile = require('../models/DonorProfile');
const BloodRequest = require('../models/BloodRequest');
const DonorResponse = require('../models/DonorResponse');
const DonationHistory = require('../models/DonationHistory');
const Report = require('../models/Report');
const Hospital = require('../models/Hospital');
const BloodBank = require('../models/BloodBank');
const AppConfig = require('../models/AppConfig');
const AdminAuditLog = require('../models/AdminAuditLog');
const NotificationJob = require('../models/NotificationJob');
const Notification = require('../models/Notification');
const auditService = require('../services/audit.service');
const notificationService = require('../services/notification.service');
const storageService = require('../services/storage.service');
const tokenService = require('../services/token.service');
const fcmService = require('../services/fcm.service');
const socketService = require('../services/socket.service');
const { buildPagination, escapeRegex } = require('../utils/helpers');

// ---------- TOTP Secret Encryption (AES-256-GCM) ----------
const encryptSecret = (plain) => {
  const key = Buffer.from(env.admin.totpKey, 'hex'); // 32 bytes
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
};

const decryptSecret = (stored) => {
  const [ivHex, tagHex, dataHex] = stored.split('.');
  const key = Buffer.from(env.admin.totpKey, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
};

const signAdminToken = (admin) =>
  jwt.sign({ sub: admin._id.toString(), role: admin.role, type: 'admin' }, env.admin.jwtSecret, {
    expiresIn: env.admin.jwtExpiresIn,
  });

// @route POST /admin/auth/login (step 1: email+password)
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await AdminUser.findOne({ email }).select('+password +twoFactorSecret');
  if (!admin || !(await admin.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (!admin.isActive) throw new ApiError(403, 'This admin account has been deactivated.');

  if (admin.twoFactorEnabled) {
    const pendingToken = jwt.sign(
      { sub: admin._id.toString(), type: 'admin_2fa_pending' },
      env.admin.jwtSecret,
      { expiresIn: '5m' }
    );
    return res.status(200).json(
      new ApiResponse(200, { requiresTwoFactor: true, pendingToken }, 'Enter the 6-digit code from your authenticator app.')
    );
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  auditService.log(admin._id, 'admin.login', { ip: req.ip });

  res.status(200).json(
    new ApiResponse(200, { admin: admin.toJSON(), token: signAdminToken(admin) }, 'Admin login successful.')
  );
});

// @route POST /admin/auth/2fa/login (step 2: TOTP)
const adminLogin2FA = asyncHandler(async (req, res) => {
  const { pendingToken, code } = req.body;

  let payload;
  try {
    payload = jwt.verify(pendingToken, env.admin.jwtSecret);
  } catch {
    throw new ApiError(401, '2FA session expired. Please log in again.');
  }
  if (payload.type !== 'admin_2fa_pending') throw new ApiError(401, 'Invalid 2FA session.');

  const admin = await AdminUser.findById(payload.sub).select('+twoFactorSecret');
  if (!admin || !admin.twoFactorEnabled || !admin.twoFactorSecret) {
    throw new ApiError(400, '2FA is not enabled for this account.');
  }

  const valid = speakeasy.totp.verify({
    secret: decryptSecret(admin.twoFactorSecret),
    encoding: 'base32',
    token: String(code),
    window: 1,
  });
  if (!valid) throw new ApiError(401, 'Incorrect 2FA code.');

  admin.lastLoginAt = new Date();
  await admin.save();

  auditService.log(admin._id, 'admin.login_2fa', { ip: req.ip });

  res.status(200).json(
    new ApiResponse(200, { admin: admin.toJSON(), token: signAdminToken(admin) }, 'Admin login successful.')
  );
});

// @route POST /admin/auth/2fa/setup (protected)
const setup2FA = asyncHandler(async (req, res) => {
  if (req.admin.twoFactorEnabled) throw new ApiError(400, '2FA is already enabled.');
  if (!env.admin.totpKey) throw new ApiError(503, '2FA is not configured on the server (ADMIN_TOTP_ENCRYPTION_KEY).');

  const secret = speakeasy.generateSecret({ name: `BloodLink Admin (${req.admin.email})`, issuer: 'BloodLink' });

  req.admin.twoFactorSecret = encryptSecret(secret.base32);
  await req.admin.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { otpauthUrl: secret.otpauth_url, manualKey: secret.base32 },
      'Scan the otpauth URL with Google Authenticator, then call /2fa/enable with the code.'
    )
  );
});

// @route POST /admin/auth/2fa/enable (protected)
const enable2FA = asyncHandler(async (req, res) => {
  const admin = await AdminUser.findById(req.admin._id).select('+twoFactorSecret');
  if (!admin.twoFactorSecret) throw new ApiError(400, 'Run 2FA setup first.');
  if (admin.twoFactorEnabled) throw new ApiError(400, '2FA is already enabled.');

  const valid = speakeasy.totp.verify({
    secret: decryptSecret(admin.twoFactorSecret),
    encoding: 'base32',
    token: String(req.body.code),
    window: 1,
  });
  if (!valid) throw new ApiError(400, 'Incorrect code. Check your authenticator app and try again.');

  admin.twoFactorEnabled = true;
  await admin.save();

  auditService.log(admin._id, 'admin.2fa_enabled', { ip: req.ip });

  res.status(200).json(new ApiResponse(200, null, 'Two-factor authentication enabled.'));
});

// @route GET /admin/auth/me (protected)
const getAdminMe = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, { admin: req.admin.toJSON() }, 'Admin profile fetched.'));
});

// @route POST /admin/auth/logout (protected)
const adminLogout = asyncHandler(async (req, res) => {
  auditService.log(req.admin._id, 'admin.logout', { ip: req.ip });
  res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// @route POST /admin/admins (super_admin only)
const createAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, password, role } = req.body;

  const exists = await AdminUser.findOne({ email }).lean();
  if (exists) throw new ApiError(409, 'An admin with this email already exists.');

  const admin = await AdminUser.create({ fullName, email, password, role });

  auditService.log(req.admin._id, 'admin.created', {
    targetType: 'admin', targetId: admin._id,
    details: { email, role }, ip: req.ip,
  });

  res.status(201).json(new ApiResponse(201, { admin: admin.toJSON() }, 'Admin account created.'));
});

// @route GET /admin/admins (super_admin only)
const listAdmins = asyncHandler(async (req, res) => {
  const admins = await AdminUser.find().sort({ createdAt: -1 }).lean();
  res.status(200).json(new ApiResponse(200, { admins }, 'Admins fetched successfully.'));
});

// @route PATCH /admin/admins/:id/deactivate (super_admin only)
const deactivateAdmin = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.admin._id)) {
    throw new ApiError(400, 'You cannot deactivate your own account.');
  }
  const admin = await AdminUser.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!admin) throw new ApiError(404, 'Admin not found.');

  auditService.log(req.admin._id, 'admin.deactivated', { targetType: 'admin', targetId: admin._id, ip: req.ip });

  res.status(200).json(new ApiResponse(200, { admin: admin.toJSON() }, 'Admin deactivated.'));
});

// ==================== VERIFICATION CENTER (§৬.৫) ====================

// @route GET /admin/verification/queue?status=pending
const getVerificationQueue = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const filter = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  else filter.status = 'pending';

  const [items, total] = await Promise.all([
    VerificationRequest.find(filter)
      .populate('user', 'fullName email phone avatar isVerified')
      .sort({ createdAt: 1 })
      .skip(skip).limit(limit)
      .lean(),
    VerificationRequest.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Verification queue fetched.')
  );
});

// @route GET /admin/verification/:id (সহ signed image URLs)
const getVerificationDetail = asyncHandler(async (req, res) => {
  const verification = await VerificationRequest.findById(req.params.id)
    .populate('user', 'fullName email phone avatar isVerified createdAt')
    .populate('reviewedBy', 'fullName email')
    .lean();

  if (!verification) throw new ApiError(404, 'Verification request not found.');

  // Pending থাকলে image এখনো storage-এ আছে → ১০ মিনিটের signed URL
  const images = {};
  if (!verification.imagesPurgedAt && verification.nidImage?.publicId) {
    images.nidUrl = storageService.generatePrivateImageUrl(verification.nidImage);
    images.selfieUrl = storageService.generatePrivateImageUrl(verification.selfieImage);
  }

  res.status(200).json(
    new ApiResponse(200, { verification, images }, 'Verification details fetched.')
  );
});

// @route POST /admin/verification/:id/approve
const approveVerification = asyncHandler(async (req, res) => {
  const verification = await VerificationRequest.findById(req.params.id);
  if (!verification) throw new ApiError(404, 'Verification request not found.');
  if (verification.status !== 'pending') {
    throw new ApiError(400, `This request has already been ${verification.status}.`);
  }

  const user = await User.findById(verification.user);
  if (!user) throw new ApiError(404, 'User no longer exists.');

  user.isVerified = true;
  await user.save();

  verification.status = 'approved';
  verification.reviewedBy = req.admin._id;
  verification.reviewedAt = new Date();
  verification.reviewReason = req.body.reason || '';
  await verification.save();

  // 🔥 §৫: Raw NID/Selfie image permanently delete — শুধু metadata থাকবে
  await Promise.all([
    storageService.deletePrivateImage(verification.nidImage?.publicId),
    storageService.deletePrivateImage(verification.selfieImage?.publicId),
  ]);
  verification.imagesPurgedAt = new Date();
  await verification.save();

  auditService.log(req.admin._id, 'verification.approved', {
    targetType: 'verification', targetId: verification._id,
    details: { userId: user._id }, ip: req.ip,
  });

  notificationService.notifyUser(user._id, {
    type: 'verification_approved',
    title: '✅ You are now a Verified Donor!',
    body: 'Your identity has been verified. A Verified Badge has been added to your profile.',
    data: { screen: 'profile' },
  }).catch(() => {});

  res.status(200).json(new ApiResponse(200, null, 'Verification approved. Raw images have been purged per policy.'));
});

// @route POST /admin/verification/:id/reject
const rejectVerification = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const verification = await VerificationRequest.findById(req.params.id);
  if (!verification) throw new ApiError(404, 'Verification request not found.');
  if (verification.status !== 'pending') {
    throw new ApiError(400, `This request has already been ${verification.status}.`);
  }

  verification.status = 'rejected';
  verification.reviewedBy = req.admin._id;
  verification.reviewedAt = new Date();
  verification.reviewReason = reason;
  await verification.save();

  auditService.log(req.admin._id, 'verification.rejected', {
    targetType: 'verification', targetId: verification._id,
    details: { reason }, ip: req.ip,
  });

  notificationService.notifyUser(verification.user, {
    type: 'verification_rejected',
    title: '❌ Verification not approved',
    body: `Your verification was rejected: ${reason}. You can submit again with clear photos.`,
    data: { screen: 'verification' },
  }).catch(() => {});

  res.status(200).json(new ApiResponse(200, null, 'Verification rejected. User can resubmit.'));
});

// ==================== ANALYTICS (§৬.২) ====================
const getDashboardAnalytics = asyncHandler(async (req, res) => {
  const [
    totalUsers, totalDonors, activeDonors, regularUsers, verifiedUsers,
    bloodGroupDist, requestStats, dailyReg, monthlyReg, divisionDist, pendingVerifications, pendingReports,
  ] = await Promise.all([
    User.countDocuments({ accountStatus: { $ne: 'deleted' } }),
    User.countDocuments({ role: 'donor', accountStatus: 'active' }),
    DonorProfile.countDocuments({ availabilityStatus: 'available' }),
    User.countDocuments({ role: 'user', accountStatus: 'active' }),
    User.countDocuments({ isVerified: true }),
    DonorProfile.aggregate([{ $group: { _id: '$bloodGroup', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    BloodRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 180 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    DonorProfile.aggregate([
      { $group: { _id: '$address.division', donors: { $sum: 1 } } },
      { $sort: { donors: -1 } }, { $limit: 10 },
    ]),
    VerificationRequest.countDocuments({ status: 'pending' }),
    Report.countDocuments({ status: 'pending' }),
  ]);

  const reqMap = Object.fromEntries(requestStats.map((r) => [r._id, r.count]));
  const sosActive = await BloodRequest.countDocuments({ urgency: 'sos', status: { $in: ['pending', 'searching_donors', 'donor_responded'] } });

  res.status(200).json(new ApiResponse(200, {
    users: { total: totalUsers, donors: totalDonors, activeDonors, regularUsers, verified: verifiedUsers },
    bloodGroupDistribution: bloodGroupDist,
    requests: {
      active: (reqMap.pending || 0) + (reqMap.searching_donors || 0) + (reqMap.donor_responded || 0),
      sosActive,
      completed: reqMap.completed || 0,
      cancelled: reqMap.cancelled || 0,
      expired: reqMap.expired || 0,
      total: Object.values(reqMap).reduce((a, b) => a + b, 0),
    },
    registrations: { daily: dailyReg, monthly: monthlyReg },
    divisionDistribution: divisionDist,
    queues: { pendingVerifications, pendingReports },
  }, 'Dashboard analytics fetched.'));
});

// ==================== USER MANAGEMENT (§৬.৩) ====================
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 100 });
  const { role, status, verified, search } = req.query;
  const filter = { accountStatus: { $ne: 'deleted' } };
  if (['donor', 'user'].includes(role)) filter.role = role;
  if (['pending_verification', 'active', 'suspended', 'banned'].includes(status)) filter.accountStatus = status;
  if (verified === 'true') filter.isVerified = true;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: regex }, { email: regex }, { phone: regex }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).select('fullName email phone role accountStatus isVerified avatar createdAt lastLoginAt')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  res.status(200).json(new ApiResponse(200, {
    users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Users fetched.'));
});

const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw new ApiError(404, 'User not found.');
  const [donorProfile, verifications, donationCount, reportCount] = await Promise.all([
    DonorProfile.findOne({ user: user._id }).lean(),
    VerificationRequest.find({ user: user._id }).select('status createdAt reviewedAt reviewReason').sort({ createdAt: -1 }).lean(),
    DonationHistory.countDocuments({ donor: user._id, status: { $ne: 'rejected' } }),
    Report.countDocuments({ reportedUser: user._id }),
  ]);
  delete user.fcmTokens;
  res.status(200).json(new ApiResponse(200, { user, donorProfile, verifications, donationCount, reportCount }, 'User details fetched.'));
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const { action, reason = '' } = req.body;
  if (!['suspend', 'ban', 'restore'].includes(action)) throw new ApiError(400, 'Invalid user status action.');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  if (user.accountStatus === 'deleted') throw new ApiError(400, 'This account has been deleted.');
  const statusMap = { suspend: 'suspended', ban: 'banned', restore: 'active' };
  user.accountStatus = statusMap[action];
  if (action === 'suspend' || action === 'ban') {
    await tokenService.revokeAllUserTokens(user._id);
    user.fcmTokens = [];
  }
  await user.save();
  auditService.log(req.admin._id, `user.${action}`, {
    targetType: 'user', targetId: user._id, details: { reason }, ip: req.ip,
  });
  const messages = {
    suspend: ['⚠️ Account suspended', `Your BloodLink account has been suspended.${reason ? ` Reason: ${reason}` : ''}`],
    ban: ['⛔ Account banned', 'Your BloodLink account has been banned for violating our policies.'],
    restore: ['✅ Account restored', 'Your BloodLink account has been restored. Welcome back!'],
  };
  notificationService.notifyUser(user._id, { type: 'security_alert', title: messages[action][0], body: messages[action][1] }).catch(() => {});
  res.status(200).json(new ApiResponse(200, { accountStatus: user.accountStatus }, `User ${action}ed successfully.`));
});

// ==================== DONOR MANAGEMENT (§৬.৪) ====================
const listDonors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 100 });
  const { bloodGroup, availability, verified, search } = req.query;
  const match = {};
  if (bloodGroup) match.bloodGroup = bloodGroup;
  if (availability) match.availabilityStatus = availability;
  const pipeline = [
    { $match: match },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.accountStatus': { $ne: 'deleted' }, ...(verified === 'true' ? { 'user.isVerified': true } : {}) } },
  ];
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    pipeline.push({ $match: { $or: [{ 'user.fullName': regex }, { 'user.email': regex }, { 'user.phone': regex }] } });
  }
  const project = {
    bloodGroup: 1, availabilityStatus: 1, totalDonationCount: 1, lastDonationDate: 1,
    address: 1, createdAt: 1,
    'user._id': 1, 'user.fullName': 1, 'user.email': 1, 'user.phone': 1,
    'user.avatar': 1, 'user.isVerified': 1, 'user.accountStatus': 1,
  };
  const [donors, countResult] = await Promise.all([
    DonorProfile.aggregate([...pipeline, { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }, { $project: project }]),
    DonorProfile.aggregate([...pipeline, { $count: 'total' }]),
  ]);
  const total = countResult[0] ? countResult[0].total : 0;
  res.status(200).json(new ApiResponse(200, {
    donors, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Donors fetched.'));
});

const updateDonorAvailabilityAdmin = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['paused', 'unavailable', 'available'].includes(status)) throw new ApiError(400, 'Invalid donor availability status.');
  const donor = await DonorProfile.findById(req.params.id);
  if (!donor) throw new ApiError(404, 'Donor not found.');
  donor.availabilityStatus = status;
  await donor.save();
  auditService.log(req.admin._id, 'donor.availability_changed', {
    targetType: 'donor', targetId: donor._id, details: { status }, ip: req.ip,
  });
  res.status(200).json(new ApiResponse(200, { availabilityStatus: status }, 'Donor availability updated.'));
});

// ==================== REQUEST MODERATION (§৬.৬) ====================
const listRequestsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 100 });
  const { status, urgency, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (urgency) filter.urgency = urgency;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ patientName: regex }, { hospitalName: regex }, { requestId: regex }];
  }
  const [requests, total] = await Promise.all([
    BloodRequest.find(filter).populate('requester', 'fullName email phone accountStatus')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BloodRequest.countDocuments(filter),
  ]);
  res.status(200).json(new ApiResponse(200, {
    requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Requests fetched.'));
});

const getRequestDetailAdmin = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate('requester', 'fullName email phone accountStatus')
    .populate('confirmedDonor', 'fullName email phone')
    .lean();
  if (!request) throw new ApiError(404, 'Request not found.');
  const responses = await DonorResponse.find({ request: request._id })
    .populate('donor', 'fullName email phone isVerified').lean();
  res.status(200).json(new ApiResponse(200, { request, responses }, 'Request details fetched.'));
});

const moderateRequest = asyncHandler(async (req, res) => {
  const { action, reason = '' } = req.body;
  if (!['reject', 'close'].includes(action)) throw new ApiError(400, 'Invalid moderation action.');
  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Request not found.');
  request.status = action === 'reject' ? 'rejected' : 'cancelled';
  await request.save();
  auditService.log(req.admin._id, `request.${action}`, {
    targetType: 'request', targetId: request._id, details: { reason, requestId: request.requestId }, ip: req.ip,
  });
  notificationService.notifyRequester(request, {
    type: 'system',
    title: action === 'reject' ? '⚠️ Request removed' : 'ℹ️ Request closed',
    body: `Your request ${request.requestId} was ${action === 'reject' ? 'removed by moderators' : 'closed'}.${reason ? ` Reason: ${reason}` : ''}`,
    data: { requestId: request._id },
  }).catch(() => {});
  notificationService.notifyInterestedDonorsClosed(request, 'cancelled').catch(() => {});
  res.status(200).json(new ApiResponse(200, { status: request.status }, `Request ${action}ed.`));
});

// ==================== REPORT MANAGEMENT (§৬.৭) ====================
const listReportsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 100 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  const [reports, total] = await Promise.all([
    Report.find(filter).populate('reporter', 'fullName email')
      .populate('reportedUser', 'fullName email accountStatus')
      .populate('requestRef', 'requestId bloodGroup status')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Report.countDocuments(filter),
  ]);
  res.status(200).json(new ApiResponse(200, {
    reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Reports fetched.'));
});

const updateReportStatus = asyncHandler(async (req, res) => {
  const { status, adminNotes = '' } = req.body;
  if (!['pending', 'reviewing', 'resolved', 'dismissed'].includes(status)) throw new ApiError(400, 'Invalid report status.');
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found.');
  report.status = status;
  report.adminNotes = adminNotes;
  report.resolvedBy = req.admin._id;
  await report.save();
  auditService.log(req.admin._id, `report.${status}`, {
    targetType: 'report', targetId: report._id, details: { adminNotes }, ip: req.ip,
  });
  res.status(200).json(new ApiResponse(200, { report }, `Report marked as '${status}'.`));
});

// ==================== HOSPITAL & BLOOD BANK (§৬.১০) ====================
const buildDirectoryPayload = (body) => ({
  name: body.name,
  address: body.address,
  division: body.division,
  district: body.district,
  contactNumber: body.contactNumber || '',
  ...(body.latitude !== undefined && body.longitude !== undefined
    ? { location: { type: 'Point', coordinates: [Number(body.longitude), Number(body.latitude)] } }
    : {}),
  isVerified: Boolean(body.isVerified),
});

const createHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.create(buildDirectoryPayload(req.body));
  auditService.log(req.admin._id, 'hospital.created', { targetType: 'hospital', targetId: hospital._id, ip: req.ip });
  res.status(201).json(new ApiResponse(201, { hospital }, 'Hospital added.'));
});

const updateHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(req.params.id, buildDirectoryPayload(req.body), { new: true });
  if (!hospital) throw new ApiError(404, 'Hospital not found.');
  auditService.log(req.admin._id, 'hospital.updated', { targetType: 'hospital', targetId: hospital._id, ip: req.ip });
  res.status(200).json(new ApiResponse(200, { hospital }, 'Hospital updated.'));
});

const deleteHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndDelete(req.params.id);
  if (!hospital) throw new ApiError(404, 'Hospital not found.');
  auditService.log(req.admin._id, 'hospital.deleted', { targetType: 'hospital', targetId: req.params.id, ip: req.ip });
  res.status(200).json(new ApiResponse(200, null, 'Hospital deleted.'));
});

const createBloodBank = asyncHandler(async (req, res) => {
  const bloodBank = await BloodBank.create({ ...buildDirectoryPayload(req.body), availableGroups: req.body.availableGroups || [] });
  auditService.log(req.admin._id, 'bloodbank.created', { targetType: 'bloodbank', targetId: bloodBank._id, ip: req.ip });
  res.status(201).json(new ApiResponse(201, { bloodBank }, 'Blood bank added.'));
});

const updateBloodBank = asyncHandler(async (req, res) => {
  const bloodBank = await BloodBank.findByIdAndUpdate(req.params.id,
    { ...buildDirectoryPayload(req.body), availableGroups: req.body.availableGroups || [] }, { new: true });
  if (!bloodBank) throw new ApiError(404, 'Blood bank not found.');
  auditService.log(req.admin._id, 'bloodbank.updated', { targetType: 'bloodbank', targetId: bloodBank._id, ip: req.ip });
  res.status(200).json(new ApiResponse(200, { bloodBank }, 'Blood bank updated.'));
});

const deleteBloodBank = asyncHandler(async (req, res) => {
  const bloodBank = await BloodBank.findByIdAndDelete(req.params.id);
  if (!bloodBank) throw new ApiError(404, 'Blood bank not found.');
  auditService.log(req.admin._id, 'bloodbank.deleted', { targetType: 'bloodbank', targetId: req.params.id, ip: req.ip });
  res.status(200).json(new ApiResponse(200, null, 'Blood bank deleted.'));
});

// ==================== REMOTE CONFIG & APP VERSION (§৬.११, §१४) ====================
const getAppConfigAdmin = asyncHandler(async (req, res) => {
  const config = await AppConfig.getConfig();
  res.status(200).json(new ApiResponse(200, { config }, 'App config fetched.'));
});

const updateAppConfig = asyncHandler(async (req, res) => {
  const allowed = ['appName', 'logoUrl', 'primaryColor', 'secondaryColor', 'supportEmail', 'maintenanceMode', 'maintenanceMessage', 'featureFlags', 'onboarding'];
  const config = await AppConfig.getConfig();
  allowed.forEach((key) => { if (req.body[key] !== undefined) config.set(key, req.body[key]); });
  await config.save();
  auditService.log(req.admin._id, 'config.updated', {
    targetType: 'config', targetId: 'global', details: { keys: allowed.filter((k) => req.body[k] !== undefined) }, ip: req.ip,
  });
  res.status(200).json(new ApiResponse(200, { config }, 'App config updated.'));
});

const updateAppVersion = asyncHandler(async (req, res) => {
  const config = await AppConfig.getConfig();
  const allowed = ['latestVersion', 'latestVersionCode', 'minimumSupportedVersionCode', 'apkUrl', 'forceUpdate', 'releaseNotes', 'fileSizeMB', 'sha256'];
  allowed.forEach((key) => { if (req.body[key] !== undefined) config.appVersion[key] = req.body[key]; });
  await config.save();
  auditService.log(req.admin._id, 'app_version.updated', {
    targetType: 'config', targetId: 'global', details: req.body, ip: req.ip,
  });
  res.status(200).json(new ApiResponse(200, { appVersion: config.appVersion }, 'App version updated.'));
});

// ==================== MONITORING & AUDIT (§৬.১২) ====================
const getSystemHealth = asyncHandler(async (req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 3600000);
  const [pushSent, pushFailed, emailsSent] = await Promise.all([
    NotificationJob.countDocuments({ channel: 'fcm', status: 'sent', createdAt: { $gte: dayAgo } }),
    NotificationJob.countDocuments({ channel: 'fcm', status: 'failed', createdAt: { $gte: dayAgo } }),
    NotificationJob.countDocuments({ channel: 'email', createdAt: { $gte: dayAgo } }),
  ]);
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const mem = process.memoryUsage();
  res.status(200).json(new ApiResponse(200, {
    api: { status: 'up', uptimeSeconds: Math.floor(process.uptime()), environment: env.nodeEnv },
    database: { status: dbStates[mongoose.connection.readyState], name: mongoose.connection.name || null },
    socket: { onlineUsers: socketService.getOnlineCount() },
    notifications24h: { pushSent, pushFailed, emailsSent },
    memoryMB: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    cronJobs: ['requestExpiry (*/10m)', 'cooldownReminder (daily 9AM)', 'sosEscalation (*/30m)'],
  }, 'System health fetched.'));
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 30, maxLimit: 100 });
  const filter = {};
  if (req.query.action) filter.action = new RegExp(`^${escapeRegex(req.query.action)}`, 'i');
  if (req.query.adminId && mongoose.isValidObjectId(req.query.adminId)) filter.admin = req.query.adminId;
  const [logs, total] = await Promise.all([
    AdminAuditLog.find(filter).populate('admin', 'fullName email role')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminAuditLog.countDocuments(filter),
  ]);
  res.status(200).json(new ApiResponse(200, {
    logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Audit logs fetched.'));
});

// ==================== BROADCAST NOTIFICATION (§৬.৯) ====================
const broadcastNotification = asyncHandler(async (req, res) => {
  const { title, body, audience } = req.body;
  if (!title || !body) throw new ApiError(400, 'Title and body are required.');
  if (!['all', 'donors', 'users'].includes(audience)) throw new ApiError(400, 'Invalid broadcast audience.');
  const filter = { accountStatus: 'active' };
  if (audience === 'donors') filter.role = 'donor';
  if (audience === 'users') filter.role = 'user';
  const userIds = await User.find(filter).select('_id').lean();
  let sent = 0;
  const BATCH = 100;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const batch = userIds.slice(i, i + BATCH);
    await Notification.insertMany(batch.map((u) => ({ user: u._id, type: 'system', title, body, data: { screen: 'notifications' } })));
    await Promise.allSettled(batch.map((u) => fcmService.sendPushToUser(u._id, { title, body, data: { screen: 'notifications' } })));
    sent += batch.length;
  }
  auditService.log(req.admin._id, 'notification.broadcast', { details: { title, audience, count: sent }, ip: req.ip });
  res.status(200).json(new ApiResponse(200, { sent }, `Broadcast sent to ${sent} users.`));
});

module.exports = {
  adminLogin,
  adminLogin2FA,
  setup2FA,
  enable2FA,
  getAdminMe,
  adminLogout,
  createAdmin,
  listAdmins,
  deactivateAdmin,
  getVerificationQueue,
  getVerificationDetail,
  approveVerification,
  rejectVerification,
  getDashboardAnalytics,
  listUsers,
  getUserDetail,
  updateUserStatus,
  listDonors,
  updateDonorAvailabilityAdmin,
  listRequestsAdmin,
  getRequestDetailAdmin,
  moderateRequest,
  listReportsAdmin,
  updateReportStatus,
  createHospital,
  updateHospital,
  deleteHospital,
  createBloodBank,
  updateBloodBank,
  deleteBloodBank,
  getAppConfigAdmin,
  updateAppConfig,
  updateAppVersion,
  getSystemHealth,
  listAuditLogs,
  broadcastNotification,
};