// BloodLink Backend - Validator: Blood Request
const { body, param, query } = require('express-validator');
const { BLOOD_GROUPS, URGENCY_LEVEL_LIST, REQUEST_STATUS_LIST } = require('../constants');

const VALID_STATUSES = REQUEST_STATUS_LIST;

const createRequest = [
  body('patientName').trim().notEmpty().withMessage('Patient name is required.').bail()
    .isLength({ min: 3, max: 100 }).withMessage('Patient name must be 3–100 characters.'),

  body('bloodGroup').isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),

  body('medicalProblem').trim().notEmpty().withMessage('Medical problem is required.').bail()
    .isLength({ max: 500 }).withMessage('Medical problem is too long (max 500 characters).'),

  body('hospitalName').trim().notEmpty().withMessage('Hospital name is required.').bail()
    .isLength({ max: 200 }).withMessage('Hospital name is too long.'),

  body('hospitalAddress').trim().notEmpty().withMessage('Hospital address is required.').bail()
    .isLength({ max: 500 }).withMessage('Hospital address is too long.'),

  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
  body().custom((value) => {
    const hasLat = value.latitude !== undefined;
    const hasLng = value.longitude !== undefined;
    if (hasLat !== hasLng) throw new Error('latitude and longitude must be provided together.');
    return true;
  }),

  body('numberOfBags').isInt({ min: 1, max: 10 }).withMessage('Number of bags must be 1–10.'),

  body('urgency').isIn(URGENCY_LEVEL_LIST)
    .withMessage(`Urgency must be one of: ${URGENCY_LEVEL_LIST.join(', ')}`),

  body('requiredDate').isISO8601().withMessage('Required date must be valid (YYYY-MM-DD).').bail()
    .custom((value) => {
      const today = new Date().toISOString().slice(0, 10);
      if (value < today) throw new Error('Required date cannot be in the past.');
      return true;
    }),

  body('requiredTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('Required time must be in HH:mm format (e.g. 14:30).'),

  body('contactNumber').matches(/^01[3-9]\d{8}$/)
    .withMessage('Enter a valid Bangladeshi mobile number (e.g. 01712345678).'),

  body('additionalNotes').optional().trim().isLength({ max: 1000 })
    .withMessage('Additional notes is too long (max 1000 characters).'),
];

const requestIdParam = [
  param('id').isMongoId().withMessage('Invalid request ID.'),
];

const feedQuery = [
  query('bloodGroup').optional().isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  query('urgency').optional().isIn(URGENCY_LEVEL_LIST)
    .withMessage(`Urgency must be one of: ${URGENCY_LEVEL_LIST.join(', ')}`),
  query('latitude').optional().isFloat({ min: -90, max: 90 }),
  query('longitude').optional().isFloat({ min: -180, max: 180 }),
  query('radiusKm').optional().isFloat({ min: 1, max: 500 }),
  query('search').optional().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query().custom((value) => {
    const hasLat = value.latitude !== undefined;
    const hasLng = value.longitude !== undefined;
    if (hasLat !== hasLng) throw new Error('latitude and longitude must be provided together.');
    return true;
  }),
];

const updateStatus = [
  body('status').isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`),
];

const respondToRequest = [
  body('responseType').isIn(['interested', 'not_available', 'contact_requester'])
    .withMessage('Response type must be interested, not_available or contact_requester.'),
  body('note').optional().trim().isLength({ max: 500 })
    .withMessage('Note is too long (max 500 characters).'),
];

const selectDonor = [
  body('donorId').notEmpty().withMessage('Donor ID is required.').bail()
    .isMongoId().withMessage('Invalid donor ID.'),
];

module.exports = {
  createRequest,
  requestIdParam,
  feedQuery,
  updateStatus,
  respondToRequest,
  selectDonor,
};