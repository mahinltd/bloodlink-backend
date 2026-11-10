import mongoose from 'mongoose';

const { Schema } = mongoose;

const appConfigSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    designTokens: { type: Schema.Types.Mixed, default: {} },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
    businessRules: { type: Schema.Types.Mixed, default: {} },
    onboardingSlides: { type: [Schema.Types.Mixed], default: [] },
    donationCard: { type: Schema.Types.Mixed, default: {} },
    contact: { type: Schema.Types.Mixed, default: {} },
    developerInfo: { type: Schema.Types.Mixed, default: {} },
    legal: { type: Schema.Types.Mixed, default: {} },
    legalTexts: { type: Schema.Types.Mixed, default: {} },
    maintenance: { type: Schema.Types.Mixed, default: { enabled: false } },
    bloodCompatibility: { type: Schema.Types.Mixed, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const AppConfig = mongoose.model('AppConfig', appConfigSchema);