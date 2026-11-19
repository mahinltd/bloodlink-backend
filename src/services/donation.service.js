// BloodLink Backend - Service: Donation (Record + Cooldown + Badges)
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const DonorProfile = require('../models/DonorProfile');
const DonationHistory = require('../models/DonationHistory');
const notificationService = require('./notification.service');

// Milestone Badges — শুধুমাত্র confirmed donation count-এ (ডকুমেন্ট §৩.১২)
const MILESTONES = [
  { count: 1, badge: 'first_drop', name: 'First Drop', emoji: '🩸' },
  { count: 5, badge: 'life_saver', name: 'Life Saver', emoji: '🥉' },
  { count: 10, badge: 'hero', name: 'Blood Hero', emoji: '🥈' },
  { count: 25, badge: 'champion', name: 'Champion', emoji: '🥇' },
  { count: 50, badge: 'legend', name: 'Legend', emoji: '🏆' },
];

const cooldownMs = () => env.matching.donationCooldownDays * 24 * 60 * 60 * 1000;

// Donation → DonorProfile cooldown + count
const applyDonationToProfile = async (donorUserId, donationDate) => {
  const profile = await DonorProfile.findOne({ user: donorUserId });
  if (!profile) return null;

  const date = new Date(donationDate);

  // শুধু সর্বশেষ donation দিয়ে cooldown সেট — পুরোনো record backfill করলে cooldown নষ্ট হবে না
  if (!profile.lastDonationDate || date >= new Date(profile.lastDonationDate)) {
    profile.lastDonationDate = date;
    profile.nextEligibleDate = new Date(date.getTime() + cooldownMs());
    if (profile.availabilityStatus === 'available') {
      profile.availabilityStatus = 'recently_donated';
    }
  }

  profile.totalDonationCount += 1; // ইতিহাস হিসেবে count (§৩.১৩)
  await profile.save();
  return profile;
};

// Reject/Delete হলে count ও cooldown পূর্বাবস্থায়
const rollbackDonationFromProfile = async (donorUserId) => {
  const profile = await DonorProfile.findOne({ user: donorUserId });
  if (!profile) return;

  profile.totalDonationCount = Math.max(0, profile.totalDonationCount - 1);

  // সর্বশেষ বৈধ donation থেকে cooldown পুনর্গণনা
  const latest = await DonationHistory.findOne({
    donor: donorUserId,
    status: { $ne: 'rejected' },
  }).sort({ donationDate: -1 }).lean();

  if (latest) {
    profile.lastDonationDate = latest.donationDate;
    profile.nextEligibleDate = new Date(new Date(latest.donationDate).getTime() + cooldownMs());
    if (profile.nextEligibleDate <= new Date() && profile.availabilityStatus === 'recently_donated') {
      profile.availabilityStatus = 'available';
    }
  } else {
    // আর কোনো record নেই — registration-time তথ্য অজানা থাকায় cooldown clear
    profile.lastDonationDate = null;
    profile.nextEligibleDate = null;
  }

  await profile.save();
};

// মূল record function — auto (request completed) ও manual (donor log) উভয় path থেকে call হয়
const recordDonation = async ({
  donorUserId,
  recipientUserId = null,
  requestId = null,
  donationDate,
  hospitalName,
  hospitalAddress = '',
  units = 1,
  notes = '',
  status = 'self_reported',
  source = 'donor_log',
}) => {
  const profile = await DonorProfile.findOne({ user: donorUserId });
  if (!profile) throw new ApiError(404, 'Donor profile not found.');

  let donation;
  try {
    donation = await DonationHistory.create({
      donor: donorUserId,
      recipient: recipientUserId,
      request: requestId,
      bloodGroup: profile.bloodGroup,
      donationDate: new Date(donationDate),
      hospitalName,
      hospitalAddress,
      units,
      notes,
      status,
      source,
      confirmedAt: status === 'confirmed' ? new Date() : null,
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A donation record already exists for this request.');
    throw err;
  }

  await applyDonationToProfile(donorUserId, donation.donationDate);

  if (status === 'confirmed') {
    notificationService.notifyUser(donorUserId, {
      type: 'system',
      title: '🎉 Donation confirmed!',
      body: `Your blood donation at ${hospitalName} has been recorded. Thank you for saving a life! View your certificate in Donation History.`,
      data: { donationId: donation._id, screen: 'donation_history' },
    }).catch(() => {});
  }

  return donation;
};

// Badges — confirmed count-এর ভিত্তিতে
const computeBadges = async (donorUserId) => {
  const confirmedCount = await DonationHistory.countDocuments({ donor: donorUserId, status: 'confirmed' });

  const badges = MILESTONES.map((m) => ({ ...m, earned: confirmedCount >= m.count }));
  const nextMilestone = MILESTONES.find((m) => confirmedCount < m.count) || null;

  return {
    confirmedCount,
    badges,
    nextMilestone: nextMilestone
      ? { ...nextMilestone, remaining: nextMilestone.count - confirmedCount }
      : null,
  };
};

module.exports = { recordDonation, rollbackDonationFromProfile, computeBadges, MILESTONES };