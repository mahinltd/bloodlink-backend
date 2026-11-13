import { logger } from '../utils/logger.js';
import * as chatService from '../modules/chat/chat.service.js';
import {
  socketSendSchema,
  socketSeenSchema,
  socketDeliveredSchema,
  socketTypingSchema,
  socketPresenceSchema,
} from '../modules/chat/chat.validation.js';
import { notifyOne } from '../modules/notifications/notifications.service.js';
import { User } from '../modules/users/user.model.js';

// অনলাইন ব্যবহারকারী: userId -> Set<socketId> (একাধিক ডিভাইস সাপোর্ট)
const onlineUsers = new Map();

export const isUserOnline = (userId) => onlineUsers.has(String(userId));

export const trackConnect = (userId, socketId) => {
  const key = String(userId);
  if (!onlineUsers.has(key)) onlineUsers.set(key, new Set());
  onlineUsers.get(key).add(socketId);
};

export const trackOffline = async (userId, socketId) => {
  const key = String(userId);
  const set = onlineUsers.get(key);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) {
    onlineUsers.delete(key);
    await User.updateOne({ _id: key }, { $set: { lastSeen: new Date() } }).catch(() => {});
  }
};

// সকেট রেট-লিমিট: ১০ সেকেন্ডে সর্বোচ্চ ২০টি মেসেজ (অপব্যবহার প্রতিরোধ)
const buckets = new Map();
const rateOk = (userId) => {
  const now = Date.now();
  const b = buckets.get(userId) || { count: 0, resetAt: now + 10000 };
  if (now > b.resetAt) {
    b.count = 0;
    b.resetAt = now + 10000;
  }
  b.count += 1;
  buckets.set(userId, b);
  return b.count <= 20;
};

const fail = (ack, err) => {
  if (typeof ack === 'function') {
    ack({ success: false, error: { code: err.code || 'ERROR', message: err.message || 'Something went wrong' } });
  }
};

export const registerChatHandlers = (io, socket) => {
  const userId = socket.data.userId;

  /* ---------- মেসেজ পাঠানো ---------- */
  socket.on('message:send', async (payload, ack) => {
    try {
      if (!rateOk(userId)) throw Object.assign(new Error('Slow down, too many messages'), { code: 'RATE_LIMITED' });

      const parsed = socketSendSchema.safeParse(payload || {});
      if (!parsed.success) throw Object.assign(new Error('Invalid message payload'), { code: 'VALIDATION_ERROR' });

      const { message, recipientId } = await chatService.sendMessage(userId, parsed.data);
      const out = { ...message, ...(parsed.data.clientTempId ? { clientTempId: parsed.data.clientTempId } : {}) };

      io.to(`user:${recipientId}`).emit('message:new', out); // প্রাপকের সব ডিভাইসে
      socket.to(`user:${userId}`).emit('message:new', out); // প্রেরকের অন্য ডিভাইসে
      if (typeof ack === 'function') ack({ success: true, data: out });

      // প্রাপক অফলাইন → FCM পুশ ("বার্তা" চ্যানেল)
      if (!isUserOnline(recipientId)) {
        const sender = await User.findById(userId).select('name').lean();
        const preview = message.text ? message.text.slice(0, 80) : '📷 ছবি';
        notifyOne({
          userId: recipientId,
          type: 'message',
          title: { bn: sender?.name || '', en: sender?.name || '' },
          body: { bn: preview, en: preview },
          data: { conversationId: String(parsed.data.conversationId), senderId: String(userId) },
          respectPreference: true,
        }).catch((err) => logger.error('message notification failed:', err.message));
      }
    } catch (err) {
      fail(ack, err);
    }
  });

  /* ---------- ডেলিভার্ড ---------- */
  socket.on('message:delivered', async (payload, ack) => {
    try {
      const parsed = socketDeliveredSchema.safeParse(payload || {});
      if (!parsed.success) throw Object.assign(new Error('Invalid payload'), { code: 'VALIDATION_ERROR' });

      const { delivered } = await chatService.markDelivered(userId, parsed.data.conversationId, parsed.data.messageIds);
      if (delivered > 0) {
        const otherId = await chatService.getOtherParticipantId(parsed.data.conversationId, userId);
        if (otherId) {
          io.to(`user:${otherId}`).emit('message:delivered', {
            conversationId: parsed.data.conversationId,
            messageIds: parsed.data.messageIds,
          });
        }
      }
      if (typeof ack === 'function') ack({ success: true, data: { delivered } });
    } catch (err) {
      fail(ack, err);
    }
  });

  /* ---------- সিন ---------- */
  socket.on('message:seen', async (payload, ack) => {
    try {
      const parsed = socketSeenSchema.safeParse(payload || {});
      if (!parsed.success) throw Object.assign(new Error('Invalid payload'), { code: 'VALIDATION_ERROR' });

      const { marked, otherId } = await chatService.markConversationRead(userId, parsed.data.conversationId);
      if (marked > 0) {
        io.to(`user:${otherId}`).emit('message:seen', {
          conversationId: parsed.data.conversationId,
          seenBy: userId,
        });
      }
      if (typeof ack === 'function') ack({ success: true, data: { marked } });
    } catch (err) {
      fail(ack, err);
    }
  });

  /* ---------- টাইপিং ইন্ডিকেটর ---------- */
  for (const evt of ['typing:start', 'typing:stop']) {
    socket.on(evt, async (payload) => {
      try {
        const parsed = socketTypingSchema.safeParse(payload || {});
        if (!parsed.success) return;
        const otherId = await chatService.getOtherParticipantId(parsed.data.conversationId, userId);
        if (otherId) io.to(`user:${otherId}`).emit(evt, { conversationId: parsed.data.conversationId, userId });
      } catch {
        /* টাইপিং ব্যর্থ হলে উপেক্ষা */
      }
    });
  }

  /* ---------- অনলাইন স্ট্যাটাস ---------- */
  socket.on('presence:get', (payload, ack) => {
    const parsed = socketPresenceSchema.safeParse(payload || {});
    if (!parsed.success) return fail(ack, Object.assign(new Error('Invalid payload'), { code: 'VALIDATION_ERROR' }));
    if (typeof ack === 'function') {
      ack({ success: true, data: { userId: parsed.data.userId, online: isUserOnline(parsed.data.userId) } });
    }
  });
};