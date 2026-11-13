export * from './bloodGroups.js';
export * from './roles.js';

export const USER_STATUS = [
  'unverified',
  'active',
  'suspended',
  'deleted',
];

export const REQUEST_STATUS = [
  'open',
  'fulfilled',
  'cancelled',
  'expired',
];

export const REQUEST_URGENCY = ['normal', 'urgent', 'sos'];
export const RESPONSE_STATUS = ['accepted', 'declined', 'donated'];
export const OTP_PURPOSES = ['verify_email', 'reset_password'];

// গ্রাম: ৩ জন ভিন্ন ব্যবহারকারী ব্যবহার করলে সবার জন্য দৃশ্যমান (রোডম্যাপ পর্ব ৯)
export const VILLAGE_AUTO_APPROVE_COUNT = 3;

// রক্ত-বিক্রি ঠেকাতে নিষিদ্ধ শব্দ (রোডম্যাপ পর্ব ২/৭) — মিললে admin review ফ্ল্যাগ
export const BANNED_WORDS = [
  'টাকা',
  'বিক্রি',
  'বিক্রয়',
  'পয়সা',
  'দামে',
  'কিনব',
  'sell',
  'sale',
  'money',
  'taka',
  'price',
  'tk',
];

// ফলব্যাক নিয়ম — DB-তে published config থাকলে সেটাই কার্যকর হবে
export const DEFAULT_BUSINESS_RULES = {
  donor: {
    minAge: 18,
    maxAge: 60,
    minWeightKg: 50,
    donationGapDays: 120,
  },
  otp: {
    ttlMinutes: 10,
    maxAttempts: 5,
    resendCooldownSec: 60,
  },
  matching: {
    thresholdScore: 80,
    radiusStepsKm: [10, 25, 50],
    escalationMinutes: 30,
    sosMaxHours: 6,
    urgentHours: 24,
    urgentThresholdHours: 24,
    normalMaxDays: 7,
    normalExpiryDays: 7,
    rareGroups: ['O-', 'AB-'],
    perDonorPerDay: 5,
    maxRecipientsPerRequest: 50,
    sosMinRecipients: 5,
    sosMaxRadiusKm: 200,
  },
  requests: {
    dailyLimit: 2,
    newAccountDailyLimit: 1,
    sosDailyLimit: 2,
    newAccountSosDailyLimit: 1,
    maxBags: 10,
    autoHideReportCount: 3,
  },
  donationCard: { cooldownDays: 30 },
};