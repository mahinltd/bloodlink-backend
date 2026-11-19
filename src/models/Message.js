// BloodLink Backend - Model: Message
const mongoose = require('mongoose');

const MESSAGE_TYPES = ['text', 'image', 'voice', 'location'];

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: MESSAGE_TYPES, required: true },

    text: { type: String, trim: true, maxlength: 2000, default: '' },

    mediaUrl: { type: String, default: '' },
    durationSec: { type: Number, default: null }, // voice message length

    location: {
      latitude: { type: Number },
      longitude: { type: Number },
    },

    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
Message.MESSAGE_TYPES = MESSAGE_TYPES;

module.exports = Message;