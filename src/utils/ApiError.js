export default class ApiError extends Error {
  constructor(statusCode, message, code = "ERROR", details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg = "Bad request", code = "BAD_REQUEST", details) {
    return new ApiError(400, msg, code, details);
  }
  static unauthorized(msg = "Unauthorized", code = "UNAUTHORIZED") {
    return new ApiError(401, msg, code);
  }
  static forbidden(msg = "Forbidden", code = "FORBIDDEN") {
    return new ApiError(403, msg, code);
  }
  static notFound(msg = "Resource not found", code = "NOT_FOUND") {
    return new ApiError(404, msg, code);
  }
  static conflict(msg = "Conflict", code = "CONFLICT") {
    return new ApiError(409, msg, code);
  }
  static tooMany(msg = "Too many requests", code = "RATE_LIMITED") {
    return new ApiError(429, msg, code);
  }
  static internal(msg = "Internal server error", code = "INTERNAL_ERROR") {
    return new ApiError(500, msg, code);
  }
}
