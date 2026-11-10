import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { Donation } from '../requests/donation.model.js';
import { IdVerification } from '../users/idVerification.model.js';
import { BloodRequest } from '../requests/bloodRequest.model.js';
import { Report } from '../reports/report.model.js'; // ⚠️ path মিলিয়ে নিন
import { Conversation } from '../chat/conversation.model.js';
import { Message } from '../chat/message.model.js';

const DAY = 24 * 60 * 60 * 1000;

async function dailySeries(Model, days) {
  const start = new Date(Date.now() - days * DAY);
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ date: key, count: map[key] || 0 });
  }
  return out;
}

export async function getDashboardStats() {
  const d1 = new Date(Date.now() - DAY);
  const d7 = new Date(Date.now() - 7 * DAY);

  const [
    usersTotal, usersActive, usersSuspended, usersUnverified, usersNew24h, usersNew7d,
    donorsTotal, donorsAvailable, donorsVerified,
    requestsTotal, requestsOpen, requestsUrgentOpen, requestsFlagged, requestsHidden,
    reportsPending, idvPending, donationsTotal, conversationsTotal, messagesTotal,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'suspended' }),
    User.countDocuments({ status: 'unverified' }),
    User.countDocuments({ createdAt: { $gte: d1 } }),
    User.countDocuments({ createdAt: { $gte: d7 } }),
    DonorProfile.countDocuments({}),
    DonorProfile.countDocuments({ isAvailable: true }),
    DonorProfile.countDocuments({ idVerified: true }),
    BloodRequest.countDocuments({}),
    BloodRequest.countDocuments({ status: 'open' }),
    BloodRequest.countDocuments({ status: 'open', urgency: 'urgent' }),
    BloodRequest.countDocuments({ flagged: true }),
    BloodRequest.countDocuments({ isHidden: true }),
    Report.countDocuments({ status: 'pending' }),
    IdVerification.countDocuments({ status: 'pending' }),
    Donation.countDocuments({}),
    Conversation.countDocuments({}),
    Message.countDocuments({}),
  ]);

  const [usersChart, requestsChart, donationsChart] = await Promise.all([
    dailySeries(User, 14),
    dailySeries(BloodRequest, 14),
    dailySeries(Donation, 14),
  ]);

  return {
    users: { total: usersTotal, active: usersActive, suspended: usersSuspended, unverified: usersUnverified, new24h: usersNew24h, new7d: usersNew7d },
    donors: { total: donorsTotal, available: donorsAvailable, verified: donorsVerified },
    requests: { total: requestsTotal, open: requestsOpen, urgentOpen: requestsUrgentOpen, flagged: requestsFlagged, hidden: requestsHidden },
    reports: { pending: reportsPending },
    idVerifications: { pending: idvPending },
    donations: { total: donationsTotal },
    chat: { conversations: conversationsTotal, messages: messagesTotal },
    charts: { users: usersChart, requests: requestsChart, donations: donationsChart },
  };
}