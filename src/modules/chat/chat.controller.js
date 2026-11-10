import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/ApiResponse.js';
import * as service from './chat.service.js';
import { getIO } from '../../socket/index.js';
import { isUserOnline } from '../../socket/chat.handler.js';
import { sendPushToUsers } from '../notifications/fcm.service.js';
import { User } from '../users/user.model.js';

export const list = asyncHandler(async (req, res) =>
  ok(res, await service.listConversations(req.auth.userId, req.query))
);

export const start = asyncHandler(async (req, res) =>
  created(res, await service.startConversation(req.auth.userId, req.body))
);

export const messages = asyncHandler(async (req, res) =>
  ok(res, await service.getMessages(req.auth.userId, req.params.id, req.query))
);

// REST ফলব্যাক — সকেট সংযোগ না থাকলেও মেসেজ যাবে
export const sendRest = asyncHandler(async (req, res) => {
  const { message, recipientId } = await service.sendMessage(req.auth.userId, {
    conversationId: req.params.id,
    text: req.body.text,
    imageUrl: req.body.imageUrl,
  });

  const io = getIO();
  if (io) io.to(`user:${recipientId}`).emit('message:new', message);

  if (!isUserOnline(recipientId)) {
    const sender = await User.findById(req.auth.userId).select('name').lean();
    const preview = message.text ? message.text.slice(0, 80) : '📷 ছবি';
    sendPushToUsers([recipientId], {
      channel: 'messages',
      type: 'message',
      title: { bn: sender?.name || '', en: sender?.name || '' },
      body: { bn: preview, en: preview },
      data: { conversationId: String(req.params.id) },
    }).catch(() => {});
  }
  created(res, { message });
});

export const read = asyncHandler(async (req, res) => {
  const result = await service.markConversationRead(req.auth.userId, req.params.id);
  const io = getIO();
  if (io && result.marked > 0) {
    io.to(`user:${result.otherId}`).emit('message:seen', {
      conversationId: String(req.params.id),
      seenBy: req.auth.userId,
    });
  }
  ok(res, { marked: result.marked });
});

export const block = asyncHandler(async (req, res) =>
  ok(res, await service.blockUser(req.auth.userId, req.params.id), 'User blocked')
);

export const unblock = asyncHandler(async (req, res) =>
  ok(res, await service.unblockUser(req.auth.userId, req.params.id), 'User unblocked')
);