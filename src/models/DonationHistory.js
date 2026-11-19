// BloodLink Backend - Model: DonationHistory
const mongoose = require('mongoose');
const { BLOOD_GROUPS } = require('../constants');

const DONATION_STATUS = ['confirmed', 'pending_confirmation', 'self_reported', 'rejected'];

const donationHistorySchema = new mongoose.Schema(
  {
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Recipient (requester) — confirmation authority
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', default: null },

    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },

    donationDate: { type: Date, required: true },

    hospitalName: { type: String, required: true, trim: true, maxlength: 200 },
    hospitalAddress: { type: String, trim: true, maxlength: 500, default: '' },

    units: { type: Number, default: 1, min: 1, max: 2 }, // এক donor সাধারণত ১ bag

    status: { type: String, enum: DONATION_STATUS, default: 'self_reported', index: true },

    source: { type: String, enum: ['bloodlink_request', 'donor_log'], default: 'donor_log' },

    notes: { type: String, trim: true, maxlength: 500, default: '' },

    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// একই request-এ একই donor-এর একাধিক record হবে না
donationHistorySchema.index(
  { donor: 1, request: 1 },
  { unique: true, partialFilterExpression: { request: { $type: 'objectId' } } }
);
donationHistorySchema.index({ donor: 1, donationDate: -1 });

const DonationHistory = mongoose.model('DonationHistory', donationHistorySchema);
DonationHistory.DONATION_STATUS = DONATION_STATUS;

module.exports = DonationHistory;