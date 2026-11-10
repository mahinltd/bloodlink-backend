import cron from 'node-cron';
import { User } from '../modules/users/user.model.js';
import { DonorProfile } from '../modules/users/donorProfile.model.js';
import { IdVerification } from '../modules/users/idVerification.model.js';
import { Device } from '../modules/notifications/device.model.js';
import { RefreshToken } from '../modules/auth/refreshToken.model.js';
import { logger } from '../utils/logger.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function startHardDeleteUsersJob() {
  // প্রতিদিন রাত ৩টায়
  cron.schedule('0 3 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
      const usersToDelete = await User.find({ 
        status: 'deleted', 
        deletedAt: { $lt: cutoff } 
      }).select('_id');

      if (usersToDelete.length === 0) return;

      const userIds = usersToDelete.map(u => u._id);
      
      // Related data clean
      await Promise.all([
        DonorProfile.deleteMany({ userId: { $in: userIds } }),
        IdVerification.deleteMany({ userId: { $in: userIds } }),
        Device.deleteMany({ userId: { $in: userIds } }),
        RefreshToken.deleteMany({ userId: { $in: userIds } }),
        User.deleteMany({ _id: { $in: userIds } }),
      ]);

      logger.info(`[Job] Hard deleted ${userIds.length} users (30-day retention passed)`);
    } catch (err) {
      logger.error('[Job] Hard delete users failed:', err);
    }
  });
}