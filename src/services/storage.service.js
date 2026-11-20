// BloodLink Backend - Service: Storage (Cloudinary)
const { randomUUID } = require('crypto');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { r2Client, isR2Configured } = require('../config/r2');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const uploadImage = (buffer, options = {}) => {
  if (!isCloudinaryConfigured) {
    throw new ApiError(503, 'Image storage is not configured. Add Cloudinary credentials to .env');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'bloodlink/misc',
        public_id: options.publicId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) return reject(new ApiError(502, `Image upload failed: ${error.message}`));
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

const deleteImage = async (publicId) => {
  if (!isCloudinaryConfigured || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch {
    // best-effort delete — আসল request ব্যর্থ করবে না
  }
};

// Voice message -> Cloudflare R2
const AUDIO_EXTENSIONS = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

const uploadVoice = async (buffer, mimetype) => {
  if (!isR2Configured) {
    throw new ApiError(503, 'Voice storage is not configured. Add R2 credentials to .env');
  }

  const ext = AUDIO_EXTENSIONS[mimetype] || 'm4a';
  const key = `voice/${new Date().getFullYear()}/${randomUUID()}.${ext}`;

  await r2Client.send(new PutObjectCommand({
    Bucket: env.r2.bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));

  return { url: `${env.r2.publicUrl}/${key}`, key };
};

// ---------- Private Storage (NID / Selfie) — §৫ ----------
const PRIVATE_IMAGE_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const uploadPrivateImage = async (buffer, options = {}) => {
  if (!isR2Configured) {
    throw new ApiError(503, 'Private image storage is not configured. Add R2 credentials to .env');
  }

  const format = PRIVATE_IMAGE_FORMATS[options.contentType];
  if (!format) throw new ApiError(400, 'Unsupported private image type.');

  const folder = (options.folder || 'bloodlink/verification').replace(/^\/+|\/+$/g, '');
  const objectName = options.publicId || randomUUID();
  const key = `${folder}/${objectName}`;

  await r2Client.send(new PutObjectCommand({
    Bucket: env.r2.bucketName,
    Key: key,
    Body: buffer,
    ContentType: options.contentType,
    CacheControl: 'private, no-store',
  }));

  return { key, format };
};

// Admin review-এর জন্য সাময়িক signed URL (10 মিনিট মেয়াদ)
const generatePrivateImageUrl = async ({ publicId }, expiresInSec = 600) => {
  if (!isR2Configured) {
    throw new ApiError(503, 'Private image storage is not configured. Add R2 credentials to .env');
  }
  if (!publicId) throw new ApiError(500, 'Private image object key is missing.');

  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: env.r2.bucketName, Key: publicId }),
    { expiresIn: expiresInSec }
  );
};

const deletePrivateImage = async (publicId) => {
  if (!publicId) return;
  if (!isR2Configured) {
    throw new ApiError(503, 'Private image storage is not configured. Add R2 credentials to .env');
  }

  await r2Client.send(new DeleteObjectCommand({
    Bucket: env.r2.bucketName,
    Key: publicId,
  }));
};

module.exports = { uploadImage, deleteImage, uploadVoice, uploadPrivateImage, generatePrivateImageUrl, deletePrivateImage };