// BloodLink Backend - Job: Auto-expire Requests (SOS=3h, Urgent=24h, Regular=72h)
const cron = require('node-cron');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const BloodRequest = require('../models/BloodRequest');
const notificationService = require('../services/notification.service');
const { REQUEST_STATUS } = require('../constants');

const ACTIVE = [REQUEST_STATUS.PENDING, REQUEST_STATUS.SEARCHING, REQUEST_STATUS.DONOR_RESPONDED];

const startRequestExpiryJob = () => {
  cron.schedule('*/10 * * * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    try {
      const expired = await BloodRequest.find({ status: { $in: ACTIVE }, expiresAt: { $lt: new Date() } });

      for (const request of expired) {
        request.status = REQUEST_STATUS.EXPIRED;
        await request.save();

        await notificationService.notifyRequester(request, {
          type: 'system',
          title: '⏰ Request expired',
          body: `Your request ${request.requestId} has expired. You can create a new request anytime.`,
          data: { requestId: request._id, requestCode: request.requestId },
        });

        logger.info(`Expired request: ${request.requestId}`);
      }
    } catch (err) {
      logger.error('Request expiry job failed:', err.message);
    }
  });

  logger.success('Cron started: requestExpiry (every 10 min)');
};

module.exports = startRequestExpiryJob;