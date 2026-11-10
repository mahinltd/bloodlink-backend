import { logger } from '../utils/logger.js';
import { startExpireRequestsJob } from './expireRequests.job.js';
import { startTokenCleanupJob } from './tokenCleanup.job.js';
import { startHardDeleteUsersJob } from './hardDeleteUsers.job.js';
import { startCampaignDispatchJob } from './campaignDispatch.job.js';
import { startMatchingEscalationJob } from './matchingEscalation.job.js';
import { startDonationEligibilityJob } from './donationEligibility.job.js';

export const startJobs = () => {
  startExpireRequestsJob();
  startTokenCleanupJob();
  startHardDeleteUsersJob();
  startCampaignDispatchJob();
  startMatchingEscalationJob();
  startDonationEligibilityJob();
  logger.info('[Jobs] All background jobs started');
};