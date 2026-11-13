import { getFirebaseMessaging } from '../../config/firebase.js';
import { env } from '../../config/env.js';
import { Device } from './device.model.js';
import { logger } from '../../utils/logger.js';

const CHUNK = 500;
const INVALID_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const toDataPayload = ({ channel, type, title, body, data }) => ({
  type,
  channel,
  title_bn: title?.bn || '',
  title_en: title?.en || '',
  body_bn: body?.bn || '',
  body_en: body?.en || '',
  ...Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value)])),
});

export const sendPushToUsers = async (userIds, payload) => {
  if (!userIds?.length) return { sent: 0 };

  const devices = await Device.find({ userId: { $in: userIds } }).select('fcmToken').lean();
  const tokens = [...new Set(devices.map((device) => device.fcmToken))];
  if (!tokens.length) return { sent: 0 };

  // Firebase কনফিগ না থাকলে ডেভ মোডে লগ
  if (!env.FIREBASE_PROJECT_ID) {
    logger.warn(`[DEV PUSH] type=${payload.type} -> ${tokens.length} token(s) | ${payload.title?.en || ''}`);
    return { dev: true, sent: 0 };
  }

  const messaging = getFirebaseMessaging();
  const data = toDataPayload(payload);
  const invalidTokens = [];
  let sent = 0;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      data,
      android: {
        priority: payload.priority || 'high',
        ttl: 3600 * 1000,
        ...(payload.sound || payload.data?.sound
          ? { notification: { channelId: payload.channel, sound: payload.sound || payload.data.sound } }
          : {}),
      },
    });
    sent += res.successCount;
    res.responses.forEach((response, index) => {
      if (!response.success && INVALID_CODES.has(response.error?.code)) {
        invalidTokens.push(chunk[index]);
      }
    });
  }

  if (invalidTokens.length) {
    await Device.deleteMany({ fcmToken: { $in: invalidTokens } });
    logger.info(`Removed ${invalidTokens.length} stale FCM token(s)`);
  }
  return { sent, invalidRemoved: invalidTokens.length };
};