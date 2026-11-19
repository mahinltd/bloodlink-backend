// BloodLink Backend - Model: Hospital (§৬.১০)
const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    division: { type: String, required: true, trim: true, index: true },
    district: { type: String, required: true, trim: true, index: true },
    contactNumber: { type: String, trim: true, default: '', maxlength: 20 },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hospitalSchema.index({ location: '2dsphere' });
hospitalSchema.index({ name: 'text' });

module.exports = mongoose.model('Hospital', hospitalSchema);