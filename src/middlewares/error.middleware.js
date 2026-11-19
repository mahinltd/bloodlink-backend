// BloodLink Backend - Middleware: error.middleware
// BloodLink Backend - Global Error Handling
const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

// 404 - Route not found
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// Central error handler
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Mongoose: invalid ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose: schema validation failed
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => e.message);
  }

  // MongoDB: duplicate key (unique index)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for '${field}'. This ${field} is already in use.`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  // Multer (file upload) errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${err.message}`;
  }

  // Body-parser errors
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body.';
  }
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large.';
  }

  // Log: 500+ সবসময়, বাকিগুলো শুধু development-এ
  if (statusCode >= 500) logger.error(`[${statusCode}] ${message}`, err);
  else if (env.isDevelopment) logger.warn(`[${statusCode}] ${message}`);

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(errors.length > 0 && { errors }),
    ...(env.isDevelopment && err.stack ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };