import ApiError from '../../utils/ApiError.js';
import { Conversation } from './conversation.model.js';
import { Message } from './message.model.js';
import { Block } from './block.model.js';
import { User } from '../users/user.model.js';

export const buildParticipantsKey = (a, b) => [String(a), String(b)].sort().join('_');

// দুই দিকের ব্লকই চেক — যেকোনো একজন ব্লক করলেই মেসেজ বন্ধ
export const isBlockedBetween = async (a, b) => {
  const count = await Block.countDocuments({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  });
  return count > 0;
};

const assertMember = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
  const isMember = conversation.participants.some((p) => p.toString() === String(userId));
  if (!isMember) throw ApiError.forbidden('You are not a participant', 'NOT_PARTICIPANT');
  return conversation;
};

export const getOtherParticipantId = async (conversationId, userId) => {
  const conversation = await assertMember(conversationId, userId);
  const other = conversation.participants.find((p) => p.toString() !== String(userId));
  return other ? String(other) : null;
};

const shapeConversation = (c, userId) => {
  const other = c.participants.find((p) => p._id.toString() !== String(userId)) || null;
  return {
    id: c._id,
    requestId: c.requestId,
    participant: other
      ? { id: other._id, name: other.name, avatar: other.avatar, status: other.status }
      : null,
    lastMessage: c.lastMessage,
    unreadCount: Number(c.unreadCounts?.[String(userId)] || 0),
    updatedAt: c.updatedAt,
  };
};

export const listConversations = async (userId, { page, limit }) => {
  const items = await Conversation.find({ participants: userId })
    .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('participants', 'name avatar status')
    .lean();
  return { conversations: items.map((c) => shapeConversation(c, userId)), page, limit };
};

// "মেসেজ" বাটন — একই জুড়িতে পুরনো কনভার্সেশনই ফিরবে (ডুপ্লিকেট নয়)
export const startConversation = async (userId, { userId: targetUserId, requestId }) => {
  if (String(userId) === String(targetUserId)) {
    throw ApiError.badRequest('You cannot message yourself', 'CANNOT_MESSAGE_SELF');
  }
  const target = await User.findById(targetUserId).select('status').lean();
  if (!target || target.status !== 'active') throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  if (await isBlockedBetween(userId, targetUserId)) {
    throw ApiError.forbidden('Messaging is not allowed between you and this user', 'BLOCKED');
  }

  const participantsKey = buildParticipantsKey(userId, targetUserId);
  let conversation = await Conversation.findOne({ participantsKey });
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, targetUserId],
      participantsKey,
      requestId: requestId || null,
    });
  }
  const shaped = await Conversation.findById(conversation._id)
    .populate('participants', 'name avatar status')
    .lean();
  return { conversation: shapeConversation(shaped, userId) };
};

export const getMessages = async (userId, conversationId, { before, limit }) => {
  await assertMember(conversationId, userId);
  const filter = { conversationId };
  if (before) {
    const anchor = await Message.findById(before).select('createdAt').lean();
    if (anchor) filter.createdAt = { $lt: anchor.createdAt };
  }
  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return { messages: docs.reverse(), hasMore: docs.length === limit };
};

// সকেট ও REST — দুটোই এই ফাংশন ব্যবহার করে
export const sendMessage = async (senderId, { conversationId, text, imageUrl }) => {
  const conversation = await assertMember(conversationId, senderId);
  const recipientId = conversation.participants.find((p) => p.toString() !== String(senderId));

  const recipient = await User.findById(recipientId).select('status').lean();
  if (!recipient || recipient.status !== 'active') {
    throw ApiError.badRequest('Recipient is not available', 'RECIPIENT_UNAVAILABLE');
  }
  if (await isBlockedBetween(senderId, recipientId)) {
    throw ApiError.forbidden('Messaging is not allowed between you and this user', 'BLOCKED');
  }

  const message = await Message.create({
    conversationId,
    senderId,
    text: text || '',
    imageUrl: imageUrl || null,
  });

  conversation.lastMessage = {
    text: message.text,
    imageUrl: message.imageUrl,
    senderId,
    createdAt: message.createdAt,
  };
  const key = String(recipientId);
  conversation.unreadCounts.set(key, Number(conversation.unreadCounts.get(key) || 0) + 1);
  await conversation.save();

  return { message: message.toJSON(), recipientId: String(recipientId) };
};

export const markConversationRead = async (userId, conversationId) => {
  const conversation = await assertMember(conversationId, userId);
  conversation.unreadCounts.set(String(userId), 0);
  await conversation.save();
  const res = await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, status: { $ne: 'seen' } },
    { $set: { status: 'seen' } }
  );
  const otherId = conversation.participants.find((p) => p.toString() !== String(userId));
  return { marked: res.modifiedCount, otherId: String(otherId) };
};

export const markDelivered = async (userId, conversationId, messageIds) => {
  await assertMember(conversationId, userId);
  const res = await Message.updateMany(
    { _id: { $in: messageIds }, conversationId, senderId: { $ne: userId }, status: 'sent' },
    { $set: { status: 'delivered' } }
  );
  return { delivered: res.modifiedCount };
};

export const blockUser = async (userId, targetId) => {
  if (String(userId) === String(targetId)) {
    throw ApiError.badRequest('You cannot block yourself', 'CANNOT_BLOCK_SELF');
  }
  const target = await User.findById(targetId).select('_id').lean();
  if (!target) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  await Block.updateOne(
    { blockerId: userId, blockedId: targetId },
    { $setOnInsert: { blockerId: userId, blockedId: targetId } },
    { upsert: true }
  );
  return { blocked: true };
};

export const unblockUser = async (userId, targetId) => {
  await Block.deleteOne({ blockerId: userId, blockedId: targetId });
  return { blocked: false };
};