// BloodLink Backend - Controller: App Version (§১৪ — APK Auto Update)
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const AppConfig = require('../models/AppConfig');

// @route GET /app-version (public — app launch-এ check হয়)
const getAppVersion = asyncHandler(async (req, res) => {
  const config = await AppConfig.getConfig();
  const v = config.appVersion;

  res.status(200).json(new ApiResponse(200, {
    latestVersion: v.latestVersion,
    latestVersionCode: v.latestVersionCode,
    minimumSupportedVersionCode: v.minimumSupportedVersionCode,
    forceUpdate: v.forceUpdate,
    apkUrl: v.apkUrl,
    releaseNotes: v.releaseNotes,
    fileSizeMB: v.fileSizeMB,
    sha256: v.sha256,
  }, 'App version info fetched.'));
});

module.exports = { getAppVersion };
