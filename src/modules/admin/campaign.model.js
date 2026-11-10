import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    title: {
      bn: { type: String, required: true, maxlength: 200 },
      en: { type: String, required: true, maxlength: 200 },
    },
    body: {
      bn: { type: String, required: true, maxlength: 1000 },
      en: { type: String, required: true, maxlength: 1000 },
    },
    channel: { type: String, enum: ['urgent_requests', 'blood_requests', 'responses', 'messages', 'account', 'motivation', 'email'], default: 'account' },
    segment: {
      type: { type: String, enum: ['all', 'donors', 'bloodGroup', 'division', 'inactive'], default: 'all' },
      bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null], default: null },
      divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', default: null },
      inactiveDays: { type: Number, default: 30 }, // শুধু inactive segment-এর জন্য
    },
    status: { type: String, enum: ['draft', 'scheduled', 'sent', 'cancelled'], default: 'draft', index: true },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    stats: {
      targetCount: { type: Number, default: 0 },
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  },
  { timestamps: true }
);

export const Campaign = mongoose.model('Campaign', campaignSchema);