// BloodLink Backend - Config: Cloudflare R2 (Private Verification Images, Voice, APK Files)
const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');
const logger = require('../utils/logger');

const isR2Configured = Boolean(
  env.r2.endpoint && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucketName
);

let r2Client = null;
if (isR2Configured) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: env.r2.endpoint,
    credentials: {
      accessKeyId: env.r2.accessKeyId,
      secretAccessKey: env.r2.secretAccessKey,
    },
  });
  logger.success('Cloudflare R2 storage configured.');
} else {
  logger.warn('R2 credentials missing — voice and verification image uploads will return 503 until .env is filled.');
}

module.exports = { r2Client, isR2Configured };