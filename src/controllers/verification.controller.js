// BloodLink Backend - Controller: NID Verification (User-side)
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const VerificationRequest = require('../models/VerificationRequest');
const storageService = require('../services/storage.service');

// @route POST /verification/submit
const submitVerification = asyncHandler(async (req, res) => {
  if (req.user.isVerified) throw new ApiError(400, 'Your account is already verified.');

  const existingPending = await VerificationRequest.findOne({ user: req.user._id, status: 'pending' }).lean();
  if (existingPending) throw new ApiError(409, 'You already have a pending verification request. Please wait for review.');

  const files = req.files || {};
  if (!files.nid || !files.nid[0]) throw new ApiError(400, 'NID card photo is required (field name: nid).');
  if (!files.selfie || !files.selfie[0]) throw new ApiError(400, 'Selfie photo is required (field name: selfie).');

  // 🔒 Private upload (authenticated delivery — public URL কাজ করবে না)
  const stamp = Date.now();
  const [nidResult, selfieResult] = await Promise.all([
    storageService.uploadPrivateImage(files.nid[0].buffer, {
      folder: 'bloodlink/verification',
      publicId: `nid_${req.user._id}_${stamp}`,
    }),
    storageService.uploadPrivateImage(files.selfie[0].buffer, {
      folder: 'bloodlink/verification',
      publicId: `selfie_${req.user._id}_${stamp}`,
    }),
  ]);

  try {
    const verification = await VerificationRequest.create({
      user: req.user._id,
      nidImage: { publicId: nidResult.public_id, version: String(nidResult.version), format: nidResult.format },
      selfieImage: { publicId: selfieResult.public_id, version: String(selfieResult.version), format: selfieResult.format },
      nidNumber: req.body.nidNumber || '',
      fullNameAsPerNid: req.body.fullNameAsPerNid || '',
      nidDateOfBirth: req.body.nidDateOfBirth || '',
    });

    res.status(201).json(
      new ApiResponse(201, { verificationId: verification._id, status: 'pending' },
        'Verification submitted. Our team will review it shortly.')
    );
  } catch (err) {
    // Upload succeeded but DB failed → uploaded files পরিষ্কার
    await Promise.all([
      storageService.deletePrivateImage(nidResult.public_id),
      storageService.deletePrivateImage(selfieResult.public_id),
    ]);
    throw err;
  }
});

// @route GET /verification/my
const getMyVerification = asyncHandler(async (req, res) => {
  const latest = await VerificationRequest.findOne({ user: req.user._id })
    .select('status reviewReason createdAt reviewedAt')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(
    new ApiResponse(200, {
      isVerified: req.user.isVerified,
      verification: latest || null,
      // App-কে বলে দেয় camera capture লাগবে, gallery নয় (§৫)
      captureMethod: 'in_app_camera_only',
    }, 'Verification status fetched.')
  );
});

module.exports = { submitVerification, getMyVerification };