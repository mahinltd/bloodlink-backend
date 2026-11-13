import mongoose from 'mongoose';
import { USER_STATUS } from '../../constants/index.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, match: /^01[3-9]\d{8}$/ },
    avatar: { type: String, default: null },
    status: { type: String, enum: USER_STATUS, default: 'unverified', index: true },
    suspendedReason: { type: String, default: '' },
    emailVerifiedAt: { type: Date, default: null },
    modes: {
      donor: { type: Boolean, default: false },
      requester: { type: Boolean, default: true }, // রক্ত চাওয়ার অনুমতি সবার
    },
    language: { type: String, enum: ['bn', 'en'], default: 'bn' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    acceptedTermsVersion: { type: String, default: null },
    notificationPrefs: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      urgentRequests: { type: Boolean, default: true },
      normalRequests: { type: Boolean, default: true },
      responses: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      motivation: { type: Boolean, default: true },
    },
    privacy: {
      showPhone: { type: String, enum: ['on_response', 'always', 'never'], default: 'on_response' },
    },
    consents: {
      termsAcceptedAt: { type: Date, default: null },
      phonePublicInApp: { type: Boolean, default: false },
      phonePublicInAppAcceptedAt: { type: Date, default: null },
      phonePublicInAppTermsVersion: { type: String, default: null },
      contactAllowed: { type: Boolean, default: false },
      noBloodSelling: { type: Boolean, default: false },
    },
    lastSeen: { type: Date, default: null },
    donationCardDismissedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }, // soft delete (৩০ দিন পর hard delete)
  },
  { timestamps: true }
);

// passwordHash ও __v কখনো রেসপন্সে যাবে না
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);