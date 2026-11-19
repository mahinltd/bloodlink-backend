// BloodLink Backend - Validator: Donor
const { body, query, param } = require('express-validator');
const { BLOOD_GROUPS } = require('../constants');

const AVAILABILITY = ['available', 'unavailable', 'recently_donated', 'paused'];

const updateDonorProfile = [
  body('bloodGroup').optional().isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  body('weightKg').optional().isFloat({ min: 30, max: 300 })
    .withMessage('Weight must be between 30 and 300 kg.'),
  body('medicalHistory').optional().trim().isLength({ max: 2000 })
    .withMessage('Medical history is too long (max 2000 characters).'),
  body('division').optional().trim().notEmpty().withMessage('Division cannot be empty.'),
  body('district').optional().trim().notEmpty().withMessage('District cannot be empty.'),
  body('upazila').optional().trim().notEmpty().withMessage('Upazila/Thana cannot be empty.'),
  body('union').optional().trim().isLength({ max: 100 }),
  body('village').optional().trim().isLength({ max: 100 }),
  body('lastDonationDate').optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('Last donation date must be a valid date (YYYY-MM-DD).').bail()
    .custom((value) => {
      if (new Date(value) > new Date()) throw new Error('Last donation date cannot be in the future.');
      return true;
    }),
  body('notificationPrefs.enabled').optional().isBoolean(),
  body('notificationPrefs.sos').optional().isBoolean(),
  body('notificationPrefs.urgent').optional().isBoolean(),
  body('notificationPrefs.regular').optional().isBoolean(),
  body('notificationPrefs.radiusKm').optional().isFloat({ min: 1, max: 500 })
    .withMessage('Notification radius must be 1–500 km.'),
];

const updateAvailability = [
  body('status').isIn(AVAILABILITY)
    .withMessage(`Status must be one of: ${AVAILABILITY.join(', ')}`),
];

const updateLocation = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.'),
];

const searchDonors = [
  query('bloodGroup').optional().isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  query('division').optional().trim().isLength({ max: 100 }),
  query('district').optional().trim().isLength({ max: 100 }),
  query('upazila').optional().trim().isLength({ max: 100 }),
  query('availability').optional().isIn(AVAILABILITY)
    .withMessage(`Availability must be one of: ${AVAILABILITY.join(', ')}`),
  query('verified').optional().isBoolean().withMessage('Verified must be true or false.'),
  query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.'),
  query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
  query('radiusKm').optional().isFloat({ min: 1, max: 500 }).withMessage('Radius must be 1–500 km.'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive number.'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1–50.'),
  query().custom((value) => {
    const hasLat = value.latitude !== undefined;
    const hasLng = value.longitude !== undefined;
    if (hasLat !== hasLng) throw new Error('latitude and longitude must be provided together.');
    return true;
  }),
];

const donorIdParam = [
  param('id').isMongoId().withMessage('Invalid donor ID.'),
];

module.exports = { updateDonorProfile, updateAvailability, updateLocation, searchDonors, donorIdParam };