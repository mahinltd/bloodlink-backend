import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ok } from '../utils/ApiResponse.js';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/users.routes.js';
import uploadRoutes from '../modules/uploads/uploads.routes.js';
import locationRoutes, { hospitalRoutes } from '../modules/locations/locations.routes.js';
import configRoutes, { i18nRoutes } from '../modules/config/config.routes.js';
import donationCardRoutes from '../modules/config/donationCard.routes.js';
import requestRoutes from '../modules/requests/requests.routes.js';
import donorRoutes, { userActionRoutes } from '../modules/donors/donors.routes.js';
import notificationRoutes, { emailRoutes } from '../modules/notifications/notifications.routes.js';
import releaseRoutes from '../modules/releases/releases.routes.js';
import publicRoutes from '../modules/public/public.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import chatRoutes, { blockRoutes } from '../modules/chat/chat.routes.js';
import reportRoutes from '../modules/reports/reports.routes.js';

const router = Router();

router.get('/health', (req, res) =>
  ok(res, {
    status: 'ok',
    service: 'bloodlink-api',
    env: env.NODE_ENV,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
);

router.use('/auth', authRoutes);
router.use('/me', userRoutes);
router.use('/uploads', uploadRoutes);
router.use('/locations', locationRoutes);
router.use('/hospitals', hospitalRoutes);
router.use('/config', configRoutes);
router.use('/donation-card', donationCardRoutes);
router.use('/i18n', i18nRoutes);
router.use('/app', releaseRoutes);
router.use('/requests', requestRoutes);
router.use('/donors', donorRoutes);
router.use('/users', userActionRoutes);
router.use('/users', blockRoutes);
router.use('/conversations', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/email', emailRoutes);
router.use('/reports', reportRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);

// পরে যোগ হবে: /admin/* additional modules

export default router;