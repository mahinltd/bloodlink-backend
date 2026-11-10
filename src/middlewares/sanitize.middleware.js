import mongoSanitize from 'express-mongo-sanitize';

// NoSQL ইনজেকশন প্রতিরোধ: $ ও . দিয়ে শুরু হওয়া key নিরপেক্ষ করা
export const sanitizeMiddleware = (req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  // Express 5-এ req.query read-only getter -> in-place
  if (req.query && typeof req.query === 'object') {
    const clean = mongoSanitize.sanitize({ ...req.query });
    for (const key of Object.keys(req.query)) delete req.query[key];
    Object.assign(req.query, clean);
  }
  next();
};