import { existsSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { BloodRequest } from '../src/modules/requests/bloodRequest.model.js';
import { DonorProfile } from '../src/modules/users/donorProfile.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';

const indexes = [
  {
    collection: BloodRequest.collection,
    name: 'location_2dsphere',
    key: { location: '2dsphere' },
  },
  {
    collection: BloodRequest.collection,
    name: 'status_1_urgency_1_expiresAt_1',
    key: { status: 1, urgency: 1, expiresAt: 1 },
  },
  {
    collection: BloodRequest.collection,
    name: 'status_1_isHidden_1_expiresAt_1',
    key: { status: 1, isHidden: 1, expiresAt: 1 },
  },
  {
    collection: DonorProfile.collection,
    name: 'location_2dsphere',
    key: { location: '2dsphere' },
  },
  {
    collection: DonorProfile.collection,
    name: 'bloodGroup_1_isAvailable_1_divisionId_1_districtId_1_upazilaId_1_unionId_1',
    key: {
      bloodGroup: 1,
      isAvailable: 1,
      divisionId: 1,
      districtId: 1,
      upazilaId: 1,
      unionId: 1,
    },
  },
  {
    collection: Notification.collection,
    name: 'userId_1_requestId_1_type_1',
    key: { userId: 1, requestId: 1, type: 1 },
    options: {
      unique: true,
      partialFilterExpression: { requestId: { $exists: true } },
    },
  },
];

const sameKey = (left, right) =>
  JSON.stringify(Object.entries(left)) === JSON.stringify(Object.entries(right));

const sameOptions = (existing, desired = {}) =>
  (!desired.unique || existing.unique === true) &&
  (!desired.partialFilterExpression ||
    JSON.stringify(existing.partialFilterExpression) === JSON.stringify(desired.partialFilterExpression));

const printDryRun = () => {
  console.log('DRY RUN: no database connection or writes will be made.');
  for (const index of indexes) {
    console.log(
      `${index.collection.name}: would ensure ${index.name} ${JSON.stringify(index.key)}${
        index.options ? ` options=${JSON.stringify(index.options)}` : ''
      }`
    );
  }
};

const readOption = (args, name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] || null;
};

const run = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    if (args.includes('--apply')) throw new Error('Choose either --dry-run or --apply');
    printDryRun();
    return;
  }
  if (!args.includes('--apply')) {
    throw new Error(
      'Usage: node scripts/migrateIndexes.js --dry-run | --apply --non-production --backup <verified-backup-path>'
    );
  }
  if (
    !args.includes('--non-production') ||
    process.env.BLOODLINK_MIGRATION_TARGET !== 'non-production' ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('Apply is blocked unless the target is explicitly marked non-production');
  }

  const backupPath = readOption(args, '--backup');
  if (!backupPath || !existsSync(path.resolve(backupPath))) {
    throw new Error('Apply requires --backup pointing to an existing, verified backup');
  }

  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') {
    throw new Error('Apply is blocked when NODE_ENV is production');
  }
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    for (const index of indexes) {
      const current = await index.collection.indexes();
      const matchingKey = current.find((candidate) => sameKey(candidate.key, index.key));
      if (matchingKey) {
        if (!sameOptions(matchingKey, index.options)) {
          throw new Error(
            `Index ${index.collection.name}.${matchingKey.name} has conflicting options; resolve it manually`
          );
        }
        console.log(`${index.collection.name}: already present (${matchingKey.name})`);
        continue;
      }

      await index.collection.createIndex(index.key, { name: index.name, ...index.options });
      console.log(`${index.collection.name}: created ${index.name}`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Index migration failed: ${error.message}`);
  process.exitCode = 1;
});
