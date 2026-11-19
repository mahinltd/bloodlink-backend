// BloodLink Backend - Model: VerificationRequest (NID)
const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Private Cloudinary storage (authenticated delivery only)
    nidImage: { publicId: String, version: String, format: String },
    selfieImage: { publicId: String, version: String, format: String },

    // User-declared metadata (Approve-এর পরও সংরক্ষিত থাকবে)
    nidNumber: { type: String, trim: true, default: '', maxlength: 30 },
    fullNameAsPerNid: { type: String, trim: true, default: '', maxlength: 100 },
    nidDateOfBirth: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewReason: { type: String, trim: true, maxlength: 500, default: '' },

    // §৫: Approval-এর পর raw image permanently delete
    imagesPurgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// একই user-এর একাধিক pending হবে না
verificationRequestSchema.index(
  { user: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('VerificationRequest', verificationRequestSchema);