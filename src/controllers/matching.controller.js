// BloodLink Backend - Controller: Matching
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const BloodRequest = require('../models/BloodRequest');
const matchingService = require('../services/matching.service');
const { REQUEST_STATUS } = require('../constants');

const ACTIVE = [REQUEST_STATUS.PENDING, REQUEST_STATUS.SEARCHING, REQUEST_STATUS.DONOR_RESPONDED];

// @route POST /matching/trigger/:requestId (requester only)
const triggerMatching = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.requestId);
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (String(request.requester) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the requester can trigger matching.');
  }
  if (!ACTIVE.includes(request.status)) {
    throw new ApiError(400, `Cannot run matching — request status is '${request.status}'.`);
  }

  // Duplicate safe: NotificationJob unique index আগে notify করা donor বাদ দেবে
  const totalMatched = await matchingService.startMatching(request._id);

  res.status(200).json(
    new ApiResponse(200, { totalMatched }, `Matching complete. ${totalMatched} new donor(s) notified.`)
  );
});

// @route GET /matching/preview/:requestId (requester only)
const previewMatches = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.requestId);
  if (!request) throw new ApiError(404, 'Blood request not found.');

  if (String(request.requester) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the requester can preview matched donors.');
  }

  const result = await matchingService.previewMatches(request);

  res.status(200).json(new ApiResponse(200, result, 'Matched donors preview fetched successfully.'));
});

module.exports = { triggerMatching, previewMatches };