// BloodLink Backend - Service: Token (JWT + Refresh Rotation)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const RefreshToken = require('../models/RefreshToken');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// '15m', '30d' → milliseconds
const parseDurationToMs = (duration) => {
  const match = /^(\d+)([smhd])$/.exec(String(duration));
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * map[match[2]];
};

const generateAccessToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role, type: 'access' },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );

const createRefreshToken = async (userId, meta = {}) => {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.jwt.refreshExpiresIn));

  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(token),
    userAgent: meta.userAgent || '',
    ip: meta.ip || '',
    expiresAt,
  });

  return token;
};

// Rotate: পুরোনো revoke → নতুন issue। Reuse detect হলে সব session revoke।
const rotateRefreshToken = async (oldToken, meta = {}) => {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(oldToken) });

  if (!stored) throw new ApiError(401, 'Invalid refresh token. Please log in again.');

  if (stored.revokedAt) {
    // Theft detected — compromise ধরে সব session বন্ধ
    await RefreshToken.updateMany(
      { user: stored.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw new ApiError(401, 'Session reuse detected. All sessions revoked. Please log in again.');
  }

  if (stored.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token expired. Please log in again.');
  }

  const newToken = crypto.randomBytes(64).toString('hex');
  const newHash = hashToken(newToken);

  stored.revokedAt = new Date();
  stored.replacedByHash = newHash;
  await stored.save();

  await RefreshToken.create({
    user: stored.user,
    tokenHash: newHash,
    userAgent: meta.userAgent || stored.userAgent,
    ip: meta.ip || stored.ip,
    expiresAt: new Date(Date.now() + parseDurationToMs(env.jwt.refreshExpiresIn)),
  });

  return { userId: stored.user, token: newToken };
};

const revokeRefreshToken = async (token) => {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const revokeAllUserTokens = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

module.exports = {
  generateAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};