import mongoose from 'mongoose';

const { Schema } = mongoose;

const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fcmToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
    appVersion: { type: String, default: null },
    deviceId: { type: String, default: null },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Device = mongoose.model('Device', deviceSchema);