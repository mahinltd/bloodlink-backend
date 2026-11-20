// BloodLink Backend - Service: FCM Push Notification
const { messaging } = require('../config/firebase');
const logger = require('../utils/logger');
const User = require('../models/User');

const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

// FCM data payload-এ সব value string হতে হয়
const stringifyData = (data = {}) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

const sendPushToUser = async (userId, { title, body, data = {} }) => {
  const user = await User.findById(userId).select('fcmTokens');
  if (!user || user.fcmTokens.length === 0) return { sent: false, reason: 'no_tokens' };

  const tokens = user.fcmTokens.map((t) => t.token);

  if (!messaging) {
    logger.warn(`[DEV MODE] FCM push → user ${userId} | "${title}" | tokens: ${tokens.length}`);
    return { sent: true, dev: true };
  }

  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringifyData(data),
      android: { priority: 'high' },
    });

    // Invalid token পরিষ্কার
    const invalidTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_TOKEN_CODES.includes(r.error.code)) {
        invalidTokens.push(tokens[i]);
      }
    });
    if (invalidTokens.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
      );
      logger.info(`Removed ${invalidTokens.length} invalid FCM token(s) for user ${userId}.`);
    }

    return { sent: response.successCount > 0, successCount: response.successCount };
  } catch (err) {
    logger.error(`FCM send failed for user ${userId}:`, err.message);
    return { sent: false, error: err.message };
  }
};

const sendToTokens = async (tokens, { title, body, data = {} }) => {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0 };

  if (!messaging) {
    logger.warn(`[DEV MODE] FCM broadcast "${title}" | tokens: ${uniqueTokens.length}`);
    return { successCount: 0, failureCount: 0, dev: true };
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];
  const batchSize = 100;

  for (let i = 0; i < uniqueTokens.length; i += batchSize) {
    const batch = uniqueTokens.slice(i, i + batchSize);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: stringifyData(data),
        android: { priority: 'high' },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((result, index) => {
        if (!result.success && result.error && INVALID_TOKEN_CODES.includes(result.error.code)) {
          invalidTokens.push(batch[index]);
        }
      });
    } catch (err) {
      failureCount += batch.length;
      logger.error(`FCM broadcast batch failed: ${err.message}`);
    }
  }

  if (invalidTokens.length > 0) {
    try {
      await User.updateMany(
        { 'fcmTokens.token': { $in: invalidTokens } },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
      );
      logger.info(`Removed ${invalidTokens.length} invalid FCM token(s) after broadcast.`);
    } catch (err) {
      logger.error(`Failed to remove invalid FCM tokens after broadcast: ${err.message}`);
    }
  }

  return { successCount, failureCount };
};

module.exports = { sendPushToUser, sendToTokens };