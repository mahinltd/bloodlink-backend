import mongoose from 'mongoose';

const { Schema } = mongoose;

const hospitalSchema = new Schema(
  {
    nameBn: { type: String, required: true, trim: true },
    nameEn: { type: String, trim: true, default: null },
    nameBnNorm: { type: String, required: true, select: false },
    nameEnNorm: { type: String, default: null, select: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    divisionId: { type: Schema.Types.ObjectId, ref: 'Division', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null, index: true },
    upazilaId: { type: Schema.Types.ObjectId, ref: 'Upazila', default: null },
    source: { type: String, enum: ['seed', 'user'], default: 'seed' },
    status: { type: String, enum: ['pending', 'approved'], default: 'approved', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    approvedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hospitalSchema.index({ location: '2dsphere' });

export const Hospital = mongoose.model('Hospital', hospitalSchema);