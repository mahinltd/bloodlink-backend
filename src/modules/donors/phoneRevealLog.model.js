import mongoose from 'mongoose';

const { Schema } = mongoose;

const phoneRevealLogSchema = new Schema(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

phoneRevealLogSchema.index({ viewerId: 1, createdAt: -1 });

export const PhoneRevealLog = mongoose.model('PhoneRevealLog', phoneRevealLogSchema);
