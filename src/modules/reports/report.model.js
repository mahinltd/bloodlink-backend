import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['request', 'user', 'message'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending', index: true },
    handledBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    resolvedBy: { type: Schema.Types.ObjectId, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Report = mongoose.model('Report', reportSchema);