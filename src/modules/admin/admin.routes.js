import { Router } from 'express';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import { authLimiter } from '../../middlewares/rateLimiter.middleware.js';
import * as controller from './admin.controller.js';
import moderationRoutes from './moderation.routes.js';

const router = Router();

router.post('/auth/login', authLimiter, controller.login);
router.post('/auth/verify-2fa', authLimiter, controller.verify2fa);
router.use(moderationRoutes);

router.use(protectAdmin);

router.get('/auth/me', controller.getMe);
router.post('/auth/change-password', controller.changePassword);
router.post('/auth/2fa/setup', controller.setup2fa);
router.post('/auth/2fa/enable', controller.enable2fa);
router.post('/auth/2fa/disable', controller.disable2fa);

router.get('/admins', requireRole('superAdmin'), controller.listAdmins);
router.post('/admins', requireRole('superAdmin'), controller.createAdmin);
router.patch('/admins/:id', requireRole('superAdmin'), controller.updateAdmin);

router.get('/audit-logs', requireRole('superAdmin'), controller.getAuditLogs);

export default router;
