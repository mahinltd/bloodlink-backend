// BloodLink Backend - Controller: Report (User-side)
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const Report = require('../models/Report');

// @route POST /reports
const createReport = asyncHandler(async (req, res) => {
  const { reportedUser, requestRef, category, description } = req.body;

  if (!reportedUser && !requestRef) {
    throw new ApiError(400, 'A report must reference a user or a blood request.');
  }

  const report = await Report.create({
    reporter: req.user._id,
    reportedUser: reportedUser || null,
    requestRef: requestRef || null,
    category,
    description,
  });

  res.status(201).json(
    new ApiResponse(201, { reportId: report._id }, 'Report submitted. Our team will review it shortly.')
  );
});

// @route GET /reports/my
const getMyReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ reporter: req.user._id })
    .select('category description status createdAt reportedUser requestRef')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(new ApiResponse(200, { reports }, 'Your reports fetched successfully.'));
});

module.exports = { createReport, getMyReports };