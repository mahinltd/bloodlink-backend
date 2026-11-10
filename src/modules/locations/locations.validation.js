import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const childrenQuerySchema = z.object({
  query: z.object({
    parentId: objectId.optional(),
    q: z.string().trim().max(80).optional(),
    since: z.coerce.date().optional(), // ডেল্টা সিঙ্ক (অ্যাপ ক্যাশ)
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  }),
});

export const createVillageSchema = z.object({
  body: z.object({
    unionId: objectId,
    nameBn: z.string().trim().min(2).max(120),
    nameEn: z.string().trim().max(120).optional(),
  }),
});

export const hospitalQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    districtId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const createHospitalSchema = z.object({
  body: z.object({
    nameBn: z.string().trim().min(2).max(150),
    nameEn: z.string().trim().max(150).optional(),
    coordinates: z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .optional(),
    divisionId: objectId.optional(),
    districtId: objectId.optional(),
    upazilaId: objectId.optional(),
  }),
});