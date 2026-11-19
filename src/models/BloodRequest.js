// BloodLink Backend - Model: BloodRequest
const crypto = require('crypto');
const mongoose = require('mongoose');
const { BLOOD_GROUPS, REQUEST_STATUS, URGENCY_LEVEL_LIST, URGENCY_EXPIRY_HOURS } = require('../constants');

const bloodRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, unique: true, index: true }, // BL-XXXXXX

    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    patientName: { type: String, required: true, trim: true, maxlength: 100 },

    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },

    medicalProblem: { type: String, required: true, trim: true, maxlength: 500 },

    hospitalName: { type: String, required: true, trim: true, maxlength: 200 },

    hospitalAddress: { type: String, required: true, trim: true, maxlength: 500 },

    hospitalLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },

    numberOfBags: { type: Number, required: true, min: 1, max: 10 },

    urgency: { type: String, enum: URGENCY_LEVEL_LIST, required: true, index: true },

    requiredDate: { type: String, required: true }, // YYYY-MM-DD
    requiredTime: { type: String, required: true }, // HH:mm

    contactNumber: {
      type: String,
      required: true,
      match: [/^01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number.'],
    },

    additionalNotes: { type: String, trim: true, maxlength: 1000, default: '' },

    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.SEARCHING,
      index: true,
    },

    expiresAt: { type: Date, index: true },

    interestedCount: { type: Number, default: 0 },

    confirmedDonor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ hospitalLocation: '2dsphere' });
bloodRequestSchema.index({ status: 1, urgency: 1, createdAt: -1 });
bloodRequestSchema.index({ bloodGroup: 1, status: 1, createdAt: -1 });

// Unique human-friendly Request ID
bloodRequestSchema.pre('validate', function () {
  if (this.requestId) return;
  this.requestId = `BL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
});

// Auto expiry — urgency অনুযায়ী
bloodRequestSchema.pre('validate', function () {
  if (this.expiresAt || !this.urgency) return;
  const hours = URGENCY_EXPIRY_HOURS[this.urgency] || 72;
  this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
});

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);