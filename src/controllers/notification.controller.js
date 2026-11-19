// BloodLink Backend - Controller: Notification Center
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Notification = require('../models/Notification');
const { buildPagination } = require('../utils/helpers');

// @route GET /notifications
const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      { notifications, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Notifications fetched successfully.'
    )
  );
});

// @route GET /notifications/unread-count
const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
  res.status(200).json(new ApiResponse(200, { unreadCount }, 'Unread count fetched.'));
});

// @route PATCH /notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) throw new ApiError(404, 'Notification not found.');

  res.status(200).json(new ApiResponse(200, { notification }, 'Notification marked as read.'));
});

// @route PATCH /notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  res.status(200).json(new ApiResponse(200, { updated: result.modifiedCount }, 'All notifications marked as read.'));
});

module.exports = { getMyNotifications, getUnreadCount, markAsRead, markAllAsRead };