// BloodLink Backend - Controller: Hospital (Public Directory — §৭)
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const Hospital = require('../models/Hospital');
const { escapeRegex, buildPagination } = require('../utils/helpers');

// @route GET /hospitals (public)
const listHospitals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });
  const { division, district, search } = req.query;

  const filter = { isActive: true };
  if (division) filter.division = new RegExp(`^${escapeRegex(division)}$`, 'i');
  if (district) filter.district = new RegExp(`^${escapeRegex(district)}$`, 'i');
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');

  const [hospitals, total] = await Promise.all([
    Hospital.find(filter).sort({ isVerified: -1, name: 1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, {
    hospitals, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Hospitals fetched.'));
});

module.exports = { listHospitals };