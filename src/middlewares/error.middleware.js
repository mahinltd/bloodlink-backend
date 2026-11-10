import * as Sentry from '@sentry/node';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input data';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401; code = 'TOKEN_EXPIRED'; message = 'Token has expired';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401; code = 'INVALID_TOKEN'; message = 'Invalid token';
  } else if (err.name === 'CastError') {
    statusCode = 400; code = 'INVALID_ID'; message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'ValidationError') {
    statusCode = 400; code = 'VALIDATION_ERROR'; message = 'Database validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.code === 11000) {
    statusCode = 409; code = 'DUPLICATE_KEY';
    message = `Duplicate value for: ${Object.keys(err.keyValue || {}).join(', ')}`;
  } else if (err.name === 'MulterError') {
    statusCode = 400; code = 'UPLOAD_ERROR'; message = err.message;
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400; code = 'INVALID_JSON'; message = 'Invalid JSON body';
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err);
    if (env.SENTRY_DSN) Sentry.captureException(err);
    if (env.NODE_ENV === 'production') message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
};

export { ApiError };