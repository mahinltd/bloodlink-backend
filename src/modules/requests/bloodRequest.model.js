import mongoose from 'mongoose';
import { BLOOD_GROUPS, BLOOD_COMPONENTS } from '../../constants/bloodGroups.js';
import { REQUEST_STATUS, REQUEST_URGENCY } from '../../constants/index.js';

const { Schema } = mongoose;

const bloodRequestSchema = new Schema(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patientName: { type: String, required: true, trim: true, maxlength: 120 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },
    component: { type: String, enum: BLOOD_COMPONENTS, default: 'whole_blood' },
    bagsNeeded: { type: Number, required: true, min: 1, max: 10 },
    bagsCollected: { type: Number, default: 0, min: 0 },
    neededBy: { type: Date, required: true },
    urgency: { type: String, enum: REQUEST_URGENCY, default: 'normal' },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', default: null },
    hospitalName: { type: String, required: true, trim: true, maxlength: 160 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    divisionId: { type: Schema.Types.ObjectId, ref: 'Division', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    upazilaId: { type: Schema.Types.ObjectId, ref: 'Upazila', default: null },
    attendantName: { type: String, required: true, trim: true, maxlength: 80 },
    attendantRelation: { type: String, default: null, trim: true, maxlength: 40 },
    attendantPhone: { type: String, required: true, match: /^01[3-9]\d{8}$/ },
    note: {
      bn: { type: String, default: '', maxlength: 500 },
      en: { type: String, default: '', maxlength: 500 },
    },
    status: { type: String, enum: REQUEST_STATUS, default: 'open', index: true },
    expiresAt: { type: Date, required: true, index: true },
    isHidden: { type: Boolean, default: false }, // ৩ রিপোর্টে স্বয়ংক্রিয়ভাবে লুকানো
    flagged: { type: Boolean, default: false }, // নিষিদ্ধ শব্দ (টাকা/বিক্রি) ধরা পড়লে
    flagReason: { type: String, default: null },
    reportsCount: { type: Number, default: 0 },
    consentAccepted: { type: Boolean, required: true }, // ঘোষণা-কার্ডের সম্মতি
    matchRadiusKm: { type: Number, default: 10, min: 1 },
    notifiedDonorIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastNotifiedAt: { type: Date, default: null },
    fulfilledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ location: '2dsphere' });
bloodRequestSchema.index({ status: 1, urgency: 1, neededBy: 1 });

export const BloodRequest = mongoose.model('BloodRequest', bloodRequestSchema);