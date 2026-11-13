import { z } from 'zod';
import { BLOOD_GROUPS, BLOOD_COMPONENTS } from '../../constants/bloodGroups.js';

const phoneRegex = /^01[3-9]\d{8}$/;
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const idParamSchema = z.object({ params: z.object({ id: objectId }) });

export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const createRequestSchema = z.object({
  body: z.object({
    patientName: z.string().trim().min(2).max(80),
    patientAge: z.coerce.number().int().min(0).max(130).nullish(),
    patientGender: z.enum(['male', 'female', 'other']).nullish(),
    patientCondition: z.string().trim().max(160).nullish(),
    bloodGroup: z.enum(BLOOD_GROUPS),
    component: z.enum(BLOOD_COMPONENTS).default('whole_blood'),
    bagsNeeded: z.coerce.number().int().min(1).max(10),
    neededBy: z.coerce.date(),
    urgency: z.enum(['normal', 'urgent', 'sos']).optional(),
    hospitalId: objectId.nullish(),
    hospitalName: z.string().trim().min(2).max(160),
    hospitalAddress: z.string().trim().max(300).nullish(),
    wardOrUnit: z.string().trim().max(100).nullish(),
    coordinates: z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }),
    divisionId: objectId.nullish(),
    districtId: objectId.nullish(),
    upazilaId: objectId.nullish(),
    unionId: objectId.nullish(),
    attendantName: z.string().trim().min(2).max(80),
    attendantRelation: z.string().trim().max(40).nullish(),
    attendantPhone: z.string().regex(phoneRegex, 'Invalid Bangladeshi phone number'),
    contactPreference: z.enum(['chat', 'call', 'sms', 'any']).default('any'),
    note: z
      .object({
        bn: z.string().trim().max(500).default(''),
        en: z.string().trim().max(500).default(''),
      })
      .default({ bn: '', en: '' }),
    declarationAccepted: z.literal(true), // ঘোষণা-কার্ড বাধ্যতামূলক
  }),
});

export const updateRequestSchema = z.object({
  params: z.object({ id: objectId }),
  body: createRequestSchema.shape.body.partial().omit({ declarationAccepted: true }),
});

export const listRequestsSchema = z.object({
  query: z
    .object({
      urgency: z.enum(['normal', 'urgent', 'sos']).optional(),
      bloodGroup: z.enum(BLOOD_GROUPS).optional(),
      component: z.enum(BLOOD_COMPONENTS).optional(),
      divisionId: objectId.optional(),
      districtId: objectId.optional(),
      upazilaId: objectId.optional(),
      q: z.string().trim().max(160).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().min(1).max(200).default(50),
      sort: z.enum(['nearest', 'newest', 'urgency']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .superRefine((query, ctx) => {
      if ((query.lat === undefined) !== (query.lng === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lng must be provided together' });
      }
      if (query.sort === 'nearest' && query.lat === undefined) {
        ctx.addIssue({ code: 'custom', path: ['sort'], message: 'Nearest sorting requires lat and lng' });
      }
    }),
});

export const sosRequestsSchema = z.object({
  query: z
    .object({
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    })
    .superRefine((query, ctx) => {
      if ((query.lat === undefined) !== (query.lng === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lng must be provided together' });
      }
    }),
});

export const respondSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ action: z.enum(['accept', 'decline']) }),
});

export const confirmDonationSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ donorId: objectId }),
});

export const reportSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().trim().min(5).max(300) }),
});