// BloodLink Backend - Public Config Controller
const AppConfig = require('../models/AppConfig');
const DonorProfile = require('../models/DonorProfile');
const DonationHistory = require('../models/DonationHistory');
const BloodRequest = require('../models/BloodRequest');
const asyncHandler = require('../utils/asyncHandler');

// @desc   Public app config (safe fields only)
// @route  GET /api/v1/config
const getPublicConfig = asyncHandler(async (req, res) => {
  let config = null;
  try {
    config = await AppConfig.getConfig();
  } catch (e) {
    /* DB ধুমড়ে গেলেও defaults দেবো */
  }

  const c = config || {};
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'App config fetched.',
    data: {
      appName: c.appName || 'BloodLink',
      logoUrl: c.logoUrl || '',
      primaryColor: c.primaryColor || '#C62828',
      supportEmail: c.supportEmail || 'support@bloodlink.tech',
      maintenanceMode: !!c.maintenanceMode,
      featureFlags: c.featureFlags ? Object.fromEntries(c.featureFlags) : {},
      onboarding: c.onboarding || [],
    },
  });
});

// @desc   Public live statistics
// @route  GET /api/v1/config/stats
const getPublicStats = asyncHandler(async (req, res) => {
  const [donors, donations, requestsFulfilled] = await Promise.all([
    DonorProfile.countDocuments({}),
    DonationHistory.countDocuments({ status: 'confirmed' }),
    BloodRequest.countDocuments({ status: 'completed' }),
  ]);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Public stats fetched.',
    data: {
      totalDonors: donors,
      totalDonations: donations,
      livesImpacted: donations * 3,
      requestsFulfilled,
    },
  });
});

module.exports = { getPublicConfig, getPublicStats };