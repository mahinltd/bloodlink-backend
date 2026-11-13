import { AppConfig } from '../config/appConfig.model.js';
import { DEFAULT_LEGAL_TEXTS, DEFAULT_TERMS_VERSION } from '../config/config.service.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { Donation } from '../requests/donation.model.js';
import { BloodRequest } from '../requests/bloodRequest.model.js';
import * as releasesService from '../releases/releases.service.js';

// Stats-এ ৫ মিনিটের in-memory cache — প্রতিবার aggregation চালানোর দরকার নেই
const STATS_TTL_MS = 5 * 60 * 1000;
let statsCache = { data: null, expiresAt: 0 };

export async function getPublicStats() {
  if (statsCache.data && statsCache.expiresAt > Date.now()) return statsCache.data;

  const [totalDonors, availableDonors, totalRequests, fulfilledRequests, totalDonations, bagsAgg] =
    await Promise.all([
      DonorProfile.countDocuments({}),
      DonorProfile.countDocuments({ isAvailable: true }),
      BloodRequest.countDocuments({}),
      BloodRequest.countDocuments({ status: 'fulfilled' }),
      Donation.countDocuments({}),
      BloodRequest.aggregate([{ $group: { _id: null, total: { $sum: '$bagsCollected' } } }]),
    ]);

  const data = {
    totalDonors,
    availableDonors,
    totalRequests,
    fulfilledRequests,
    totalDonations,
    totalBagsCollected: bagsAgg?.[0]?.total || 0,
  };
  statsCache = { data, expiresAt: Date.now() + STATS_TTL_MS };
  return data;
}

export async function getSiteContent(lang = 'bn') {
  const [config, latestRelease, stats] = await Promise.all([
    AppConfig.findOne({ status: 'published' }).sort({ version: -1 }).lean(),
    releasesService.getLatestReleaseForSite(lang),
    getPublicStats(),
  ]);
  const storedLegalTexts = config?.legalTexts && Object.keys(config.legalTexts).length
    ? config.legalTexts
    : config?.legal || {};
  const legalTexts = {
    ...DEFAULT_LEGAL_TEXTS,
    ...storedLegalTexts,
    phoneContact: { ...DEFAULT_LEGAL_TEXTS.phoneContact, ...(storedLegalTexts.phoneContact || {}) },
  };

  return {
    appName: 'BloodLink',
    termsVersion: config?.termsVersion || DEFAULT_TERMS_VERSION,
    tagline:
      lang === 'en' ? 'Find blood donors near you, fast.' : 'আপনার কাছাকাছি রক্তদাতা খুঁজুন, দ্রুত।',
    contact: config?.contact || {},
    developerInfo: config?.developerInfo || {},
    legalTexts,
    latestRelease,
    stats,
  };
}

export async function getLatestRelease(lang = 'bn') {
  return releasesService.getLatestReleaseForSite(lang);
}