// BloodLink Backend - Route: /admin
const express = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/admin.controller');
const validate = require('../middlewares/validate.middleware');
const { adminProtect, requireAdminRoles } = require('../middlewares/admin.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const { BLOOD_GROUPS } = require('../constants');
const DonorProfile = require('../models/DonorProfile');
const Report = require('../models/Report');

const router = express.Router();

const idRule = [param('id').isMongoId().withMessage('Invalid ID.')];

// ---------- Public Auth ----------
router.post(
  '/auth/login',
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty().withMessage('Password is required.')],
  validate,
  controller.adminLogin
);
router.post(
  '/auth/2fa/login',
  authLimiter,
  [body('pendingToken').notEmpty(), body('code').isLength({ min: 6, max: 6 }).isNumeric()],
  validate,
  controller.adminLogin2FA
);

// ---------- Protected (সব admin) ----------
router.use(adminProtect);

router.get('/auth/me', controller.getAdminMe);
router.post('/auth/logout', controller.adminLogout);
router.post('/auth/2fa/setup', controller.setup2FA);
router.post(
  '/auth/2fa/enable',
  [body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the 6-digit code.')],
  validate,
  controller.enable2FA
);

// ---------- Verification Center (super_admin + verification_admin) ----------
router.get('/verification/queue', requireAdminRoles('verification_admin'), controller.getVerificationQueue);
router.get('/verification/:id', requireAdminRoles('verification_admin'), idRule, validate, controller.getVerificationDetail);
router.post('/verification/:id/approve', requireAdminRoles('verification_admin'), idRule, validate, controller.approveVerification);
router.post(
  '/verification/:id/reject',
  requireAdminRoles('verification_admin'),
  idRule,
  [body('reason').trim().notEmpty().withMessage('Rejection reason is required.').isLength({ max: 500 })],
  validate,
  controller.rejectVerification
);

// ---------- Admin Management (super_admin only) ----------
router.post(
  '/admins',
  requireAdminRoles(),
  [
    body('fullName').trim().isLength({ min: 3, max: 100 }).withMessage('Full name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 10, max: 64 }).withMessage('Admin password must be 10–64 characters.')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain letters and numbers.'),
    body('role').isIn(['verification_admin', 'support_admin', 'content_admin', 'monitoring_admin'])
      .withMessage('Invalid admin role. (super_admin cannot be created via API)'),
  ],
  validate,
  controller.createAdmin
);
router.get('/admins', requireAdminRoles(), controller.listAdmins);
router.patch('/admins/:id/deactivate', requireAdminRoles(), idRule, validate, controller.deactivateAdmin);

// ---------- Analytics (সব admin) ----------
router.get('/analytics/dashboard', controller.getDashboardAnalytics);

// ---------- User Management (super_admin, support_admin) ----------
const supportRoles = requireAdminRoles('support_admin');
router.get('/users', supportRoles, controller.listUsers);
router.get('/users/:id', supportRoles, idRule, validate, controller.getUserDetail);
router.patch(
  '/users/:id/status',
  supportRoles,
  idRule,
  [
    body('action').isIn(['suspend', 'ban', 'restore']).withMessage('Action must be suspend, ban or restore.'),
    body('reason').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  controller.updateUserStatus
);

// ---------- Donor Management (super_admin, support_admin) ----------
router.get('/donors', supportRoles, controller.listDonors);
router.patch(
  '/donors/:id/availability',
  supportRoles,
  idRule,
  [body('status').isIn(DonorProfile.AVAILABILITY_STATUS).withMessage('Invalid availability status.')],
  validate,
  controller.updateDonorAvailabilityAdmin
);

// ---------- Request Moderation (super_admin, support_admin, monitoring_admin) ----------
const moderationRoles = requireAdminRoles('support_admin', 'monitoring_admin');
router.get('/requests', moderationRoles, controller.listRequestsAdmin);
router.get('/requests/:id', moderationRoles, idRule, validate, controller.getRequestDetailAdmin);
router.patch(
  '/requests/:id/moderate',
  moderationRoles,
  idRule,
  [
    body('action').isIn(['reject', 'close']).withMessage('Action must be reject or close.'),
    body('reason').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  controller.moderateRequest
);

// ---------- Report Management (super_admin, support_admin, monitoring_admin) ----------
router.get('/reports', moderationRoles, controller.listReportsAdmin);
router.patch(
  '/reports/:id',
  moderationRoles,
  idRule,
  [
    body('status').isIn(['reviewing', 'resolved', 'dismissed']).withMessage('Invalid report status.'),
    body('adminNotes').optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  controller.updateReportStatus
);

// ---------- Hospital & Blood Bank (super_admin, content_admin) ----------
const contentRoles = requireAdminRoles('content_admin');

const directoryRules = [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 200 }),
  body('address').trim().notEmpty().withMessage('Address is required.').isLength({ max: 500 }),
  body('division').trim().notEmpty().withMessage('Division is required.'),
  body('district').trim().notEmpty().withMessage('District is required.'),
  body('contactNumber').optional().trim().isLength({ max: 20 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('isVerified').optional().isBoolean(),
];

router.post('/hospitals', contentRoles, directoryRules, validate, controller.createHospital);
router.patch('/hospitals/:id', contentRoles, idRule, validate, controller.updateHospital);
router.delete('/hospitals/:id', contentRoles, idRule, validate, controller.deleteHospital);

router.post(
  '/blood-banks',
  contentRoles,
  [...directoryRules, body('availableGroups').optional().isArray().custom((arr) => arr.every((g) => BLOOD_GROUPS.includes(g))).withMessage('Invalid blood group in availableGroups.')],
  validate,
  controller.createBloodBank
);
router.patch('/blood-banks/:id', contentRoles, idRule, validate, controller.updateBloodBank);
router.delete('/blood-banks/:id', contentRoles, idRule, validate, controller.deleteBloodBank);

// ---------- Remote Config & App Version (super_admin, content_admin) ----------
router.get('/config', contentRoles, controller.getAppConfigAdmin);
router.put('/config', contentRoles, controller.updateAppConfig);
router.put(
  '/app-version',
  contentRoles,
  [
    body('latestVersion').optional().trim().matches(/^\d+\.\d+\.\d+$/).withMessage('Version must be like 1.2.0'),
    body('latestVersionCode').optional().isInt({ min: 1 }),
    body('minimumSupportedVersionCode').optional().isInt({ min: 1 }),
    body('apkUrl').optional().isURL().withMessage('APK URL must be valid.'),
    body('forceUpdate').optional().isBoolean(),
    body('releaseNotes').optional().trim().isLength({ max: 2000 }),
    body('fileSizeMB').optional().isFloat({ min: 0 }),
    body('sha256').optional().trim().isLength({ min: 64, max: 64 }).withMessage('SHA-256 must be 64 hex characters.'),
  ],
  validate,
  controller.updateAppVersion
);

// ---------- Broadcast (super_admin, support_admin) ----------
const broadcastRules = [
  supportRoles,
  [
    body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 150 }),
    body('body').trim().notEmpty().withMessage('Body is required.').isLength({ max: 500 }),
    body('audience').isIn(['all', 'donors', 'users']).withMessage('Audience must be all, donors or users.'),
  ],
  validate,
  controller.broadcastNotification,
];

router.post('/broadcast', ...broadcastRules);
router.post('/notifications/broadcast', ...broadcastRules);

// ---------- Monitoring & Audit (super_admin, monitoring_admin) ----------
const monitorRoles = requireAdminRoles('monitoring_admin');
router.get('/system/health', monitorRoles, controller.getSystemHealth);
router.get('/audit-logs', monitorRoles, controller.listAuditLogs);

module.exports = router;