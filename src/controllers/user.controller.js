// BloodLink Backend - Controller: User
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const env = require('../config/env');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const Block = require('../models/Block');
const mongoose = require('mongoose');
const tokenService = require('../services/token.service');
const storageService = require('../services/storage.service');

// @route GET /users/me
const getMyProfile = asyncHandler(async (req, res) => {
  const donorProfile = req.user.role === 'donor'
    ? await DonorProfile.findOne({ user: req.user._id })
    : null;

  res.status(200).json(
    new ApiResponse(200, { user: req.user.toJSON(), donorProfile }, 'Profile fetched successfully.')
  );
});

// @route PATCH /users/me
const updateMyProfile = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;
  const user = req.user;

  if (phone && phone !== user.phone) {
    const exists = await User.findOne({ phone, _id: { $ne: user._id } }).lean();
    if (exists) throw new ApiError(409, 'This phone number is already in use.');
    user.phone = phone;
  }
  if (fullName) user.fullName = fullName;

  await user.save();

  res.status(200).json(new ApiResponse(200, { user: user.toJSON() }, 'Profile updated successfully.'));
});

// @route POST /users/me/avatar
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please attach an image file (field name: avatar).');

  const result = await storageService.uploadImage(req.file.buffer, {
    folder: 'bloodlink/avatars',
    publicId: `avatar_${req.user._id}`, // deterministic → পুরোনোটা auto-overwrite
  });

  req.user.avatar = { url: result.secure_url, publicId: result.public_id };
  await req.user.save();

  res.status(200).json(new ApiResponse(200, { avatar: req.user.avatar }, 'Avatar updated successfully.'));
});

// @route DELETE /users/me/avatar
const removeAvatar = asyncHandler(async (req, res) => {
  if (req.user.avatar.publicId) await storageService.deleteImage(req.user.avatar.publicId);
  req.user.avatar = { url: '', publicId: '' };
  await req.user.save();

  res.status(200).json(new ApiResponse(200, null, 'Avatar removed successfully.'));
});

// @route POST /users/me/fcm-token
const registerFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = 'android' } = req.body;
  const user = req.user;

  // একই token অন্য user-এ থাকলে সরিয়ে দাও (shared device)
  await User.updateMany({ _id: { $ne: user._id } }, { $pull: { fcmTokens: { token } } });

  const existing = user.fcmTokens.find((t) => t.token === token);
  if (existing) {
    existing.lastUsedAt = new Date();
    existing.platform = platform;
  } else {
    user.fcmTokens.push({ token, platform });
    // User-এ প্রতি user সর্বোচ্চ ৫টি device
    if (user.fcmTokens.length > 5) {
      user.fcmTokens = [...user.fcmTokens]
        .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
        .slice(0, 5);
    }
  }

  await user.save();

  res.status(200).json(new ApiResponse(200, null, 'Device registered for notifications.'));
});

// @route DELETE /users/me/fcm-token
const removeFcmToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  req.user.fcmTokens = req.user.fcmTokens.filter((t) => t.token !== token);
  await req.user.save();

  res.status(200).json(new ApiResponse(200, null, 'Device removed from notifications.'));
});

// @route POST /users/me/convert-to-donor
const convertToDonor = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.role === 'donor') throw new ApiError(400, 'Your account is already a donor account.');

  const {
    bloodGroup, gender, weightKg, dateOfBirth,
    division, district, upazila, union, village,
    lastDonationDate, medicalHistory, totalDonationCount,
  } = req.body;

  let donorProfile = await DonorProfile.findOne({ user: user._id });
  if (!donorProfile) {
    let nextEligibleDate = null;
    let availabilityStatus = 'available';
    if (lastDonationDate) {
      nextEligibleDate = new Date(
        new Date(lastDonationDate).getTime() + env.matching.donationCooldownDays * 24 * 60 * 60 * 1000
      );
      if (nextEligibleDate > new Date()) availabilityStatus = 'recently_donated';
    }

    donorProfile = await DonorProfile.create({
      user: user._id,
      bloodGroup,
      gender,
      weightKg: Number(weightKg),
      dateOfBirth,
      address: { division, district, upazila, union: union || '', village: village || '' },
      lastDonationDate: lastDonationDate || null,
      nextEligibleDate,
      medicalHistory: medicalHistory || '',
      totalDonationCount: Number(totalDonationCount) || 0,
      availabilityStatus,
    });
  }

  user.role = 'donor';
  await user.save();

  res.status(200).json(
    new ApiResponse(200, { user: user.toJSON(), donorProfile }, 'Congratulations! You are now registered as a donor.')
  );
});

// @route DELETE /users/me
const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(password))) throw new ApiError(400, 'Incorrect password.');

  if (user.avatar.publicId) await storageService.deleteImage(user.avatar.publicId);

  // Soft delete + email/phone free করে দাও (যাতে পুনরায় register করা যায়)
  user.accountStatus = 'deleted';
  user.email = `deleted_${Date.now()}_${user.email}`;
  user.phone = `deleted_${Date.now()}_${user.phone}`;
  user.fcmTokens = [];
  user.avatar = { url: '', publicId: '' };
  await user.save();

  await tokenService.revokeAllUserTokens(user._id);
  await DonorProfile.updateOne({ user: user._id }, { $set: { availabilityStatus: 'unavailable' } });

  res.status(200).json(new ApiResponse(200, null, 'Your account has been deleted. We are sorry to see you go.'));
});

// @route POST /users/:id/block
const blockUser = asyncHandler(async (req, res) => {
  const targetId = req.params.id;

  if (!mongoose.isValidObjectId(targetId)) throw new ApiError(400, 'Invalid user ID.');
  if (String(targetId) === String(req.user._id)) throw new ApiError(400, 'You cannot block yourself.');

  const target = await User.findById(targetId).select('_id');
  if (!target) throw new ApiError(404, 'User not found.');

  try {
    await Block.create({ blocker: req.user._id, blocked: targetId });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  res.status(200).json(new ApiResponse(200, null, 'User blocked. They can no longer message you.'));
});

// @route DELETE /users/:id/block
const unblockUser = asyncHandler(async (req, res) => {
  await Block.deleteOne({ blocker: req.user._id, blocked: req.params.id });
  res.status(200).json(new ApiResponse(200, null, 'User unblocked.'));
});

// @route GET /users/me/blocked
const getBlockedUsers = asyncHandler(async (req, res) => {
  const blocks = await Block.find({ blocker: req.user._id })
    .populate('blocked', 'fullName avatar isVerified')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(new ApiResponse(200, { blocked: blocks.map((b) => b.blocked) }, 'Blocked users fetched.'));
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  removeAvatar,
  registerFcmToken,
  removeFcmToken,
  convertToDonor,
  deleteAccount,
  blockUser,
  unblockUser,
  getBlockedUsers,
};