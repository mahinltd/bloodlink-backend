import mongoose from 'mongoose';

const { Schema } = mongoose;

const blockSchema = new Schema(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

export const Block = mongoose.model('Block', blockSchema);