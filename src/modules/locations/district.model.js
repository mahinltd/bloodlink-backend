import mongoose from 'mongoose';

const { Schema } = mongoose;

const districtSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    divisionId: { type: Schema.Types.ObjectId, ref: 'Division', required: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

districtSchema.index({ nameEn: 1, divisionId: 1 }, { unique: true });

export const District = mongoose.model('District', districtSchema);