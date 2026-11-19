// BloodLink Backend - Express App Setup
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Render/Cloudflare proxy-র পেছনে চলবে
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- Security ----------
app.use(helmet());

const allowedOrigins = [
  env.urls.client,
  env.urls.admin,
  'http://localhost:3000', // Admin Dashboard (dev)
  'http://localhost:3001', // Public Website (dev)
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Mobile app ও server-to-server request-এ origin থাকে না — allow
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ---------- Body Parsing ----------
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ---------- NoSQL Injection Sanitizer ----------
// NOTE: express-mongo-sanitize Express 5-এ crash করে (req.query read-only getter)।
// তাই in-place sanitizer — $ এবং . দিয়ে শুরু হওয়া key মুছে দেয়।
const sanitizeInPlace = (value) => {
  if (Array.isArray(value)) {
    value.forEach(sanitizeInPlace);
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else sanitizeInPlace(value[key]);
    });
  }
};

app.use((req, res, next) => {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.query);
  sanitizeInPlace(req.params);
  next();
});

// ---------- Logging ----------
if (env.isDevelopment) app.use(morgan('dev'));

// ---------- Compression ----------
app.use(compression());

// ---------- Rate Limiting ----------
app.use(env.apiPrefix, apiLimiter);

// ---------- Root & Health ----------
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🩸 BloodLink API is running — Donate Blood, Save Lives.',
    data: { version: 'v1', health: `${env.apiPrefix}/health` },
  });
});

// Render health check এর জন্য root-level endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK' });
});

// ---------- API Routes ----------
app.use(env.apiPrefix, routes);

// ---------- 404 & Global Error Handler ----------
app.use(notFound);
app.use(errorHandler);

module.exports = app;