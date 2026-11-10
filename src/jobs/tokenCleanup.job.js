import cron from 'node-cron';
import { RefreshToken } from '../modules/auth/refreshToken.model.js';
import { logger } from '../utils/logger.js';

export function startTokenCleanupJob() {
  // প্রতি ঘণ্টায় expired tokens clean
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });
      if (result.deletedCount > 0) {
        logger.info(`[Job] Cleaned ${result.deletedCount} expired refresh tokens`);
      }
    } catch (err) {
      logger.error('[Job] Token cleanup failed:', err);
    }
  });
}