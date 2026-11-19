// BloodLink Backend - Controller: BloodBank (Public Directory — §৭)
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const BloodBank = require('../models/BloodBank');
const { escapeRegex, buildPagination } = require('../utils/helpers');

// @route GET /blood-banks (public)
const listBloodBanks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });
  const { division, district, search, bloodGroup } = req.query;

  const filter = { isActive: true };
  if (division) filter.division = new RegExp(`^${escapeRegex(division)}$`, 'i');
  if (district) filter.district = new RegExp(`^${escapeRegex(district)}$`, 'i');
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');
  if (bloodGroup) filter.availableGroups = bloodGroup;

  const [bloodBanks, total] = await Promise.all([
    BloodBank.find(filter).sort({ isVerified: -1, name: 1 }).skip(skip).limit(limit).lean(),
    BloodBank.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, {
    bloodBanks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Blood banks fetched.'));
});

module.exports = { listBloodBanks };