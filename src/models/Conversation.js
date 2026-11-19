// BloodLink Backend - Model: Conversation
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ],

    // Contact Requester action থেকে তৈরি হলে request-এর reference
    requestRef: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', default: null },

    lastMessage: {
      text: { type: String, default: '' },
      type: { type: String, default: 'text' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date },
    },

    // { "<userId>": unreadCount }
    unreadCounts: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'lastMessage.createdAt': -1 });

module.exports = mongoose.model('Conversation', conversationSchema);