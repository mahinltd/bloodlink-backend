// BloodLink Backend - Middleware: File Upload (Multer Memory Storage)
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const imageFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, 'Only JPG, PNG or WEBP images are allowed.'));
};

// Memory storage — file সরাসরি Cloudinary-তে stream হবে, disk-এ জমবে না
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
});

const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm',
];

const audioFilter = (req, file, cb) => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, 'Only audio files are allowed (mp3, m4a, aac, wav, ogg, webm).'));
};

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: audioFilter,
});

module.exports = { uploadImage, uploadAudio };