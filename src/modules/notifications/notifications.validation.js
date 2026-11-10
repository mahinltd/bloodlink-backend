import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const listNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    unread: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  }),
});

export const markReadSchema = z.object({
  body: z.object({
    ids: z.array(objectId).max(100).optional(),
    all: z.boolean().optional(),
  }),
}).refine(({ body }) => body.all === true || (body.ids?.length ?? 0) > 0, {
  message: 'Provide notification ids or set all to true',
  path: ['body'],
});

export const unsubscribeSchema = z.object({
  query: z.object({ token: z.string().min(10) }),
});