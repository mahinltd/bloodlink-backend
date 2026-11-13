import crypto from 'crypto';
import { env } from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import { Notification } from './notification.model.js';
import { sendPushToUsers } from './fcm.service.js';
import { User } from '../users/user.model.js';
import { logger } from '../../utils/logger.js';

export const channelFor = (type, data = {}) => {
  if (type === 'blood_request') return data.urgency === 'urgent' ? 'urgent_requests' : 'blood_requests';
  if (type === 'urgent_request') return 'urgent_requests';
  if (type === 'normal_request') return 'blood_requests';
  if (type === 'request_sos' || type === 'request_urgent') return 'urgent_requests';
  if (type === 'request_normal') return 'blood_requests';
  const channels = {
    response: 'responses',
    donation: 'responses',
    message: 'messages',
    account: 'account',
    motivation: 'motivation',
  };
  return channels[type] || 'general';
};

const prefKeyFor = (type, data = {}) => {
  if (type === 'blood_request') return data.urgency === 'urgent' ? 'urgentRequests' : 'normalRequests';
  if (type === 'urgent_request') return 'urgentRequests';
  if (type === 'normal_request') return 'normalRequests';
  if (type === 'request_sos' || type === 'request_urgent') return 'urgentRequests';
  if (type === 'request_normal') return 'normalRequests';
  const prefKeys = {
    response: 'responses',
    donation: 'responses',
    message: 'messages',
    motivation: 'motivation',
  };
  return prefKeys[type] || null;
};

const canPush = (user, type, data) => {
  const prefs = user.notificationPrefs || {};
  const prefKey = prefKeyFor(type, data);
  return prefs.push !== false && (!prefKey || prefs[prefKey] !== false);
};

export const notifyOne = async ({
  userId,
  type,
  title,
  body,
  data = {},
  respectPreference = false,
}) => {
  const user = await User.findById(userId).select('status notificationPrefs').lean();
  const accountNoticeToSuspendedUser = type === 'account' && user?.status === 'suspended';
  if (!user || (user.status !== 'active' && !accountNoticeToSuspendedUser)) return null;
  const prefKey = prefKeyFor(type, data);
  if (respectPreference && prefKey && user.notificationPrefs?.[prefKey] === false) return null;

  const notification = await Notification.create({ userId, type, title, body, data });
  if (canPush(user, type, data)) {
    await sendPushToUsers([userId], { channel: channelFor(type, data), type, title, body, data });
  }
  return notification;
};

// বিদ্যমান matcher-এর batch notification API
export const notifyUsers = async (userIds, { type, title, body, data = {} }) => {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return { notified: 0 };

  const users = await User.find({ _id: { $in: ids }, status: 'active' }).select('notificationPrefs').lean();
  const docs = users.map((user) => ({ userId: user._id, type, title, body, data }));
  const pushAllowed = users.filter((user) => canPush(user, type, data)).map((user) => user._id);

  if (docs.length) await Notification.insertMany(docs);
  await sendPushToUsers(pushAllowed, { channel: channelFor(type, data), type, title, body, data });
  return { notified: docs.length };
};

export const notifyRequestDonors = async (
  { userIds, requestId, type, title, body, data = {}, priority = 'high' },
  { pushSender = sendPushToUsers } = {}
) => {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return { notified: 0, users: [], recipientIds: [] };

  const prefKey = prefKeyFor(type, data);
  const users = await User.find({ _id: { $in: ids }, status: 'active' })
    .select('email language notificationPrefs')
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const eligible = ids.map((id) => usersById.get(id)).filter((user) => {
    if (!user) return false;
    const prefs = user.notificationPrefs || {};
    return prefs.push !== false && (!prefKey || prefs[prefKey] !== false);
  });
  const createdUsers = [];

  for (const user of eligible) {
    try {
      const result = await Notification.updateOne(
        { userId: user._id, requestId, type },
        { $setOnInsert: { userId: user._id, requestId, type, title, body, data } },
        { upsert: true }
      );
      if (result.upsertedCount) createdUsers.push(user);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  if (createdUsers.length) {
    try {
      await pushSender(
        createdUsers.map((user) => user._id),
        { channel: channelFor(type, data), type, title, body, data, priority }
      );
    } catch (error) {
      logger.error(`request push failed for ${requestId}:`, error.message);
    }
  }
  return {
    notified: createdUsers.length,
    users: createdUsers,
    recipientIds: eligible.map((user) => user._id),
  };
};

export const listForUser = async (userId, { page, limit, unread }) => {
  const filter = { userId };
  if (unread) filter.readAt = null;
  const items = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return { items, page, limit };
};

export const unreadCount = async (userId) => {
  const count = await Notification.countDocuments({ userId, readAt: null });
  return { count };
};

export const markRead = async (userId, { ids, all }) => {
  if (all !== true && !ids?.length) return { marked: 0 };
  const filter = { userId, readAt: null };
  if (!all && ids?.length) filter._id = { $in: ids };
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return { marked: result.modifiedCount };
};

const hmac = (value) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(value).digest('hex').slice(0, 32);

export const buildUnsubscribeToken = (userId) => `${userId}.${hmac(userId)}`;

export const unsubscribeByToken = async (token) => {
  const [userId, signature] = String(token).split('.');
  if (!userId || !signature || hmac(userId) !== signature) {
    throw ApiError.badRequest('Invalid unsubscribe link', 'INVALID_UNSUBSCRIBE_TOKEN');
  }
  await User.updateOne({ _id: userId }, { $set: { 'notificationPrefs.motivation': false } });
  return { unsubscribed: true };
};
