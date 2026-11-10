import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { registerChatHandlers, trackConnect, trackOffline } from './chat.handler.js';
import { logger } from '../utils/logger.js';

let io = null;

export const initSocket = (httpServer, corsOrigins) => {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
  });

  // JWT অথেনটিকেশন — handshake.auth.token-এ অ্যাক্সেস টোকেন
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const payload = verifyAccessToken(token);
      if (payload.scope !== 'user') return next(new Error('INVALID_TOKEN_SCOPE'));
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`); // ব্যক্তিগত রুম — ঐ ইউজারের সব ডিভাইসে ইভেন্ট যায়
    trackConnect(userId, socket.id);
    logger.debug(`Socket connected: ${socket.id} (user ${userId})`);

    registerChatHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
      trackOffline(userId, socket.id);
    });
  });

  return io;
};

export const getIO = () => io;