import mongoose from 'mongoose';
import { OTP_PURPOSES } from '../../constants/index.js';

const { Schema } = mongoose;

const otpCodeSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// এক ইমেইলে এক উদ্দেশ্যে একটাই সক্রিয় OTP — atomic upsert-এর সাথে মিলিয়ে race-proof
otpCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCode = mongoose.model('OtpCode', otpCodeSchema);