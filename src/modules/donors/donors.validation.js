import { z } from 'zod';
import { BLOOD_GROUPS } from '../../constants/bloodGroups.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const searchDonorsSchema = z.object({
  query: z.object({
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    divisionId: objectId.optional(),
    districtId: objectId.optional(),
    upazilaId: objectId.optional(),
    unionId: objectId.optional(),
    villageId: objectId.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const donorDetailSchema = z.object({
  params: z.object({ id: objectId }),
  query: z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  }),
});

export const revealPhoneSchema = z.object({
  params: z.object({ id: objectId }),
});