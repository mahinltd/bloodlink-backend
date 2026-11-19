// BloodLink Backend - API Route Registry (v1)
const express = require('express');
const mongoose = require('mongoose');
const env = require('../config/env');

const router = express.Router();

// ---------- Health Check ----------
router.get('/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.status(200).json({
    success: true,
    message: 'BloodLink API is healthy.',
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      version: 'v1',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbStates[mongoose.connection.readyState] || 'unknown',
    },
  });
});

// ---------- Module Routes (Phase-ভিত্তিক যুক্ত হবে) ----------
router.use('/auth', require('./auth.routes'));                  // Phase 2
router.use('/users', require('./user.routes'));                 // Phase 3
router.use('/donors', require('./donor.routes'));               // Phase 3
router.use('/requests', require('./request.routes'));           // Phase 4
router.use('/matching', require('./matching.routes'));          // Phase 5
router.use('/notifications', require('./notification.routes'));
router.use('/conversations', require('./conversation.routes')); // Phase 6
router.use('/messages', require('./message.routes'));           // Phase 6
router.use('/reports', require('./report.routes'));             // Phase 6
router.use('/donations', require('./donation.routes'));         // Phase 7
router.use('/verification', require('./verification.routes')); // Phase 8
router.use('/admin', require('./admin.routes'));               // Phase 8
// router.use('/hospitals', require('./hospital.routes'));
// router.use('/blood-banks', require('./bloodBank.routes'));
// router.use('/reports', require('./report.routes'));
// router.use('/config', require('./config.routes'));
// router.use('/app-version', require('./appVersion.routes'));

module.exports = router;