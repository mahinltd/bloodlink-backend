import mongoose from 'mongoose';

const { Schema } = mongoose;

const divisionSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    source: { type: String, enum: ['seed', 'admin'], default: 'seed' },
  },
  { timestamps: true }
);

divisionSchema.index({ nameEn: 1 }, { unique: true });

export const Division = mongoose.model('Division', divisionSchema);