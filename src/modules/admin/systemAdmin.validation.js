import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

const localized = z.object({
  bn: z.string().max(2000).optional(),
  en: z.string().max(2000).optional(),
});

const ruleScalar = z.union([z.number(), z.string(), z.boolean()]);
const ruleValue = z.union([
  ruleScalar,
  z.array(ruleScalar),
  z.record(z.string(), z.union([ruleScalar, z.array(ruleScalar)])),
]);

// multipart/form-data থেকে boolean স্ট্রিং ('true'/'false') হিসেবে আসে
const formBool = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

// ── Config ──
export const updateConfigDraftSchema = z
  .object({
    designTokens: z
      .object({
        light: z.record(z.string(), z.any()).optional(),
        dark: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    featureFlags: z.record(z.string(), z.boolean()).optional(),
    businessRules: z.record(z.string(), ruleValue).optional(),
    onboardingSlides: z.array(z.record(z.string(), z.any())).max(10).optional(),
    donationCard: z
      .object({
        enabled: z.boolean().optional(),
        title: localized.optional(),
        message: localized.optional(),
        bkashNumber: z.string().max(20).optional(),
        qrImageUrl: z.string().max(500).optional(),
        disclaimer: localized.optional(),
      })
      .optional(),
    contact: z.record(z.string(), z.any()).optional(),
    developerInfo: z.record(z.string(), z.any()).optional(),
    legalTexts: z.record(z.string(), z.any()).optional(),
    maintenance: z
      .object({
        enabled: z.boolean().optional(),
        message: localized.optional(),
      })
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

// ── Translations ──
export const createTranslationSchema = z.object({
  key: z.string().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i, 'Invalid key format'),
  bn: z.string().max(2000).default(''),
  en: z.string().max(2000).default(''),
  group: z.string().max(60).default('general'),
});

export const updateTranslationSchema = z
  .object({
    bn: z.string().max(2000).optional(),
    en: z.string().max(2000).optional(),
    group: z.string().max(60).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const bulkTranslationsSchema = z.object({
  items: z.array(createTranslationSchema).min(1).max(500),
});

export const translationsQuerySchema = z.object({
  page,
  limit,
  q: z.string().max(80).optional(),
  group: z.string().max(60).optional(),
});

// ── Releases ──
export const createReleaseSchema = z.object({
  versionCode: z.coerce.number().int().min(1),
  versionName: z.string().trim().min(1).max(40),
  releaseNotesBn: z.string().max(2000).optional().default(''),
  releaseNotesEn: z.string().max(2000).optional().default(''),
  mandatory: formBool.optional(),
  minSupportedVersionCode: z.coerce.number().int().min(0).optional().default(0),
  rolloutPercent: z.coerce.number().int().min(0).max(100).optional().default(100),
});

export const updateReleaseSchema = z
  .object({
    versionCode: z.coerce.number().int().min(1).optional(),
    versionName: z.string().trim().min(1).max(40).optional(),
    releaseNotesBn: z.string().max(2000).optional(),
    releaseNotesEn: z.string().max(2000).optional(),
    mandatory: formBool.optional(),
    minSupportedVersionCode: z.coerce.number().int().min(0).optional(),
    rolloutPercent: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });