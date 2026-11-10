import cron from 'node-cron';
import { escalateMatching } from '../modules/matching/matching.service.js';
import { logger } from '../utils/logger.js';

export const startMatchingEscalationJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { escalated } = await escalateMatching();
      if (escalated) logger.info(`[Job] Escalated matching radius for ${escalated} request(s)`);
    } catch (error) {
      logger.error('[Job] Matching escalation failed:', error.message);
    }
  });
};
