import mongoose from 'mongoose';

const { Schema } = mongoose;

const donationSchema = new Schema(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', default: null },
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

donationSchema.index({ donorId: 1, date: -1 });
donationSchema.index(
  { requestId: 1, donorId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'objectId' } } }
);

export const Donation = mongoose.model('Donation', donationSchema);