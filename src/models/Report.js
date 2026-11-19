// BloodLink Backend - Model: Report (User-side submission; Admin review পরের Phase-এ)
const mongoose = require('mongoose');

const REPORT_CATEGORIES = [
  'fake_request', 'fake_donor', 'commercial_selling',
  'harassment', 'abuse', 'suspicious', 'other',
];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    requestRef: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', default: null },
    category: { type: String, enum: REPORT_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['pending', 'reviewing', 'resolved', 'dismissed'], default: 'pending', index: true },
    adminNotes: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

const Report = mongoose.model('Report', reportSchema);
Report.REPORT_CATEGORIES = REPORT_CATEGORIES;

module.exports = Report;