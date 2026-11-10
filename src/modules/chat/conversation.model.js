import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    participantsKey: { type: String, required: true, unique: true }, // sorted "id1_id2" — এক জুড়িতে একটাই কনভার্সেশন
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', default: null },
    lastMessage: {
      text: { type: String, default: '' },
      imageUrl: { type: String, default: null },
      senderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null },
    },
    unreadCounts: { type: Map, of: Number, default: {} }, // userId -> আনরিড সংখ্যা
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);