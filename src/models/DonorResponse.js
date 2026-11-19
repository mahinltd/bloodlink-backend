// BloodLink Backend - Model: DonorResponse
const mongoose = require('mongoose');

const RESPONSE_TYPES = ['interested', 'not_available', 'contact_requester'];

const donorResponseSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true, index: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    responseType: { type: String, enum: RESPONSE_TYPES, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

// এক Donor এক Request-এ একবারই respond করতে পারবে
donorResponseSchema.index({ request: 1, donor: 1 }, { unique: true });

const DonorResponse = mongoose.model('DonorResponse', donorResponseSchema);
DonorResponse.RESPONSE_TYPES = RESPONSE_TYPES;

module.exports = DonorResponse;