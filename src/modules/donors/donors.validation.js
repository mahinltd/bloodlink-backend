import { z } from 'zod';
import { BLOOD_GROUPS } from '../../constants/bloodGroups.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const searchDonorsSchema = z.object({
  query: z
    .object({
      bloodGroup: z.enum(BLOOD_GROUPS).optional(),
      compatible: booleanQuery.optional().default(false),
      divisionId: objectId.optional(),
      districtId: objectId.optional(),
      upazilaId: objectId.optional(),
      unionId: objectId.optional(),
      villageId: objectId.optional(),
      availableOnly: booleanQuery.optional().default(true),
      eligibleOnly: booleanQuery.optional().default(true),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().min(1).max(200).optional(),
      sort: z.enum(['nearest', 'recently_active']).optional(),
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
      if (query.compatible && !query.bloodGroup) {
        ctx.addIssue({
          code: 'custom',
          path: ['bloodGroup'],
          message: 'bloodGroup is required when compatible is true',
        });
      }
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