import ApiError from '../../utils/ApiError.js';
import { Campaign } from './campaign.model.js';
import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { sendPushToUsers } from '../notifications/fcm.service.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderBrandedEmail } from '../notifications/emailTemplates.js';
import { buildUnsubscribeToken } from '../notifications/notifications.service.js';
import { env } from '../../config/env.js';
import { logAudit } from './admin.service.js';

const BATCH_SIZE = 500;
const EMAIL_BATCH_SIZE = 25;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character];
  });

const sendCampaignEmail = (user, campaign) => {
  const language = user.language === 'en' ? 'en' : 'bn';
  const token = buildUnsubscribeToken(user._id.toString());
  const unsubscribeUrl = `${env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const title = campaign.title[language] || campaign.title.bn;
  const body = campaign.body[language] || campaign.body.bn;

  return sendEmail({
    to: user.email,
    subject: title,
    html: renderBrandedEmail({
      content: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p><footer><a href="${unsubscribeUrl}">Unsubscribe from BloodLink emails</a></footer></main>`,
    }),
  });
};

async function getTargetUsers(segment) {
  let userIds = [];
  
  switch (segment.type) {
    case 'all':
      userIds = await User.find({ status: 'active', emailVerifiedAt: { $ne: null } }).distinct('_id');
      break;
      
    case 'donors':
      userIds = await DonorProfile.find({ isAvailable: true }).distinct('userId');
      break;
      
    case 'bloodGroup':
      userIds = await DonorProfile.find({ bloodGroup: segment.bloodGroup, isAvailable: true }).distinct('userId');
      break;
      
    case 'division':
      userIds = await DonorProfile.find({ divisionId: segment.divisionId, isAvailable: true }).distinct('userId');
      break;
      
    case 'inactive':
      const cutoff = new Date(Date.now() - (segment.inactiveDays || 30) * 24 * 60 * 60 * 1000);
      const inactiveUsers = await User.find({ 
        status: 'active', 
        lastSeen: { $lt: cutoff } 
      }).distinct('_id');
      userIds = inactiveUsers;
      break;
  }
  
  return userIds;
}

export async function createCampaign(data, adminId, req) {
  const campaign = await Campaign.create({ ...data, createdBy: adminId });
  await logAudit({ adminId, action: 'admin.campaign_create', targetType: 'campaign', targetId: campaign._id, meta: { name: campaign.name }, req });
  return campaign;
}

export async function listCampaigns({ page = 1, limit = 20, status }) {
  const filter = status ? { status } : {};
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Campaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('createdBy', 'email name').lean(),
    Campaign.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export async function sendCampaign(id, adminId, req) {
  const campaign = await Campaign.findById(id);
  if (!campaign) throw ApiError.notFound('Campaign not found');
  if (campaign.status === 'sent') throw ApiError.badRequest('Already sent');

  const userIds = await getTargetUsers(campaign.segment);
  const candidateUsers = userIds.length
    ? await User.find({ _id: { $in: userIds }, status: 'active', emailVerifiedAt: { $ne: null } })
        .select('email language notificationPrefs')
        .lean()
    : [];
  const prefKeyByChannel = {
    urgent_requests: 'urgentRequests',
    blood_requests: 'normalRequests',
    responses: 'responses',
    messages: 'messages',
    motivation: 'motivation',
  };
  const prefKey = prefKeyByChannel[campaign.channel];
  const targetUsers = candidateUsers.filter((user) => {
    const prefs = user.notificationPrefs || {};
    if (campaign.channel === 'email') return prefs.email !== false && prefs.motivation !== false;
    return prefs.push !== false && (!prefKey || prefs[prefKey] !== false);
  });
  campaign.stats.targetCount = targetUsers.length;
  
  if (targetUsers.length === 0) {
    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await campaign.save();
    return { sent: 0, message: 'No target users found' };
  }

  // Batch processing
  let sentCount = 0;
  let failedCount = 0;
  
  const batchSize = campaign.channel === 'email' ? EMAIL_BATCH_SIZE : BATCH_SIZE;
  for (let i = 0; i < targetUsers.length; i += batchSize) {
    const batchUsers = targetUsers.slice(i, i + batchSize);
    try {
      if (campaign.channel === 'email') {
        const results = await Promise.allSettled(batchUsers.map((user) => sendCampaignEmail(user, campaign)));
        sentCount += results.filter((result) => result.status === 'fulfilled').length;
        failedCount += results.filter((result) => result.status === 'rejected').length;
      } else {
        const result = await sendPushToUsers(batchUsers.map((user) => user._id), {
          type: 'campaign',
          channel: campaign.channel,
          title: { bn: campaign.title.bn, en: campaign.title.en },
          body: { bn: campaign.body.bn, en: campaign.body.en },
          data: { campaignId: campaign._id.toString() },
        });
        const batchSent = Math.min(result.sent || 0, batchUsers.length);
        sentCount += batchSent;
        failedCount += batchUsers.length - batchSent;
      }
    } catch (e) {
      failedCount += batchUsers.length;
    }
  }

  campaign.status = 'sent';
  campaign.sentAt = new Date();
  campaign.stats.sentCount = sentCount;
  campaign.stats.failedCount = failedCount;
  await campaign.save();

  await logAudit({ adminId, action: 'admin.campaign_send', targetType: 'campaign', targetId: id, meta: { sent: sentCount, failed: failedCount }, req });
  return { sent: sentCount, failed: failedCount };
}

export async function scheduleCampaign(id, scheduledAt, adminId, req) {
  const campaign = await Campaign.findById(id);
  if (!campaign) throw ApiError.notFound('Campaign not found');
  if (campaign.status === 'sent') throw ApiError.badRequest('Already sent');

  campaign.status = 'scheduled';
  campaign.scheduledAt = new Date(scheduledAt);
  await campaign.save();

  await logAudit({ adminId, action: 'admin.campaign_schedule', targetType: 'campaign', targetId: id, meta: { scheduledAt }, req });
  return campaign;
}