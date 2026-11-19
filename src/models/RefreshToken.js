// BloodLink Backend - Model: RefreshToken (Rotation + Reuse Detection)
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
  },
  { timestamps: true }
);

// MongoDB TTL Index — expire হলে auto-delete
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);