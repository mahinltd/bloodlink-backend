import mongoose from 'mongoose';

const { Schema } = mongoose;

// উপজেলা/থানা — দুটোই এই মডেলে
const upazilaSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', required: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

upazilaSchema.index({ nameEn: 1, districtId: 1 }, { unique: true });

export const Upazila = mongoose.model('Upazila', upazilaSchema);