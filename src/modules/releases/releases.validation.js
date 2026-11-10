import { z } from 'zod';

export const appVersionQuerySchema = z.object({
  currentVersionCode: z.coerce.number().int().min(0).default(0),
  deviceId: z.string().max(128).optional(),
  lang: z.enum(['bn', 'en']).default('bn'),
});