import crypto from 'crypto';
import { AppConfig } from './appConfig.model.js';
import { Translation } from './translation.model.js';
import { DEFAULT_BUSINESS_RULES } from '../../constants/index.js';
import { COMPATIBLE_DONORS } from '../../constants/bloodGroups.js';
import { logger } from '../../utils/logger.js';

/* ---------------- ক্যাশ (৬০ সেকেন্ড TTL) ---------------- */

let configCache = { doc: null, payload: null, etag: null, at: 0 };
let i18nCache = { bn: null, en: null, at: 0 };
const TTL = 60 * 1000;

export const invalidateConfigCache = () => {
  configCache = { doc: null, payload: null, etag: null, at: 0 };
  i18nCache = { bn: null, en: null, at: 0 };
};

export const getPublishedConfig = async (force = false) => {
  if (!force && configCache.doc && Date.now() - configCache.at < TTL) return configCache.doc;
  const doc = await AppConfig.findOne({ status: 'published' }).sort({ version: -1 }).lean();
  if (doc) configCache.doc = doc;
  configCache.at = Date.now();
  return doc;
};

// ব্যবসায়িক নিয়ম: DB কনফিগ + ফলব্যাক মার্জ (সার্ভার-সাইড ব্যবহারের জন্য)
export const getBusinessRules = async () => {
  const cfg = await getPublishedConfig();
  const remote = cfg?.businessRules || {};
  const flatDonor = {
    ...(remote.minAge !== undefined ? { minAge: remote.minAge } : {}),
    ...(remote.maxAge !== undefined ? { maxAge: remote.maxAge } : {}),
    ...(remote.minWeightKg !== undefined ? { minWeightKg: remote.minWeightKg } : {}),
    ...(remote.donationGapDays !== undefined ? { donationGapDays: remote.donationGapDays } : {}),
  };
  const flatMatching = {
    ...(remote.thresholdScore !== undefined ? { thresholdScore: remote.thresholdScore } : {}),
    ...(remote.radiusStepsKm !== undefined ? { radiusStepsKm: remote.radiusStepsKm } : {}),
    ...(remote.escalationMinutes !== undefined ? { escalationMinutes: remote.escalationMinutes } : {}),
    ...(remote.urgentThresholdHours !== undefined ? { urgentThresholdHours: remote.urgentThresholdHours } : {}),
    ...(remote.normalExpiryDays !== undefined ? { normalExpiryDays: remote.normalExpiryDays } : {}),
    ...(remote.perDonorPerDay !== undefined ? { perDonorPerDay: remote.perDonorPerDay } : {}),
    ...(remote.urgentEmailTopN !== undefined ? { urgentEmailTopN: remote.urgentEmailTopN } : {}),
  };
  const flatRequests = {
    ...(remote.dailyRequestLimit !== undefined ? { dailyLimit: remote.dailyRequestLimit } : {}),
    ...(remote.newAccountRequestLimit !== undefined ? { newAccountDailyLimit: remote.newAccountRequestLimit } : {}),
    ...(remote.maxBags !== undefined ? { maxBags: remote.maxBags } : {}),
  };
  const flatDonationCard = remote.donationCardCooldownDays !== undefined
    ? { cooldownDays: remote.donationCardCooldownDays }
    : {};
  return {
    donor: { ...DEFAULT_BUSINESS_RULES.donor, ...flatDonor, ...(remote.donor || {}) },
    otp: { ...DEFAULT_BUSINESS_RULES.otp, ...(remote.otp || {}) },
    matching: { ...DEFAULT_BUSINESS_RULES.matching, ...flatMatching, ...(remote.matching || {}) },
    requests: { ...DEFAULT_BUSINESS_RULES.requests, ...flatRequests, ...(remote.requests || {}) },
    donationCard: {
      ...DEFAULT_BUSINESS_RULES.donationCard,
      ...flatDonationCard,
      ...(remote.donationCard || {}),
    },
    phoneRevealDailyLimit: remote.phoneRevealDailyLimit ?? 20,
  };
};

/* ---------------- পাবলিক কনফিগ পেলোড + ETag ---------------- */

export const getPublicConfig = async () => {
  if (configCache.payload && Date.now() - configCache.at < TTL) {
    return { payload: configCache.payload, etag: configCache.etag };
  }

  const cfg = await getPublishedConfig(true);
  const rules = await getBusinessRules();
  const legalTexts = cfg?.legalTexts && Object.keys(cfg.legalTexts).length
    ? cfg.legalTexts
    : cfg?.legal || {};

  const payload = cfg
    ? {
        version: cfg.version,
        updatedAt: cfg.publishedAt,
        designTokens: cfg.designTokens,
        featureFlags: cfg.featureFlags,
        rules: {
          donor: rules.donor,
          requests: { maxBags: rules.requests.maxBags, dailyLimit: rules.requests.dailyLimit },
          matching: {
            urgentThresholdHours: rules.matching.urgentThresholdHours,
            normalExpiryDays: rules.matching.normalExpiryDays,
            radiusOptionsKm: [5, 10, 25, 50],
          },
        },
        onboardingSlides: cfg.onboardingSlides,
        donationCard: {
          enabled: cfg.donationCard?.enabled === true,
          title: cfg.donationCard?.title || null,
          message: cfg.donationCard?.message || null,
          bkashNumber: cfg.donationCard?.bkashNumber || null,
          qrImage: cfg.donationCard?.qrImage || null,
          cooldownDays: rules.donationCard.cooldownDays,
        },
        contact: cfg.contact,
        developerInfo: cfg.developerInfo,
        legal: cfg.legal,
        legalTexts,
        maintenance: cfg.maintenance,
        bloodCompatibility: cfg.bloodCompatibility || COMPATIBLE_DONORS,
      }
    : {
        version: 0,
        updatedAt: null,
        designTokens: {},
        featureFlags: {},
        rules: {
          donor: rules.donor,
          requests: { maxBags: rules.requests.maxBags, dailyLimit: rules.requests.dailyLimit },
          matching: {
            urgentThresholdHours: rules.matching.urgentThresholdHours,
            normalExpiryDays: rules.matching.normalExpiryDays,
            radiusOptionsKm: [5, 10, 25, 50],
          },
        },
        onboardingSlides: [],
        donationCard: { enabled: false, cooldownDays: rules.donationCard.cooldownDays },
        contact: {},
        developerInfo: {},
        legal: {},
        legalTexts: {},
        maintenance: { enabled: false },
        bloodCompatibility: COMPATIBLE_DONORS,
      };

  const etag = `"${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')}"`;
  configCache.payload = payload;
  configCache.etag = etag;
  configCache.at = Date.now();
  return { payload, etag };
};

/* ---------------- ট্রান্সলেশন ---------------- */

export const getTranslationMap = async (lang) => {
  if (i18nCache[lang] && Date.now() - i18nCache.at < TTL) return i18nCache[lang];

  const docs = await Translation.find({}).select(`key ${lang} updatedAt`).lean();
  const strings = {};
  let latest = null;
  for (const d of docs) {
    strings[d.key] = d[lang];
    if (!latest || d.updatedAt > latest) latest = d.updatedAt;
  }
  const map = { strings, version: latest || null };
  i18nCache[lang] = map;
  i18nCache.at = Date.now();
  return map;
};

/* ---------------- প্রথমবারের ডিফল্ট (bootstrap) ---------------- */

const DEFAULT_CONFIG = {
  version: 1,
  status: 'published',
  designTokens: {
    light: {
      primary: '#D32F2F', onPrimary: '#FFFFFF', background: '#FAFAFA', surface: '#FFFFFF',
      text: '#1A1A1A', textSecondary: '#5F6368', border: '#E0E0E0',
      error: '#B3261E', success: '#2E7D32', urgent: '#C62828',
    },
    dark: {
      primary: '#EF5350', onPrimary: '#FFFFFF', background: '#121212', surface: '#1E1E1E',
      text: '#F5F5F5', textSecondary: '#AAAAAA', border: '#2C2C2C',
      error: '#F2B8B5', success: '#81C784', urgent: '#EF5350',
    },
    radius: { card: 12, button: 10 },
    fontScale: 1.0,
  },
  featureFlags: {
    registration: true,
    chat: true,
    idVerification: true,
    donationCard: false,
    emailForUrgentRequests: true,
  },
  businessRules: DEFAULT_BUSINESS_RULES,
  onboardingSlides: [
    {
      image: null,
      title: { bn: 'কাছের ডোনার খুঁজুন', en: 'Find donors near you' },
      body: { bn: 'লোকেশন-ভিত্তিক ম্যাচিংয়ে মুহূর্তেই কাছের রক্তদাতাদের খুঁজে নিন।', en: 'Location-based matching finds nearby donors instantly.' },
    },
    {
      image: null,
      title: { bn: 'জরুরি নোটিফিকেশন', en: 'Urgent notifications' },
      body: { bn: 'আপনার রক্তের গ্রুপ মিললেই সাথে সাথে জরুরি অনুরোধের খবর পাবেন।', en: 'Get instant alerts when urgent requests match your blood group.' },
    },
    {
      image: null,
      title: { bn: 'জীবন বাঁচান', en: 'Save lives' },
      body: { bn: 'একটি ব্যাগ রক্ত বাঁচাতে পারে একটি জীবন। আজই যুক্ত হোন।', en: 'One bag of blood can save a life. Join today.' },
    },
  ],
  donationCard: {
    enabled: false, // আইনি যাচাইয়ের আগে বন্ধ (রোডম্যাপ পর্ব ১৩)
    title: { bn: 'BloodLink-কে সহযোগিতা করুন', en: 'Support BloodLink' },
    message: {
      bn: 'ব্লাডলিংক সংস্থার জন্য কিছু ডোনেশন করুন। আমাদের অ্যাপ আপনার কাজে লেগে থাকলে ইচ্ছা হলে সহযোগিতা করতে পারেন। এটি সম্পূর্ণ ঐচ্ছিক। রক্ত বিনামূল্যে; এই ডোনেশন রক্তের বিনিময়ে নয়।',
      en: 'Support the BloodLink platform. If our app helped you, you may contribute — completely voluntary. Blood is always free; this donation is not payment for blood.',
    },
    bkashNumber: null,
    qrImage: null,
    cooldownDays: 30,
  },
  contact: {
    supportEmail: 'support@bloodlink.tech',
    supportPhone: null,
    website: 'https://bloodlink.tech',
    facebook: null,
  },
  developerInfo: {
    name: 'BloodLink Team',
    email: 'dev@bloodlink.tech',
    website: 'https://bloodlink.tech',
  },
  legal: {
    termsUrl: 'https://bloodlink.tech/terms',
    privacyUrl: 'https://bloodlink.tech/privacy',
  },
  legalTexts: {
    termsUrl: 'https://bloodlink.tech/terms',
    privacyUrl: 'https://bloodlink.tech/privacy',
  },
  maintenance: {
    enabled: false,
    message: {
      bn: 'আমরা সার্ভার রক্ষণাবেক্ষণ করছি। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      en: 'We are performing maintenance. Please try again shortly.',
    },
  },
  bloodCompatibility: COMPATIBLE_DONORS,
  publishedAt: new Date(),
};

const DEFAULT_TRANSLATIONS = [
  { key: 'app.name', group: 'common', bn: 'ব্লাডলিংক', en: 'BloodLink' },
  { key: 'common.ok', group: 'common', bn: 'ঠিক আছে', en: 'OK' },
  { key: 'common.cancel', group: 'common', bn: 'বাতিল', en: 'Cancel' },
  { key: 'common.retry', group: 'common', bn: 'আবার চেষ্টা করুন', en: 'Try again' },
  { key: 'common.back_home', group: 'common', bn: 'হোমে ফিরুন', en: 'Back to home' },
  { key: 'error.generic', group: 'error', bn: 'কিছু একটা ঠিক হয়নি', en: 'Something went wrong' },
  { key: 'error.no_internet', group: 'error', bn: 'ইন্টারনেট সংযোগ নেই', en: 'No internet connection' },
  { key: 'empty.requests', group: 'empty', bn: 'এখন কোনো অনুরোধ নেই', en: 'No requests right now' },
  { key: 'empty.search', group: 'empty', bn: 'আপনার সার্চের কোনো ফলাফল পাওয়া যায়নি', en: 'No results found for your search' },
  { key: 'auth.invalid_credentials', group: 'auth', bn: 'ইমেইল বা পাসওয়ার্ড ভুল হয়েছে', en: 'Invalid email or password' },
  { key: 'auth.email_not_verified', group: 'auth', bn: 'আগে আপনার ইমেইল যাচাই করুন', en: 'Please verify your email first' },
  { key: 'auth.otp_sent', group: 'auth', bn: 'আপনার ইমেইলে একটি কোড পাঠানো হয়েছে', en: 'A code has been sent to your email' },
  { key: 'request.disclaimer', group: 'request',
    bn: 'নিশ্চিত করুন আপনি যে তথ্য দিয়েছেন তা সম্পূর্ণ সত্য। রোগী প্রকৃতপক্ষে হাসপাতালে ভর্তি আছেন এবং এই রক্ত প্রয়োজন। রক্ত কোনোভাবেই টাকার বিনিময়ে কেনাবেচা করা যায় না। মিথ্যা তথ্য দিলে আপনার অ্যাকাউন্ট স্থায়ীভাবে বন্ধ করা হবে এবং প্রয়োজনে আইনি ব্যবস্থা নেওয়া হতে পারে। রক্ত পাওয়া গেলে অনুগ্রহ করে "সম্পন্ন" চিহ্নিত করুন, যাতে অন্যরা আর বিরক্ত না হন।',
    en: 'Confirm that all information you provided is true. The patient is actually hospitalized and needs this blood. Blood must never be bought or sold for money. False information will result in permanent account suspension and possible legal action. Once you receive blood, please mark the request as "Fulfilled" so others are not disturbed.' },
  { key: 'request.publish', group: 'request', bn: 'প্রকাশ করুন', en: 'Publish' },
  { key: 'request.i_can_donate', group: 'request', bn: 'আমি দিতে পারব', en: 'I can donate' },
  { key: 'update.required_title', group: 'update', bn: 'আপডেট প্রয়োজন', en: 'Update required' },
  { key: 'update.available_title', group: 'update', bn: 'নতুন আপডেট এসেছে', en: 'New update available' },
  { key: 'donation.thank_you', group: 'donation', bn: 'ধন্যবাদ! আপনার রক্তদান একটি জীবন বাঁচিয়েছে।', en: 'Thank you! Your donation has saved a life.' },
];

export const bootstrapDefaults = async () => {
  const published = await AppConfig.findOne({ status: 'published' }).lean();
  if (!published) {
    await AppConfig.create(DEFAULT_CONFIG);
    logger.info('Default app config published (v1)');
  }

  const count = await Translation.estimatedDocumentCount();
  if (count === 0) {
    await Translation.insertMany(DEFAULT_TRANSLATIONS);
    logger.info(`Default translations seeded (${DEFAULT_TRANSLATIONS.length} keys)`);
  }
};
