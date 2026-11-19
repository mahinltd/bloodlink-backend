// BloodLink Backend - Jobs Registry
const startRequestExpiryJob = require('./requestExpiry.job');
const startCooldownJob = require('./cooldown.job');
const startReminderJob = require('./reminder.job');

const startJobs = () => {
  startRequestExpiryJob();
  startCooldownJob();
  startReminderJob();
};

module.exports = { startJobs };