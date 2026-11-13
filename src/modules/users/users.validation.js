import { z } from 'zod';
import { BLOOD_GROUPS } from '../../constants/bloodGroups.js';

const phoneRegex = /^01[3-9]\d{8}$/;
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// ডোনার ফর্ম — auth ও users দুই মডিউলেই ব্যবহৃত হয় (single source of truth)
export const donorFormSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),
  dob: z.coerce.date(),
  gender: z.enum(['male', 'female', 'other']),
  weightKg: z.coerce.number().min(1).max(300),
  lastDonationDate: z.coerce.date().nullish(),
  donationCount: z.coerce.number().int().min(0).max(500).default(0),
  healthDeclaration: z
    .object({
      recentIllness: z.array(z.string().max(60)).max(10).default([]),
      surgery: z.boolean().default(false),
      tattooOrPiercing: z.boolean().default(false),
      onMedication: z.boolean().default(false),
      pregnantOrBreastfeeding: z.boolean().default(false),
      chronicDisease: z.boolean().default(false),
    })
    .default({}),
  divisionId: objectId.nullish(),
  districtId: objectId.nullish(),
  upazilaId: objectId.nullish(),
  unionId: objectId.nullish(),
  villageId: objectId.nullish(),
  villageName: z.string().trim().max(120).nullish(),
  addressDetail: z.string().trim().max(300).nullish(),
  coordinates: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
  radiusKm: z.coerce.number().min(1).max(100).default(10),
  nightOk: z.boolean().default(false),
});

// PATCH /me — ইমেইল ইচ্ছাকৃতভাবে নেই (কখনো পরিবর্তনযোগ্য নয়)
export const updateMeSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().regex(phoneRegex, 'Invalid Bangladeshi phone number').optional(),
    donor: donorFormSchema.partial().optional(), // ডোনার মোড চালু থাকলে আংশিক আপডেট
  }),
});

export const donorProfileSchema = z.object({
  body: donorFormSchema.extend({
    consents: z.object({ phonePublicInApp: z.literal(true) }),
  }),
});

export const acceptTermsSchema = z.object({
  body: z.object({ termsVersion: z.string().trim().min(1).max(40) }),
});

export const avatarSchema = z.object({
  body: z.object({ avatar: z.string().min(1).max(500) }),
});

export const availabilitySchema = z.object({
  body: z.object({ isAvailable: z.boolean() }),
});

export const settingsSchema = z.object({
  body: z.object({
    language: z.enum(['bn', 'en']).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    notificationPrefs: z
      .object({
        push: z.boolean().optional(),
        email: z.boolean().optional(),
        urgentRequests: z.boolean().optional(),
        normalRequests: z.boolean().optional(),
        responses: z.boolean().optional(),
        messages: z.boolean().optional(),
        motivation: z.boolean().optional(),
      })
      .optional(),
    privacy: z
      .object({
        showPhone: z.enum(['on_response', 'always', 'never']).optional(),
        showLastDonation: z.boolean().optional(),
      })
      .optional(),
  }),
});

export const locationSchema = z.object({
  body: z.object({
    coordinates: z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }),
    divisionId: objectId.nullish(),
    districtId: objectId.nullish(),
    upazilaId: objectId.nullish(),
    unionId: objectId.nullish(),
    villageId: objectId.nullish(),
    villageName: z.string().trim().max(120).nullish(),
    addressDetail: z.string().trim().max(300).nullish(),
  }),
});

export const deviceSchema = z.object({
  body: z.object({
    fcmToken: z.string().min(10).max(500),
    platform: z.enum(['android', 'ios']).default('android'),
    appVersion: z.string().max(20).optional(),
    deviceId: z.string().max(120).optional(),
  }),
});

export const deviceRemoveSchema = z.object({
  body: z.object({ fcmToken: z.string().min(10).max(500) }),
});

export const deviceRemoveParamSchema = z.object({
  params: z.object({ token: z.string().min(10).max(500) }),
});

export const idVerificationSchema = z.object({
  body: z.object({
    frontImage: z.string().min(1).max(500),
    backImage: z.string().min(1).max(500),
    selfie: z.string().min(1).max(500),
  }),
});

export const deleteAccountSchema = z.object({
  body: z.object({ password: z.string().min(1) }),
});