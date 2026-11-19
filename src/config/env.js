// BloodLink Backend - Environment Configuration
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  port: Number(process.env.PORT) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: process.env.MONGODB_URI || '',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  urls: {
    client: process.env.CLIENT_URL || 'https://bloodlink.tech',
    admin: process.env.ADMIN_URL || 'https://admin.bloodlink.tech',
    api: process.env.API_URL || 'http://localhost:5000',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'BloodLink <noreply@bloodlink.tech>',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    endpoint: process.env.R2_ENDPOINT || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  otp: {
    expiresInMinutes: Number(process.env.OTP_EXPIRES_IN_MINUTES) || 10,
  },

  matching: {
    defaultRadiusKm: Number(process.env.DEFAULT_SEARCH_RADIUS_KM) || 10,
    maxRadiusKm: Number(process.env.MAX_SEARCH_RADIUS_KM) || 100,
    donationCooldownDays: Number(process.env.DONATION_COOLDOWN_DAYS) || 90,
  },

  admin: {
    jwtSecret: process.env.ADMIN_JWT_SECRET || '',
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
    totpKey: process.env.ADMIN_TOTP_ENCRYPTION_KEY || '',
  },
};

// ---------- Validation ----------
const validateEnv = () => {
  const missing = [];

  if (!env.mongoUri) missing.push('MONGODB_URI');
  if (!env.jwt.accessSecret) missing.push('JWT_ACCESS_SECRET');
  if (!env.jwt.refreshSecret) missing.push('JWT_REFRESH_SECRET');

  if (missing.length === 0) return;

  const message = `Missing environment variables: ${missing.join(', ')}`;

  if (env.isProduction) {
    logger.error(`${message} — cannot start in production.`);
    process.exit(1);
  }

  logger.warn(`${message}`);
  logger.warn('Running in DEVELOPMENT fallback mode. Fill .env before production.');

  // Development-only temporary JWT secrets (Phase 2 Auth test করা যাবে)
  // প্রতিবার server restart-এ পুরোনো token invalid হয়ে যাবে
  if (!env.jwt.accessSecret) env.jwt.accessSecret = crypto.randomBytes(48).toString('hex');
  if (!env.jwt.refreshSecret) env.jwt.refreshSecret = crypto.randomBytes(48).toString('hex');
};

validateEnv();

module.exports = env;