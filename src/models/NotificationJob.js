// BloodLink Backend - Model: NotificationJob (Delivery Tracking + Duplicate Prevention)
const mongoose = require('mongoose');

const notificationJobSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true, index: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['fcm', 'email'], required: true },
    status: { type: String, enum: ['sent', 'failed', 'skipped'], default: 'sent' },
    priorityScore: { type: Number, default: 0 },
    radiusKm: { type: Number, default: 0 },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

// ⚡ একই Request-এ একই Donor-কে একই channel-এ দুইবার notification যাবে না
notificationJobSchema.index({ request: 1, donor: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);