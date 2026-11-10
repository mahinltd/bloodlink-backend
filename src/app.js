import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';

import { env } from './config/env.js';
import routes from './routes/index.js';
import adminRoutes from './modules/admin/admin.routes.js';
import adminSystemRoutes from './modules/admin/systemAdmin.routes.js';
import adminLocationRoutes from './modules/admin/locationAdmin.routes.js';
import adminCampaignRoutes from './modules/admin/campaign.routes.js';
import adminCmsRoutes from './modules/admin/cms.routes.js';
import { apiLimiter } from './middlewares/rateLimiter.middleware.js';
import { sanitizeMiddleware } from './middlewares/sanitize.middleware.js';
import { notFoundMiddleware } from './middlewares/notFound.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

export const createApp = () => {
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  }

  const app = express();

  app.set('trust proxy', 1); // Render/প্রক্সির পেছনে rate-limit সঠিকভাবে কাজ করবে

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // মোবাইল অ্যাপ/curl-এ origin থাকে না
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );
  app.use(compression());
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeMiddleware);

  app.get('/', (req, res) =>
    res.json({ success: true, data: { name: 'BloodLink API', health: '/v1/health' } })
  );

  app.use('/v1', apiLimiter, routes);
  app.use('/admin', apiLimiter);
  app.use('/admin', adminRoutes);
  app.use('/admin', adminSystemRoutes);
  app.use('/admin', adminLocationRoutes);
  app.use('/admin', adminCampaignRoutes);
  app.use('/admin', adminCmsRoutes);

  // APK downloads — নিজের সাইট থেকে ডিস্ট্রিবিউশন (admin module-এ upload আসবে)
  const releasesDir = path.join(process.cwd(), 'uploads', 'releases');
  fs.mkdirSync(releasesDir, { recursive: true });
  app.use(
    '/downloads/releases',
    express.static(releasesDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment');
        }
      },
    })
  );

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};