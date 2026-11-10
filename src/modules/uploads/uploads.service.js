import { getCloudinary } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

// কোন ধরনের ছবি কোথায় যাবে — NID/সেলফি 'authenticated' (প্রাইভেট, রোডম্যাপ পর্ব ২/১৩)
const PRESETS = {
  avatar: { folder: 'bloodlink/avatars', type: 'upload' },
  chat: { folder: 'bloodlink/chat', type: 'upload' },
  id_verification: { folder: 'bloodlink/id-verification', type: 'authenticated' },
};

export const createUploadSignature = (preset, userId) => {
  const config = PRESETS[preset];
  if (!config) throw ApiError.badRequest('Invalid upload preset', 'INVALID_UPLOAD_PRESET');

  const cloudinary = getCloudinary();
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder: config.folder,
    type: config.type,
    context: `user_id=${userId}`,
  };
  const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    ...params,
    signature,
  };
};