import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { bootstrapDefaults } from './modules/config/config.service.js';
import { logger } from './utils/logger.js';

try {
  await connectDB();
  await bootstrapDefaults();
  logger.info('Seed completed');
} catch (error) {
  logger.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
