// BloodLink Backend - Service: Notification Engine
const logger = require('../utils/logger');
const Notification = require('../models/Notification');
const NotificationJob = require('../models/NotificationJob');
const DonorResponse = require('../models/DonorResponse');
const fcmService = require('./fcm.service');
const emailService = require('./email.service');

// Urgency অনুযায়ী কতজন top donor email পাবে
const EMAIL_TOP_N = { sos: 5, urgent: 3, regular: 0 };

const REQUEST_NOTIFICATION_META = {
  sos: { type: 'sos_request', title: '🆘 SOS: Blood needed urgently!' },
  urgent: { type: 'urgent_request', title: '🔴 Urgent blood request near you' },
  regular: { type: 'regular_request', title: '🩸 Blood donation request' },
};

// ---------- Generic: একজন user-কে notify ----------
const notifyUser = async (userId, { type, title, body, data = {} }) => {
  try {
    await Notification.create({ user: userId, type, title, body, data });
    // Real-time bell update
    try {
      const { getIO } = require('../sockets');
      getIO().to(`user:${userId}`).emit('notification:new', { type, title, body, data });
    } catch { /* socket not initialized */ }
    await fcmService.sendPushToUser(userId, { title, body, data });
    return { sent: true };
  } catch (err) {
    logger.error(`notifyUser failed for ${userId}:`, err.message);
    return { sent: false, error: err.message };
  }
};

const notifyRequester = (request, payload) => notifyUser(request.requester, payload);

// ---------- Matching-এর ফলাফলে matched donor-দের notify ----------
const notifyMatchedDonors = async (request, scoredDonors, radiusKm) => {
  const meta = REQUEST_NOTIFICATION_META[request.urgency] || REQUEST_NOTIFICATION_META.regular;
  let notified = 0;
  let skipped = 0;

  for (const donor of scoredDonors) {
    const donorUserId = donor.user._id;

    // ⚡ Duplicate prevention
    try {
      await NotificationJob.create({
        request: request._id,
        donor: donorUserId,
        channel: 'fcm',
        priorityScore: donor.score,
        radiusKm,
      });
    } catch (err) {
      if (err.code === 11000) { skipped += 1; continue; } // আগেই পাঠানো হয়েছে
      throw err;
    }

    const distanceText = donor.distanceKm != null ? ` (~${donor.distanceKm} km away)` : '';
    const title = `${meta.title} ${request.bloodGroup}`;
    const body = `${request.numberOfBags} bag(s) needed at ${request.hospitalName}${distanceText}. Tap to respond.`;
    const data = {
      requestId: request._id,
      requestCode: request.requestId,
      urgency: request.urgency,
      bloodGroup: request.bloodGroup,
      screen: 'request_details',
    };

    await Notification.create({ user: donorUserId, type: meta.type, title, body, data });
    const pushResult = await fcmService.sendPushToUser(donorUserId, { title, body, data });

    if (!pushResult.sent && !pushResult.dev) {
      await NotificationJob.updateOne(
        { request: request._id, donor: donorUserId, channel: 'fcm' },
        { $set: { status: 'failed', error: pushResult.error || 'unknown' } }
      );
    }
    notified += 1;
  }

  // ---------- Top donor-দের Emergency Email ----------
  const topN = EMAIL_TOP_N[request.urgency] || 0;
  const emailTargets = scoredDonors.filter((d) => d.score >= 50).slice(0, topN);

  for (const donor of emailTargets) {
    try {
      await NotificationJob.create({
        request: request._id,
        donor: donor.user._id,
        channel: 'email',
        priorityScore: donor.score,
        radiusKm,
      });
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }

    const result = await emailService.sendEmergencyDonorAlert({
      to: donor.user.email,
      donorName: donor.user.fullName,
      request,
      distanceKm: donor.distanceKm,
    });

    if (!result.sent && !result.dev) {
      await NotificationJob.updateOne(
        { request: request._id, donor: donor.user._id, channel: 'email' },
        { $set: { status: 'failed', error: result.error || 'unknown' } }
      );
    }
  }

  logger.info(`Request ${request.requestId}: notified=${notified}, skipped(duplicate)=${skipped}, emailed=${emailTargets.length}`);
  return { notified, skipped };
};

// ---------- Request বন্ধ হলে interested donor-দের জানানো ----------
const notifyInterestedDonorsClosed = async (request, status) => {
  const responses = await DonorResponse.find({
    request: request._id,
    responseType: { $in: ['interested', 'contact_requester'] },
  }).lean();

  const messages = {
    blood_arranged: ['✅ Blood arranged', `Blood has been arranged for request ${request.requestId}. Thank you for your response!`],
    completed: ['🎉 Donation completed', `Request ${request.requestId} has been completed. Thank you for being a lifesaver!`],
    cancelled: ['❌ Request cancelled', `Request ${request.requestId} was cancelled by the requester.`],
  };

  const [title, body] = messages[status] || messages.cancelled;

  await Promise.all(
    responses
      .filter((r) => String(r.donor) !== String(request.requester))
      .map((r) =>
        notifyUser(r.donor, {
          type: 'system',
          title,
          body,
          data: { requestId: request._id, requestCode: request.requestId },
        })
      )
  );
};

module.exports = {
  notifyUser,
  notifyRequester,
  notifyMatchedDonors,
  notifyInterestedDonorsClosed,
};