// BloodLink Backend - Request Urgency Levels
const URGENCY_LEVELS = {
  SOS: 'sos',
  URGENT: 'urgent',
  REGULAR: 'regular',
};

const URGENCY_LEVEL_LIST = Object.values(URGENCY_LEVELS);

// Auto-expiry সময় (ঘণ্টায়) — requestExpiry.job ব্যবহার করবে
const URGENCY_EXPIRY_HOURS = {
  [URGENCY_LEVELS.SOS]: 3,       // ২–৩ ঘণ্টা
  [URGENCY_LEVELS.URGENT]: 24,   // ২৪ ঘণ্টা
  [URGENCY_LEVELS.REGULAR]: 72,  // ২–৩ দিন
};

module.exports = { URGENCY_LEVELS, URGENCY_LEVEL_LIST, URGENCY_EXPIRY_HOURS };