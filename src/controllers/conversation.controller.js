// BloodLink Backend - Controller: Conversation
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Block = require('../models/Block');
const User = require('../models/User');
const socketService = require('../services/socket.service');

const isBlockedEitherWay = async (userA, userB) => {
  const block = await Block.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA },
    ],
  }).lean();
  return Boolean(block);
};

// @route GET /conversations
const listMyConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id })
    .populate('participants', 'fullName avatar isVerified accountStatus')
    .populate('requestRef', 'requestId bloodGroup urgency status')
    .lean();

  const list = conversations
    .map((c) => {
      const other = c.participants.find((p) => String(p._id) !== String(req.user._id));
      return {
        _id: c._id,
        participant: other || null,
        requestRef: c.requestRef,
        lastMessage: c.lastMessage,
        unreadCount: Number(c.unreadCounts?.[String(req.user._id)] || 0),
        isOnline: other ? socketService.isOnline(other._id) : false,
        updatedAt: c.updatedAt,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.updatedAt;
      const bTime = b.lastMessage?.createdAt || b.updatedAt;
      return new Date(bTime) - new Date(aTime);
    });

  res.status(200).json(
    new ApiResponse(200, { conversations: list, total: list.length }, 'Conversations fetched successfully.')
  );
});

// @route POST /conversations
const createOrGetConversation = asyncHandler(async (req, res) => {
  const { participantId, requestRef } = req.body;
  const myId = req.user._id;

  if (String(participantId) === String(myId)) {
    throw new ApiError(400, 'You cannot start a conversation with yourself.');
  }

  const target = await User.findById(participantId).select('accountStatus');
  if (!target || target.accountStatus !== 'active') throw new ApiError(404, 'User not found.');

  if (await isBlockedEitherWay(myId, participantId)) {
    throw new ApiError(403, 'You cannot message this user.');
  }

  let conversation = await Conversation.findOne({ participants: { $all: [myId, participantId] } })
    .populate('participants', 'fullName avatar isVerified')
    .populate('requestRef', 'requestId bloodGroup urgency status');

  if (conversation) {
    return res.status(200).json(new ApiResponse(200, { conversation }, 'Conversation fetched successfully.'));
  }

  conversation = await Conversation.create({
    participants: [myId, participantId],
    requestRef: requestRef || null,
    unreadCounts: {},
  });
  conversation = await conversation.populate([
    { path: 'participants', select: 'fullName avatar isVerified' },
    { path: 'requestRef', select: 'requestId bloodGroup urgency status' },
  ]);

  res.status(201).json(new ApiResponse(201, { conversation }, 'Conversation created successfully.'));
});

// @route GET /conversations/:id
const getConversationById = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) throw new ApiError(400, 'Conversation ID is required.');
  if (!mongoose.isValidObjectId(conversationId)) throw new ApiError(400, 'Invalid conversation ID.');

  const conversation = await Conversation.findById(conversationId)
    .populate('participants', 'fullName avatar isVerified accountStatus')
    .populate('requestRef', 'requestId bloodGroup urgency status hospitalName')
    .lean();

  if (!conversation) throw new ApiError(404, 'Conversation not found.');
  if (!conversation.participants.some((p) => String(p._id) === String(req.user._id))) {
    throw new ApiError(403, 'You are not a participant of this conversation.');
  }

  const other = conversation.participants.find((p) => String(p._id) !== String(req.user._id));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        conversation,
        isOnline: other ? socketService.isOnline(other._id) : false,
        isBlocked: await isBlockedEitherWay(req.user._id, other?._id),
      },
      'Conversation fetched successfully.'
    )
  );
});

module.exports = { listMyConversations, createOrGetConversation, getConversationById, isBlockedEitherWay };