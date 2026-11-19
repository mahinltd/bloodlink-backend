// BloodLink Backend - Model: User
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLE_LIST, USER_ROLES } = require('../constants');

const otpSubSchema = new mongoose.Schema(
  {
    hash: { type: String },
    expiresAt: { type: Date },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
  },
  { _id: false }
);

const fcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },

    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    phone: { type: String, required: true, unique: true, trim: true },

    password: { type: String, required: true, select: false },

    role: { type: String, enum: USER_ROLE_LIST, default: USER_ROLES.USER, index: true },

    accountStatus: {
      type: String,
      enum: ['pending_verification', 'active', 'suspended', 'banned', 'deleted'],
      default: 'pending_verification',
      index: true,
    },

    isEmailVerified: { type: Boolean, default: false },

    // NID Verification Badge (Phase: Verification Module)
    isVerified: { type: Boolean, default: false },

    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    fcmTokens: { type: [fcmTokenSchema], default: [] },

    emailOtp: { type: otpSubSchema, select: false },
    passwordResetOtp: { type: otpSubSchema, select: false },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak sensitive fields
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.emailOtp;
    delete ret.passwordResetOtp;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);