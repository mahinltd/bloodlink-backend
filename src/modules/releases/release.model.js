import mongoose from 'mongoose';

const releaseSchema = new mongoose.Schema(
  {
    versionCode: { type: Number, required: true, unique: true, min: 1, index: true },
    versionName: { type: String, required: true, trim: true },
    apkUrl: { type: String, required: true },
    fileSizeBytes: { type: Number, default: 0 },
    sha256: { type: String, default: '' },
    releaseNotes: {
      bn: { type: String, default: '' },
      en: { type: String, default: '' },
    },
    mandatory: { type: Boolean, default: false },
    minSupportedVersionCode: { type: Number, default: 0 },
    rolloutPercent: { type: Number, default: 100, min: 0, max: 100 },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null }, // admin id (admin module-এ আসবে)
  },
  { timestamps: true }
);

export const Release = mongoose.model('Release', releaseSchema);