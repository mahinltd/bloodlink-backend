import mongoose from 'mongoose';

const { Schema } = mongoose;

const idVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    frontImage: { type: String, default: null, select: false }, // অনুমোদনের পর ব্যক্তিগত ছবি মুছে ফেলা হয়
    backImage: { type: String, default: null, select: false },
    selfie: { type: String, default: null, select: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectReason: { type: String, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    imagesDeletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const IdVerification = mongoose.model('IdVerification', idVerificationSchema);