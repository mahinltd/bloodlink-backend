import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { logger } from '../src/utils/logger.js';
import { Division } from '../src/modules/locations/division.model.js';
import { District } from '../src/modules/locations/district.model.js';
import { Upazila } from '../src/modules/locations/upazila.model.js';
import { Union } from '../src/modules/locations/union.model.js';
import { Village } from '../src/modules/locations/village.model.js';
import { Hospital } from '../src/modules/locations/hospital.model.js';
import { AppConfig } from '../src/modules/config/appConfig.model.js';
import { Translation } from '../src/modules/config/translation.model.js';
import { buildDefaultConfig } from '../src/modules/config/config.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'locations.json'), 'utf8'));

const upsert = (Model, filter, doc) =>
  Model.findOneAndUpdate(filter, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });

const CORE_TRANSLATIONS = [
  { key: 'app.name', bn: 'ব্লাডলিংক', en: 'BloodLink', group: 'common' },
  { key: 'common.retry', bn: 'আবার চেষ্টা করুন', en: 'Try again', group: 'common' },
  { key: 'common.ok', bn: 'ঠিক আছে', en: 'OK', group: 'common' },
  { key: 'common.cancel', bn: 'বাতিল', en: 'Cancel', group: 'common' },
  { key: 'error.generic', bn: 'কিছু একটা ঠিক হয়নি', en: 'Something went wrong', group: 'error' },
  { key: 'error.noInternet', bn: 'ইন্টারনেট সংযোগ নেই', en: 'No internet connection', group: 'error' },
  { key: 'empty.requests', bn: 'এখন কোনো অনুরোধ নেই', en: 'No requests right now', group: 'empty' },
  { key: 'empty.search', bn: 'আপনার সার্চের কোনো ফলাফল পাওয়া যায়নি', en: 'No results found', group: 'empty' },
];

const run = async () => {
  await connectDB();
  const counts = { divisions: 0, districts: 0, upazilas: 0, unions: 0, villages: 0, hospitals: 0 };

  for (const d of data.divisions) {
    const division = await upsert(
      Division,
      { nameEn: d.nameEn },
      { nameBn: d.nameBn, nameEn: d.nameEn, lat: d.lat ?? null, lng: d.lng ?? null, source: 'seed' }
    );
    counts.divisions++;

    for (const dist of d.districts || []) {
      const district = await upsert(
        District,
        { divisionId: division._id, nameEn: dist.nameEn },
        { nameBn: dist.nameBn, nameEn: dist.nameEn, divisionId: division._id, lat: dist.lat ?? null, lng: dist.lng ?? null, source: 'seed' }
      );
      counts.districts++;

      for (const up of dist.upazilas || []) {
        const upazila = await upsert(
          Upazila,
          { districtId: district._id, nameEn: up.nameEn },
          { nameBn: up.nameBn, nameEn: up.nameEn, districtId: district._id, lat: up.lat ?? null, lng: up.lng ?? null, source: 'seed' }
        );
        counts.upazilas++;

        for (const un of up.unions || []) {
          const unionDoc = await upsert(
            Union,
            { upazilaId: upazila._id, nameEn: un.nameEn },
            { nameBn: un.nameBn, nameEn: un.nameEn, upazilaId: upazila._id, source: 'seed' }
          );
          counts.unions++;

          for (const vil of un.villages || []) {
            await upsert(
              Village,
              { unionId: unionDoc._id, nameBn: vil.nameBn },
              { nameBn: vil.nameBn, nameEn: vil.nameEn || null, unionId: unionDoc._id, source: 'seed', status: 'approved' }
            );
            counts.villages++;
          }
        }
      }
    }
  }

  for (const h of data.hospitals || []) {
    const district = h.districtEn ? await District.findOne({ nameEn: h.districtEn }).lean() : null;
    const upazila = h.upazilaEn ? await Upazila.findOne({ nameEn: h.upazilaEn }).lean() : null;
    await upsert(
      Hospital,
      { 'name.en': h.nameEn },
      {
        name: { bn: h.nameBn, en: h.nameEn },
        location: { type: 'Point', coordinates: [h.lng, h.lat] },
        districtId: district?._id || null,
        upazilaId: upazila?._id || null,
        source: 'seed',
        status: 'approved',
      }
    );
    counts.hospitals++;
  }

  for (const t of CORE_TRANSLATIONS) {
    await upsert(Translation, { key: t.key }, t);
  }

  const published = await AppConfig.findOne({ status: 'published' }).lean();
  if (!published) {
    const defaults = buildDefaultConfig();
    await AppConfig.create({ ...defaults, version: 1, status: 'published', publishedAt: new Date() });
    logger.info('Default published config v1 created');
  }

  logger.info(`Seed complete: ${JSON.stringify(counts)}`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});