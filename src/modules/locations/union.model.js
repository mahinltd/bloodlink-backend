import mongoose from 'mongoose';

const { Schema } = mongoose;

// ইউনিয়ন/ওয়ার্ড — দুটোই এই মডেলে
const unionSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    upazilaId: { type: Schema.Types.ObjectId, ref: 'Upazila', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

unionSchema.index({ nameEn: 1, upazilaId: 1 }, { unique: true });

export const Union = mongoose.model('Union', unionSchema);