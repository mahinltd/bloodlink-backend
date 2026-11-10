import http from 'http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { bootstrapDefaults } from './modules/config/config.service.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { startJobs } from './jobs/index.js';
import { logger } from './utils/logger.js';

let server = null;

const start = async () => {
  await connectDB();
  await bootstrapDefaults(); // প্রথমবার: ডিফল্ট কনফিগ v1 + মূল ট্রান্সলেশন

  // ডেভ মোডে stale index স্বয়ংক্রিয়ভাবে মুছে schema অনুযায়ী index ঠিক করে
  // (যেমন আজকের code_1 সমস্যা)। production-এ বন্ধ রাখুন।
  if (env.SYNC_INDEXES) {
    try {
      const result = await mongoose.syncIndexes();
      logger.info(`Indexes synced: ${JSON.stringify(result)}`);
    } catch (err) {
      logger.warn(`Index sync failed (কালেকশন খালি করে আবার চেষ্টা করুন): ${err.message}`);
    }
  }

  const app = createApp();
  server = http.createServer(app);
  initSocket(server, env.CORS_ORIGINS);
  startJobs();

  server.listen(env.PORT, () => {
    logger.info(`BloodLink API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
};

const shutdown = (signal) => {
  logger.warn(`${signal} received. Shutting down gracefully...`);
  if (server) server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});