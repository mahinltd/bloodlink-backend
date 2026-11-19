// BloodLink Backend - Server Entry Point
const http = require('http');
const mongoose = require('mongoose');
const env = require('./config/env');
const logger = require('./utils/logger');
const connectDB = require('./config/db');
const app = require('./app');
const { initSocket } = require('./sockets');
const { startJobs } = require('./jobs');

let server;

const startServer = async () => {
  try {
    // 1. Database
    await connectDB();

    // 2. HTTP Server
    server = http.createServer(app);

    // 3. Socket.io
    initSocket(server);

    // 3.5 Cron Jobs (expiry, cooldown reminder, SOS escalation)
    startJobs();

    // 4. Listen
    server.listen(env.port, () => {
      logger.success('════════════════════════════════════════════');
      logger.success('🩸 BloodLink API Server Started');
      logger.info(`Environment : ${env.nodeEnv}`);
      logger.info(`Port        : ${env.port}`);
      logger.info(`API         : http://localhost:${env.port}${env.apiPrefix}`);
      logger.info(`Health      : http://localhost:${env.port}${env.apiPrefix}/health`);
      logger.success('Donate Blood, Save Lives.');
      logger.success('════════════════════════════════════════════');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${env.port} is already in use.`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ---------- Graceful Shutdown ----------
const shutdown = (signal) => {
  logger.warn(`${signal} received. Shutting down gracefully...`);

  if (!server) return process.exit(0);

  server.close(async () => {
    logger.info('HTTP server closed.');
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
    process.exit(0);
  });

  // 10 সেকেন্ডের মধ্যে বন্ধ না হলে force exit
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();