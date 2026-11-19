// BloodLink Backend - Socket: Notification Events (§৮, §৩.১০)
const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// User-এর সব connected device-এ fresh unread count পাঠাও (multi-device sync)
const emitUnreadCount = async (io, userId) => {
  const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
  io.to(`user:${userId}`).emit('notification:count', { unreadCount });
};

const registerNotificationSocket = (io, socket) => {
  const userId = socket.userId;

  // ---------- App connect হলে fresh count চাচ্ছে ----------
  socket.on('notification:get_count', async () => {
    try {
      await emitUnreadCount(io, userId);
    } catch { /* silent — socket event-এ HTTP error নেই */ }
  });

  // ---------- App খোলা অবস্থায় single notification read ----------
  socket.on('notification:read', async ({ notificationId }) => {
    try {
      if (!notificationId || !mongoose.isValidObjectId(notificationId)) return;

      await Notification.updateOne(
        { _id: notificationId, user: userId }, // ownership যাচাই query-তেই
        { $set: { isRead: true, readAt: new Date() } }
      );

      await emitUnreadCount(io, userId);
    } catch { /* silent */ }
  });

  // ---------- Mark all as read ----------
  socket.on('notification:read_all', async () => {
    try {
      await Notification.updateMany(
        { user: userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );

      await emitUnreadCount(io, userId);
    } catch { /* silent */ }
  });
};

module.exports = registerNotificationSocket;