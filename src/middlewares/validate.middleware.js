// BloodLink Backend - Middleware: Request Validation Result
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const formatted = errors.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  next(new ApiError(400, 'Validation failed. Please check your input.', formatted));
};

module.exports = validate;