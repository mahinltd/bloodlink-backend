// BloodLink Backend - Model: BloodBank (§৬.১০)
const mongoose = require('mongoose');
const { BLOOD_GROUPS } = require('../constants');

const bloodBankSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    division: { type: String, required: true, trim: true, index: true },
    district: { type: String, required: true, trim: true, index: true },
    contactNumber: { type: String, trim: true, default: '', maxlength: 20 },
    availableGroups: { type: [String], enum: BLOOD_GROUPS, default: [] },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bloodBankSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('BloodBank', bloodBankSchema);