// BloodLink Backend - Controller: Message
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { isBlockedEitherWay } = require('./conversation.controller');
const fcmService = require('../services/fcm.service');
const socketService = require('../services/socket.service');
const storageService = require('../services/storage.service');
const { buildPagination } = require('../utils/helpers');

const getParticipantConvo = async (conversationId, userId) => {
  if (!conversationId) throw new ApiError(400, 'Conversation ID is required.');
  if (!mongoose.isValidObjectId(conversationId)) throw new ApiError(400, 'Invalid conversation ID.');

  const convo = await Conversation.findById(conversationId);
  if (!convo) throw new ApiError(404, 'Conversation not found.');
  if (!convo.participants.some((p) => String(p) === String(userId))) {
    throw new ApiError(403, 'You are not a participant of this conversation.');
  }
  return convo;
};

// @route GET /conversations/:id/messages
const getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await getParticipantConvo(conversationId, req.user._id);
  const { page, limit } = buildPagination(req.query, { limit: 30, maxLimit: 50 });

  // Cursor pagination: ?before=<messageCreatedAt ISO>
  const filter = {
    conversation: conversationId,
    deletedFor: { $ne: req.user._id },
  };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'fullName avatar')
    .lean();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        messages: messages.reverse(), // পুরোনো → নতুন (UI-ready)
        hasMore: messages.length === limit,
        nextCursor: messages.length === limit ? messages[0].createdAt : null,
      },
      'Messages fetched successfully.'
    )
  );
});

// @route POST /conversations/:id/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { type, text, mediaUrl, durationSec, latitude, longitude } = req.body;
  const convo = await getParticipantConvo(req.params.conversationId, req.user._id);

  const otherId = convo.participants.find((p) => String(p) !== String(req.user._id));

  if (await isBlockedEitherWay(req.user._id, otherId)) {
    throw new ApiError(403, 'You cannot message this user.');
  }

  // Type-ভিত্তিক validation
  if (type === 'text' && !text) throw new ApiError(400, 'Text is required for text messages.');
  if (type === 'image' && !mediaUrl) throw new ApiError(400, 'mediaUrl is required for image messages.');
  if (type === 'voice' && !mediaUrl) throw new ApiError(400, 'mediaUrl is required for voice messages.');
  if (type === 'location' && (latitude === undefined || longitude === undefined)) {
    throw new ApiError(400, 'latitude and longitude are required for location messages.');
  }

  const previewText = {
    text: (text || '').slice(0, 120),
    image: '📷 Photo',
    voice: '🎤 Voice message',
    location: '📍 Location',
  }[type];

  const message = await Message.create({
    conversation: convo._id,
    sender: req.user._id,
    type,
    text: type === 'text' ? text : '',
    mediaUrl: ['image', 'voice'].includes(type) ? mediaUrl : '',
    durationSec: type === 'voice' ? durationSec || null : null,
    location: type === 'location' ? { latitude, longitude } : undefined,
  });

  await Conversation.updateOne(
    { _id: convo._id },
    {
      $set: {
        lastMessage: { text: previewText, type, sender: req.user._id, createdAt: message.createdAt },
      },
      $inc: { [`unreadCounts.${otherId}`]: 1 },
    }
  );

  const payload = await message.populate('sender', 'fullName avatar');

  // Real-time delivery — উভয় user-এর সব device-এ (multi-device sync)
  socketService.emitToUser(otherId, 'message:new', { conversationId: convo._id, message: payload });
  socketService.emitToUser(req.user._id, 'message:new', { conversationId: convo._id, message: payload });

  // Recipient offline হলে FCM push
  if (!socketService.isOnline(otherId)) {
    const title = req.user.fullName;
    const body = type === 'text' ? previewText : previewText;
    await Notification.create({
      user: otherId,
      type: 'new_message',
      title,
      body,
      data: { conversationId: convo._id, screen: 'chat' },
    });
    await fcmService.sendPushToUser(otherId, { title, body, data: { conversationId: convo._id } });
  }

  res.status(201).json(new ApiResponse(201, { message: payload }, 'Message sent.'));
});

// @route POST /messages/upload/image
const uploadChatImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please attach an image file (field name: image).');

  const result = await storageService.uploadImage(req.file.buffer, {
    folder: 'bloodlink/chat',
    publicId: undefined, // random id
  });

  res.status(200).json(new ApiResponse(200, { mediaUrl: result.secure_url }, 'Image uploaded.'));
});

// @route POST /messages/upload/voice
const uploadVoiceMessage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please attach an audio file (field name: voice).');

  const result = await storageService.uploadVoice(req.file.buffer, req.file.mimetype);

  res.status(200).json(new ApiResponse(200, { mediaUrl: result.url }, 'Voice message uploaded.'));
});

// @route DELETE /messages/:id (delete for me only)
const deleteMessageForMe = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) throw new ApiError(404, 'Message not found.');

  await getParticipantConvo(message.conversation, req.user._id);

  message.deletedFor.addToSet(req.user._id);
  await message.save();

  res.status(200).json(new ApiResponse(200, null, 'Message deleted for you.'));
});

module.exports = { getMessages, sendMessage, uploadChatImage, uploadVoiceMessage, deleteMessageForMe };