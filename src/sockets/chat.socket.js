// BloodLink Backend - Socket: Chat Events
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const socketService = require('../services/socket.service');

// Participant কিনা যাচাই করে conversation ফেরত দেয়
const getParticipantConvo = async (conversationId, userId) => {
  const convo = await Conversation.findById(conversationId).select('participants');
  if (!convo) return null;
  if (!convo.participants.some((p) => String(p) === String(userId))) return null;
  return convo;
};

const emitToPartners = (io, convo, senderId, event, payload) => {
  convo.participants
    .filter((p) => String(p) !== String(senderId))
    .forEach((p) => io.to(`user:${p}`).emit(event, payload));
};

const registerChatSocket = (io, socket) => {
  const userId = socket.userId;

  // ---------- Typing Indicator ----------
  socket.on('typing', async ({ conversationId }) => {
    const convo = await getParticipantConvo(conversationId, userId);
    if (convo) emitToPartners(io, convo, userId, 'typing', { conversationId, userId });
  });

  socket.on('stop_typing', async ({ conversationId }) => {
    const convo = await getParticipantConvo(conversationId, userId);
    if (convo) emitToPartners(io, convo, userId, 'stop_typing', { conversationId, userId });
  });

  // ---------- Delivery Receipt ----------
  socket.on('message:delivered', async ({ messageId }) => {
    const message = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { deliveredTo: userId } },
      { new: true }
    ).select('conversation sender');
    if (!message) return;

    io.to(`user:${message.sender}`).emit('message:delivered', {
      conversationId: message.conversation,
      messageId,
      userId,
    });
  });

  // ---------- Read Receipt ----------
  socket.on('message:read', async ({ conversationId }) => {
    const convo = await getParticipantConvo(conversationId, userId);
    if (!convo) return;

    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId, deliveredTo: userId } }
    );

    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { [`unreadCounts.${userId}`]: 0 } }
    );

    emitToPartners(io, convo, userId, 'message:read', { conversationId, readerId: userId });
  });

  // ---------- Live Location (consent-based session) ----------
  socket.on('location:start', async ({ conversationId }) => {
    const convo = await getParticipantConvo(conversationId, userId);
    if (!convo) return;

    socketService.startLocationSession(conversationId, userId);
    emitToPartners(io, convo, userId, 'location:started', { conversationId, userId });
  });

  socket.on('location:update', async ({ conversationId, latitude, longitude }) => {
    // শুধু active sharing session থাকলে কাজ করবে (ডকুমেন্ট §৩.৮)
    if (!socketService.hasLocationSession(conversationId, userId)) return;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

    const convo = await getParticipantConvo(conversationId, userId);
    if (!convo) return;

    emitToPartners(io, convo, userId, 'location:update', {
      conversationId,
      userId,
      latitude,
      longitude,
      timestamp: Date.now(),
    });
  });

  socket.on('location:stop', async ({ conversationId }) => {
    if (!socketService.hasLocationSession(conversationId, userId)) return;

    socketService.stopLocationSession(conversationId, userId);
    const convo = await getParticipantConvo(conversationId, userId);
    if (convo) emitToPartners(io, convo, userId, 'location:stopped', { conversationId, userId });
  });
};

module.exports = registerChatSocket;