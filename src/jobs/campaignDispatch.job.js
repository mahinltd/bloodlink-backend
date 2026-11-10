import cron from 'node-cron';
import { Campaign } from '../modules/admin/campaign.model.js';
import { sendCampaign } from '../modules/admin/campaign.service.js';
import { logger } from '../utils/logger.js';

export function startCampaignDispatchJob() {
  // প্রতি ৫ মিনিটে scheduled campaigns চেক
  cron.schedule('*/5 * * * *', async () => {
    try {
      const dueCampaigns = await Campaign.find({
        status: 'scheduled',
        scheduledAt: { $lte: new Date() },
      });

      for (const campaign of dueCampaigns) {
        try {
          await sendCampaign(campaign._id, campaign.createdBy, null);
          logger.info(`[Job] Dispatched campaign: ${campaign.name}`);
        } catch (err) {
          logger.error(`[Job] Failed to dispatch campaign ${campaign._id}:`, err);
        }
      }
    } catch (err) {
      logger.error('[Job] Campaign dispatch failed:', err);
    }
  });
}