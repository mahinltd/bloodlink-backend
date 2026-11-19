// BloodLink Backend - MongoDB Connection
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
  if (!env.mongoUri) {
    logger.warn('MONGODB_URI is empty. Server will run WITHOUT database.');
    logger.warn('Add your MongoDB Atlas URI to .env to enable the database.');
    return null;
  }

  try {
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(env.mongoUri, {
      autoIndex: env.isDevelopment,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
    });

    logger.success(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected.'));
    mongoose.connection.on('reconnected', () => logger.success('MongoDB reconnected.'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));

    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;