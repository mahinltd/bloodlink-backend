import mongoose from 'mongoose';

const { Schema } = mongoose;

const otpSendLimitSchema = new Schema(
  {
    _id: { type: String },
    sentAt: { type: [Date], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, collection: 'otp_send_limits' }
);

otpSendLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpSendLimit = mongoose.model('OtpSendLimit', otpSendLimitSchema);
