// BloodLink Backend - Config: Cloudinary
const cloudinary = require('cloudinary').v2;
const env = require('./env');
const logger = require('../utils/logger');

const isCloudinaryConfigured = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  logger.success('Cloudinary storage configured.');
} else {
  logger.warn('Cloudinary credentials missing — avatar upload will return 503 until .env is filled.');
}

module.exports = { cloudinary, isCloudinaryConfigured };