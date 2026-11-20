// BloodLink Backend - Service: Storage (Cloudinary)
const { randomUUID } = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
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
// Cloudinary 'authenticated' type → public URL কাজ করে না
const uploadPrivateImage = (buffer, options = {}) => {
  if (!isCloudinaryConfigured) {
    throw new ApiError(503, 'Image storage is not configured. Add Cloudinary credentials to .env');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'bloodlink/verification',
        public_id: options.publicId,
        type: 'authenticated', // 🔒 private delivery
        overwrite: true,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(new ApiError(502, `Private image upload failed: ${error.message}`));
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// Admin review-এর জন্য সাময়িক signed URL (10 মিনিট মেয়াদ)
const generatePrivateImageUrl = ({ publicId, version, format = 'jpg' }, expiresInSec = 600) => {
  const options = {
    type: 'authenticated',
    format,
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
  };
  const numericVersion = Number(version);
  if (Number.isFinite(numericVersion) && numericVersion > 0) options.version = numericVersion;
  else options.force_version = false;
  return cloudinary.url(publicId, options);
};

const deletePrivateImage = async (publicId) => {
  if (!isCloudinaryConfigured || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { type: 'authenticated', invalidate: true });
  } catch {
    // best-effort
  }
};

module.exports = { uploadImage, deleteImage, uploadVoice, uploadPrivateImage, generatePrivateImageUrl, deletePrivateImage };