// BloodLink Backend - Model: DonorProfile
const mongoose = require('mongoose');
const { BLOOD_GROUPS } = require('../constants');

const AVAILABILITY_STATUS = ['available', 'unavailable', 'recently_donated', 'paused'];

const donorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },

    gender: { type: String, enum: ['male', 'female', 'other'], required: true },

    weightKg: { type: Number, required: true, min: 1, max: 500 },

    dateOfBirth: { type: Date, required: true },

    address: {
      division: { type: String, required: true, trim: true },
      district: { type: String, required: true, trim: true },
      upazila: { type: String, required: true, trim: true },
      union: { type: String, trim: true, default: '' },
      village: { type: String, trim: true, default: '' },
    },

    // GeoJSON — Matching Engine-এর জন্য (Phase 3-এ app থেকে set হবে)
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },

    lastDonationDate: { type: Date, default: null },

    // ৯০ দিনের Auto-Cooldown (env configurable)
    nextEligibleDate: { type: Date, default: null },

    medicalHistory: { type: String, trim: true, maxlength: 2000, default: '' },

    totalDonationCount: { type: Number, default: 0, min: 0 },

    availabilityStatus: {
      type: String,
      enum: AVAILABILITY_STATUS,
      default: 'available',
      index: true,
    },

    notificationPrefs: {
      enabled: { type: Boolean, default: true },
      sos: { type: Boolean, default: true },
      urgent: { type: Boolean, default: true },
      regular: { type: Boolean, default: true },
      radiusKm: { type: Number, default: 25, min: 1, max: 500 },
    },
  },
  { timestamps: true }
);

// Matching Engine indexes
donorProfileSchema.index({ location: '2dsphere' });
donorProfileSchema.index({ bloodGroup: 1, availabilityStatus: 1 });

const DonorProfile = mongoose.model('DonorProfile', donorProfileSchema);
DonorProfile.AVAILABILITY_STATUS = AVAILABILITY_STATUS;

module.exports = DonorProfile;