import cron from 'node-cron';
import { BloodRequest } from '../modules/requests/bloodRequest.model.js';
import { logger } from '../utils/logger.js';

export const startExpireRequestsJob = () => {
  // প্রতি ১০ মিনিটে: neededBy/expiry পার হয়ে গেলে status = expired
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const res = await BloodRequest.updateMany(
        {
          status: 'open',
          $or: [
            { urgency: 'sos', neededBy: { $lte: now } },
            { urgency: { $ne: 'sos' }, expiresAt: { $lte: now } },
          ],
        },
        { $set: { status: 'expired' } }
      );
      if (res.modifiedCount > 0) logger.info(`Expired ${res.modifiedCount} blood request(s)`);
    } catch (err) {
      logger.error('expireRequests job failed:', err.message);
    }
  });
};