import { z } from 'zod';

export const signUploadSchema = z.object({
  body: z.object({ preset: z.enum(['avatar', 'chat', 'id_verification']) }),
});