// BloodLink Backend - Middleware: Socket.io Authentication
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || '').replace('Bearer ', '');

    if (!token) return next(new Error('Authentication required.'));

    const payload = jwt.verify(token, env.jwt.accessSecret);

    const user = await User.findById(payload.sub).select('accountStatus');
    if (!user || user.accountStatus !== 'active') {
      return next(new Error('Account is not active.'));
    }

    socket.userId = user._id.toString();
    next();
  } catch {
    next(new Error('Invalid or expired token.'));
  }
};

module.exports = socketAuth;