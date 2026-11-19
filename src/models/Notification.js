// BloodLink Backend - Model: Notification (In-App History)
const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'sos_request', 'urgent_request', 'regular_request',
  'donor_response', 'new_message',
  'verification_approved', 'verification_rejected',
  'donation_reminder', 'security_alert', 'app_update', 'system',
];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, maxlength: 150 },
    body: { type: String, required: true, maxlength: 500 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }, // deep link info: { requestId, screen, ... }
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
Notification.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

module.exports = Notification;