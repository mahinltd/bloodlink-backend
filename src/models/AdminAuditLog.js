// BloodLink Backend - Model: AdminAuditLog (§৬.৮ — সব গুরুত্বপূর্ণ Admin Action)
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    action: { type: String, required: true, index: true }, // verification.approved, user.banned, ...
    targetType: { type: String, default: '' },              // user | request | verification | config
    targetId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', auditLogSchema);