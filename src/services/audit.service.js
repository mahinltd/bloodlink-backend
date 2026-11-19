// BloodLink Backend - Service: Admin Audit Log
const AdminAuditLog = require('../models/AdminAuditLog');
const logger = require('../utils/logger');

const log = (adminId, action, { targetType = '', targetId = '', details = {}, ip = '' } = {}) =>
  AdminAuditLog.create({ admin: adminId, action, targetType, targetId: String(targetId), details, ip })
    .catch((err) => logger.error('Audit log failed:', err.message)); // non-blocking

module.exports = { log };