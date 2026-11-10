import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { importHierarchy } from '../src/modules/locations/locations.service.js';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', 'seed', 'locations.json');

const run = async () => {
  await connectDB();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = await importHierarchy(raw);
  logger.info(`Location seed complete: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});