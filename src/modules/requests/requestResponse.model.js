import mongoose from 'mongoose';
import { RESPONSE_STATUS } from '../../constants/index.js';

const { Schema } = mongoose;

const requestResponseSchema = new Schema(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RESPONSE_STATUS, required: true },
    respondedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

requestResponseSchema.index({ requestId: 1, donorId: 1 }, { unique: true });
requestResponseSchema.index({ donorId: 1, createdAt: -1 });

export const RequestResponse = mongoose.model('RequestResponse', requestResponseSchema);