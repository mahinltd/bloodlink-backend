import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest' },
    type: { type: String, required: true, index: true }, // blood_request | response | message | donation | account | motivation
    title: {
      bn: { type: String, default: '' },
      en: { type: String, default: '' },
    },
    body: {
      bn: { type: String, default: '' },
      en: { type: String, default: '' },
    },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, requestId: 1, type: 1 },
  { unique: true, partialFilterExpression: { requestId: { $exists: true } } }
);

export const Notification = mongoose.model('Notification', notificationSchema);