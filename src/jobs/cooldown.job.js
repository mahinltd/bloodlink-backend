// BloodLink Backend - Job: Donation Cooldown Eligibility Reminder (Daily 9 AM)
const cron = require('node-cron');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const DonorProfile = require('../models/DonorProfile');
const notificationService = require('../services/notification.service');

const startCooldownJob = () => {
  cron.schedule('0 9 * * *', async () => {
    if (mongoose.connection.readyState !== 1) return;

    try {
      // Cooldown শেষ — donor নিজে availability confirm করলে 'available' হবে
      const donors = await DonorProfile.find({
        availabilityStatus: 'recently_donated',
        nextEligibleDate: { $lte: new Date() },
      }).select('user');

      for (const donor of donors) {
        await notificationService.notifyUser(donor.user, {
          type: 'donation_reminder',
          title: '💪 You may be eligible to donate again!',
          body: 'Your donation cooldown has ended. Confirm your availability in the app to receive blood requests.',
          data: { screen: 'donor_availability' },
        });
      }

      if (donors.length > 0) logger.info(`Cooldown reminders sent: ${donors.length}`);
    } catch (err) {
      logger.error('Cooldown job failed:', err.message);
    }
  });

  logger.success('Cron started: cooldownReminder (daily 9:00 AM)');
};

module.exports = startCooldownJob;