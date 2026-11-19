// BloodLink Backend - Socket.io Initialization
const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../utils/logger');
const socketAuth = require('../middlewares/socketAuth.middleware');
const socketService = require('../services/socket.service');
const registerChatSocket = require('./chat.socket');
const registerNotificationSocket = require('./notification.socket');

let io = null;

const initSocket = (server) => {
  const allowedOrigins = [
    env.urls.client,
    env.urls.admin,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS blocked: ${origin}`));
      },
      credentials: true,
    },
  });

  // JWT handshake auth
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    const isFirstConnection = socketService.addSocket(userId, socket.id);
    logger.info(`Socket connected    : ${socket.id} (user: ${userId})`);

    if (isFirstConnection) {
      socketService.notifyPartnersStatus(io, userId, true).catch(() => {});
    }

    // Chat events (typing, read receipts, delivery, live location)
    registerChatSocket(io, socket);
    // Notification events (read sync, unread count)
    registerNotificationSocket(io, socket);

    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected : ${socket.id} (${reason})`);

      const fullyOffline = socketService.removeSocket(userId, socket.id);

      // চলমান live location session বন্ধ + partners-কে জানাও
      const stoppedConvos = socketService.stopAllLocationSessionsForUser(userId);
      stoppedConvos.forEach((conversationId) => {
        socket.broadcast.emit('location:stopped', { conversationId, userId });
      });

      if (fullyOffline) {
        socketService.notifyPartnersStatus(io, userId, false).catch(() => {});
      }
    });
  });

  logger.success('Socket.io server initialized.');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io has not been initialized yet.');
  return io;
};

module.exports = { initSocket, getIO };