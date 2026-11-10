import { Router } from 'express';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js'; // ⚠️ ফাইলনেম মিলিয়ে নিন
import { requireRole } from '../../middlewares/role.middleware.js'; // ⚠️ ফাইলনেম মিলিয়ে নিন
import * as controller from './moderation.controller.js';

const router = Router();

router.use(protectAdmin);

// ⚠️ requireRole array নিলে: requireRole(['superAdmin', 'moderator'])
const canModerate = requireRole('superAdmin', 'moderator');

// Dashboard — সব role দেখতে পারবে (viewer সহ)
router.get('/dashboard/stats', controller.getDashboardStats);

// Users moderation
router.get('/users', canModerate, controller.listUsers);
router.get('/users/:id', canModerate, controller.getUserDetail);
router.patch('/users/:id/status', canModerate, controller.setUserStatus);
router.post('/users/:id/revoke-sessions', canModerate, controller.revokeUserSessions);

// ID verification queue
router.get('/id-verifications', canModerate, controller.listIdVerifications);
router.get('/id-verifications/:id', canModerate, controller.getIdVerificationDetail);
router.post('/id-verifications/:id/approve', canModerate, controller.approveIdVerification);
router.post('/id-verifications/:id/reject', canModerate, controller.rejectIdVerification);

// Requests moderation
router.get('/requests', canModerate, controller.listRequests);
router.get('/requests/:id', canModerate, controller.getRequestDetail);
router.post('/requests/:id/hide', canModerate, controller.hideRequest);
router.post('/requests/:id/unhide', canModerate, controller.unhideRequest);
router.post('/requests/:id/cancel', canModerate, controller.cancelRequest);

// Reports queue
router.get('/reports', canModerate, controller.listReports);
router.post('/reports/:id/resolve', canModerate, controller.resolveReport);

export default router;