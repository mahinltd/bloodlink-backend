// BloodLink Backend - Controller: Donor
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const env = require('../config/env');
const DonorProfile = require('../models/DonorProfile');
const { escapeRegex, buildPagination } = require('../utils/helpers');

const isEligibleNow = (donor) =>
  !donor.nextEligibleDate || new Date(donor.nextEligibleDate) <= new Date();

// @route GET /donors/me
const getMyDonorProfile = asyncHandler(async (req, res) => {
  res.status(200).json(
    new ApiResponse(
      200,
      { donorProfile: req.donorProfile, isEligibleNow: isEligibleNow(req.donorProfile) },
      'Donor profile fetched successfully.'
    )
  );
});

// @route PATCH /donors/me
const updateDonorProfile = asyncHandler(async (req, res) => {
  const donor = req.donorProfile;
  const {
    bloodGroup, weightKg, medicalHistory,
    division, district, upazila, union, village,
    lastDonationDate, notificationPrefs,
  } = req.body;

  if (bloodGroup) donor.bloodGroup = bloodGroup;
  if (weightKg) donor.weightKg = Number(weightKg);
  if (medicalHistory !== undefined) donor.medicalHistory = medicalHistory;
  if (division) donor.address.division = division;
  if (district) donor.address.district = district;
  if (upazila) donor.address.upazila = upazila;
  if (union !== undefined) donor.address.union = union;
  if (village !== undefined) donor.address.village = village;

  if (lastDonationDate) {
    donor.lastDonationDate = new Date(lastDonationDate);
    donor.nextEligibleDate = new Date(
      donor.lastDonationDate.getTime() + env.matching.donationCooldownDays * 24 * 60 * 60 * 1000
    );
    // Cooldown-এ চলে গেলে availability auto-adjust
    if (donor.nextEligibleDate > new Date() && donor.availabilityStatus === 'available') {
      donor.availabilityStatus = 'recently_donated';
    }
  }

  if (notificationPrefs) {
    donor.notificationPrefs = {
      ...donor.notificationPrefs.toObject(),
      ...notificationPrefs,
    };
  }

  await donor.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { donorProfile: donor, isEligibleNow: isEligibleNow(donor) },
      'Donor profile updated successfully.'
    )
  );
});

// @route PUT /donors/me/availability
const updateAvailability = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const donor = req.donorProfile;

  if (status === 'available') {
    if (!isEligibleNow(donor)) {
      throw new ApiError(
        400,
        `You are in donation cooldown until ${donor.nextEligibleDate.toDateString()}. You can become available after this date.`
      );
    }
    donor.availabilityStatus = 'available';
  } else if (status === 'recently_donated') {
    const donatedAt = donor.lastDonationDate || new Date();
    donor.lastDonationDate = donatedAt;
    donor.nextEligibleDate = new Date(
      donatedAt.getTime() + env.matching.donationCooldownDays * 24 * 60 * 60 * 1000
    );
    donor.availabilityStatus = 'recently_donated';
  } else {
    donor.availabilityStatus = status; // unavailable | paused
  }

  await donor.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { availabilityStatus: donor.availabilityStatus, nextEligibleDate: donor.nextEligibleDate },
      'Availability updated successfully.'
    )
  );
});

// @route PUT /donors/me/location
const updateLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  // GeoJSON: [longitude, latitude] — ক্রম গুরুত্বপূর্ণ!
  req.donorProfile.location = {
    type: 'Point',
    coordinates: [Number(longitude), Number(latitude)],
  };
  await req.donorProfile.save();

  res.status(200).json(new ApiResponse(200, { location: req.donorProfile.location }, 'Location updated successfully.'));
});

// @route GET /donors/search
const searchDonors = asyncHandler(async (req, res) => {
  const { bloodGroup, division, district, upazila, availability, verified, latitude, longitude, radiusKm } = req.query;
  const { page, limit, skip } = buildPagination(req.query, { limit: 20, maxLimit: 50 });

  const match = {};
  if (bloodGroup) match.bloodGroup = bloodGroup;
  if (division) match['address.division'] = new RegExp(`^${escapeRegex(division)}$`, 'i');
  if (district) match['address.district'] = new RegExp(`^${escapeRegex(district)}$`, 'i');
  if (upazila) match['address.upazila'] = new RegExp(`^${escapeRegex(upazila)}$`, 'i');
  if (availability) match.availabilityStatus = availability;

  const hasGeo = latitude !== undefined && longitude !== undefined;
  const pipeline = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
        distanceField: 'distanceMeters',
        maxDistance: Math.min(Number(radiusKm) || 50, 500) * 1000,
        spherical: true,
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $match: {
        'user.accountStatus': 'active',
        ...(verified === 'true' ? { 'user.isVerified': true } : {}),
      },
    }
  );

  const project = {
    bloodGroup: 1,
    gender: 1,
    availabilityStatus: 1,
    totalDonationCount: 1,
    lastDonationDate: 1,
    nextEligibleDate: 1,
    address: 1,
    createdAt: 1,
    'user._id': 1,
    'user.fullName': 1,
    'user.avatar': 1,
    'user.isVerified': 1,
    'user.phone': 1,
  };
  if (hasGeo) project.distanceKm = { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] };

  const dataPipeline = [
    ...pipeline,
    { $sort: hasGeo ? { distanceMeters: 1 } : { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: project },
  ];

  const [donors, countResult] = await Promise.all([
    DonorProfile.aggregate(dataPipeline),
    DonorProfile.aggregate([...pipeline, { $count: 'total' }]),
  ]);

  const total = countResult[0] ? countResult[0].total : 0;

  const sanitized = donors.map((d) => ({
    ...d,
    isEligibleNow: !d.nextEligibleDate || new Date(d.nextEligibleDate) <= new Date(),
    // Privacy: শুধু available donor-এর phone দেখানো হবে
    user: { ...d.user, phone: d.availabilityStatus === 'available' ? d.user.phone : undefined },
    nextEligibleDate: undefined,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      { donors: sanitized, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      'Donors fetched successfully.'
    )
  );
});

// @route GET /donors/:id
const getDonorById = asyncHandler(async (req, res) => {
  const donor = await DonorProfile.findById(req.params.id).populate({
    path: 'user',
    select: 'fullName avatar isVerified phone accountStatus createdAt',
  });

  if (!donor || !donor.user || donor.user.accountStatus !== 'active') {
    throw new ApiError(404, 'Donor not found.');
  }

  const data = donor.toJSON();
  data.isEligibleNow = isEligibleNow(donor);
  delete data.nextEligibleDate;
  delete data.medicalHistory; // গোপনীয় তথ্য
  if (donor.availabilityStatus !== 'available') delete data.user.phone;

  res.status(200).json(new ApiResponse(200, { donor: data }, 'Donor fetched successfully.'));
});

module.exports = {
  getMyDonorProfile,
  updateDonorProfile,
  updateAvailability,
  updateLocation,
  searchDonors,
  getDonorById,
};