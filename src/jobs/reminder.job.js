// BloodLink Backend - Job: SOS Emergency Escalation (every 30 min)
const cron = require('node-cron');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const BloodRequest = require('../models/BloodRequest');
const matchingService = require('../services/matching.service');
const { REQUEST_STATUS, URGENCY_LEVELS } = require('../constants');

const ACTIVE = [REQUEST_STATUS.PENDING, REQUEST_STATUS.SEARCHING];

const startReminderJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      // ৩০ মিনিটেও কোনো donor interested হয়নি এমন SOS request → max radius-এ escalate
      const staleRequests = await BloodRequest.find({
        urgency: URGENCY_LEVELS.SOS,
        status: { $in: ACTIVE },
        interestedCount: 0,
        createdAt: { $lte: thirtyMinAgo },
        expiresAt: { $gt: new Date() },
      });

      for (const request of staleRequests) {
        await matchingService.escalateRequest(request._id);
      }

      if (staleRequests.length > 0) logger.warn(`🚨 Escalated ${staleRequests.length} SOS request(s).`);
    } catch (err) {
      logger.error('Reminder/escalation job failed:', err.message);
    }
  });

  logger.success('Cron started: sosEscalation (every 30 min)');
};

module.exports = startReminderJob;