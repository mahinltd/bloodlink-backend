import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Release } from '../src/modules/releases/release.model.js';

const run = async () => {
  await connectDB();

  const existing = await Release.findOne({ versionCode: 1 });
  if (existing) {
    console.log('Demo release already exists, skipping.');
  } else {
    await Release.create({
      versionCode: 1,
      versionName: '1.0.0',
      apkUrl: '/downloads/releases/bloodlink-1.0.0.apk',
      fileSizeBytes: 0,
      sha256: '',
      releaseNotes: { bn: 'প্রথম রিলিজ', en: 'Initial release' },
      mandatory: false,
      rolloutPercent: 100,
      status: 'published',
      publishedAt: new Date(),
    });
    console.log('Demo release created: v1.0.0 (versionCode 1)');
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});