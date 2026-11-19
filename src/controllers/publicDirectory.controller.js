// BloodLink Backend - Public Directory Controller (Hospitals + Blood Banks)
const Hospital = require('../models/Hospital');
const BloodBank = require('../models/BloodBank');
const asyncHandler = require('../utils/asyncHandler');

// @desc   Public hospital list
// @route  GET /api/v1/hospitals?division=&district=&search=&page=&limit=
const listHospitals = asyncHandler(async (req, res) => {
  const { division, district, search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);

  const filter = { isActive: { $ne: false } };
  if (division) filter.division = division;
  if (district) filter.district = district;
  if (search) filter.name = { $regex: search.trim(), $options: 'i' };

  const [items, total] = await Promise.all([
    Hospital.find(filter)
      .sort({ isVerified: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Hospital.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Hospitals fetched.',
    data: {
      hospitals: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

// @desc   Public blood bank list
// @route  GET /api/v1/blood-banks?division=&district=&bloodGroup=&search=&page=&limit=
const listBloodBanks = asyncHandler(async (req, res) => {
  const { division, district, bloodGroup, search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);

  const filter = { isActive: { $ne: false } };
  if (division) filter.division = division;
  if (district) filter.district = district;
  if (bloodGroup) filter.availableGroups = bloodGroup;
  if (search) filter.name = { $regex: search.trim(), $options: 'i' };

  const [items, total] = await Promise.all([
    BloodBank.find(filter)
      .sort({ isVerified: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BloodBank.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Blood banks fetched.',
    data: {
      bloodBanks: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

module.exports = { listHospitals, listBloodBanks };