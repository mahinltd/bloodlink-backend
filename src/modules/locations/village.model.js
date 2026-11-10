import mongoose from 'mongoose';

const { Schema } = mongoose;

const villageSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, trim: true, default: null },
    nameBnNorm: { type: String, required: true, select: false }, // ডুপ্লিকেট-চেকের জন্য normalized
    nameEnNorm: { type: String, default: null, select: false },
    unionId: { type: Schema.Types.ObjectId, ref: 'Union', required: true, index: true },
    source: { type: String, enum: ['seed', 'user'], default: 'seed', index: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    approvedAt: { type: Date, default: null },
    usedBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [], select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

villageSchema.index({ unionId: 1, nameBnNorm: 1 }, { unique: true });

export const Village = mongoose.model('Village', villageSchema);