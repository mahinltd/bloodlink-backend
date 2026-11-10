import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';
import ApiError from '../utils/ApiError.js';

let configured = false;

export const getCloudinary = () => {
  if (!configured) {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw ApiError.internal('Cloudinary is not configured. Set CLOUDINARY_* in .env', 'CLOUDINARY_NOT_CONFIGURED');
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return cloudinary;
};