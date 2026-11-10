import mongoose from 'mongoose';
import { BLOOD_GROUPS } from '../../constants/bloodGroups.js';

const { Schema } = mongoose;

const donorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    weightKg: { type: Number, required: true, min: 1 },
    lastDonationDate: { type: Date, default: null },
    eligibilityNotifiedFor: { type: Date, default: null },
    donationCount: { type: Number, default: 0, min: 0 },
    healthDeclaration: {
      recentIllness: { type: [String], default: [] },
      surgery: { type: Boolean, default: false },
      tattooOrPiercing: { type: Boolean, default: false },
      onMedication: { type: Boolean, default: false },
      pregnantOrBreastfeeding: { type: Boolean, default: false },
      chronicDisease: { type: Boolean, default: false },
    },
    isAvailable: { type: Boolean, default: true, index: true },
    radiusKm: { type: Number, default: 10, min: 1, max: 100 },
    nightOk: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat] — দ্রাঘিমাংশ আগে!
    },
    divisionId: { type: Schema.Types.ObjectId, ref: 'Division', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    upazilaId: { type: Schema.Types.ObjectId, ref: 'Upazila', default: null },
    unionId: { type: Schema.Types.ObjectId, ref: 'Union', default: null },
    villageId: { type: Schema.Types.ObjectId, ref: 'Village', default: null },
    villageName: { type: String, default: null, trim: true }, // user-টাইপ করা, pending হলে
    addressDetail: { type: String, default: null, select: false }, // কখনো অন্যকে দেখানো হবে না
    isLocationVerified: { type: Boolean, default: false },
    idVerified: { type: Boolean, default: false },
    idVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

donorProfileSchema.index({ location: '2dsphere' });
donorProfileSchema.index({ bloodGroup: 1, isAvailable: 1, districtId: 1 });

export const DonorProfile = mongoose.model('DonorProfile', donorProfileSchema);