import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  PUBLIC_API_URL: z.string().url().default('https://api.bloodlink.tech'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('30d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  RESEND_API_KEY: z.string().optional().or(z.literal('')),
  EMAIL_FROM: z.string().default('no-reply@bloodlink.tech'),
  LOGO_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'LOGO_URL must use HTTPS')
    .optional()
    .or(z.literal(''))
    .default(''),
  SUPPORT_EMAIL: z.email().optional().or(z.literal('')).default(''),

  CLOUDINARY_CLOUD_NAME: z.string().optional().or(z.literal('')),
  CLOUDINARY_API_KEY: z.string().optional().or(z.literal('')),
  CLOUDINARY_API_SECRET: z.string().optional().or(z.literal('')),

  FIREBASE_PROJECT_ID: z.string().optional().or(z.literal('')),
  FIREBASE_CLIENT_EMAIL: z.string().optional().or(z.literal('')),
  FIREBASE_PRIVATE_KEY: z.string().optional().or(z.literal('')),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  SENTRY_DSN: z.string().optional().or(z.literal('')),
  SYNC_INDEXES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(z.treeifyError(parsed.error), null, 2));
  process.exit(1);
}

export const env = parsed.data;