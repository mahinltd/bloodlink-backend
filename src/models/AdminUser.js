// BloodLink Backend - Model: AdminUser
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ADMIN_ROLE_LIST } = require('../constants');

const adminUserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLE_LIST, required: true, index: true },
    isActive: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false }, // AES-256-GCM encrypted
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

adminUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

adminUserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

adminUserSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.twoFactorSecret;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('AdminUser', adminUserSchema);