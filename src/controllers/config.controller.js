// BloodLink Backend - Controller: Public Config (App Remote Config + Website Stats)
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const AppConfig = require('../models/AppConfig');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const BloodRequest = require('../models/BloodRequest');

// @route GET /config (public — app launch-এ fetch হয়, §৩.১)
const getPublicConfig = asyncHandler(async (req, res) => {
  const config = await AppConfig.getConfig();

  // শুধু public-safe fields expose করা হয়
  res.status(200).json(new ApiResponse(200, {
    appName: config.appName,
    logoUrl: config.logoUrl,
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    supportEmail: config.supportEmail,
    maintenanceMode: config.maintenanceMode,
    maintenanceMessage: config.maintenanceMessage,
    featureFlags: config.featureFlags,
    onboarding: config.onboarding,
  }, 'App config fetched.'));
});

// @route GET /config/stats (public — Website Statistics Page, §৭)
const getPublicStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalDonors, bloodGroupDist, activeRequests, completedRequests] = await Promise.all([
    User.countDocuments({ accountStatus: 'active' }),
    User.countDocuments({ role: 'donor', accountStatus: 'active' }),
    DonorProfile.aggregate([{ $group: { _id: '$bloodGroup', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    BloodRequest.countDocuments({ status: { $in: ['pending', 'searching_donors', 'donor_responded'] } }),
    BloodRequest.countDocuments({ status: 'completed' }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    totalUsers, totalDonors, activeRequests, completedRequests,
    bloodGroupDistribution: bloodGroupDist,
  }, 'Public statistics fetched.'));
});

module.exports = { getPublicConfig, getPublicStats };