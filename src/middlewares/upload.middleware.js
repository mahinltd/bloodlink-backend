import multer from 'multer';
import ApiError from '../utils/ApiError.js';

export const uploadApk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      return callback(ApiError.badRequest('Only APK files are allowed', 'INVALID_FILE_TYPE'));
    }
    callback(null, true);
  },
});