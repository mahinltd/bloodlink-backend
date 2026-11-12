import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { z } from 'zod';
import { validate } from '../src/middlewares/validate.middleware.js';
import { listNotificationsSchema, markReadSchema } from '../src/modules/notifications/notifications.validation.js';
import { Release } from '../src/modules/releases/release.model.js';
import { checkAppVersion } from '../src/modules/releases/releases.service.js';
import { User } from '../src/modules/users/user.model.js';
import { OtpCode } from '../src/modules/auth/otpCode.model.js';
import { register } from '../src/modules/auth/auth.service.js';
import locationRoutes from '../src/modules/locations/locations.routes.js';
import { Union } from '../src/modules/locations/union.model.js';
import { Village } from '../src/modules/locations/village.model.js';
import { renderVerificationEmail } from '../src/modules/notifications/emailTemplates.js';
import { generateOtp } from '../src/utils/otp.util.js';
import { unionsQuerySchema, villagesQuerySchema } from '../src/modules/locations/locations.validation.js';

test('validated query defaults and transforms survive Express 5 query parsing', async () => {
  const app = express();
  const schema = z.object({
    query: z.object({
      page: z.coerce.number().int().default(1),
      unread: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }),
  });
  app.get('/', validate(schema), (req, res) => res.json(req.query));

  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?unread=false`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { page: 1, unread: false });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('notification read requests require explicit ids or read-all', () => {
  assert.equal(markReadSchema.safeParse({ body: {} }).success, false);
  assert.equal(markReadSchema.safeParse({ body: { all: true } }).success, true);
  assert.equal(listNotificationsSchema.parse({ query: { unread: 'false' } }).query.unread, false);
});

test('mandatory releases bypass rollout and staged releases require a device id', async () => {
  const originalFindOne = Release.findOne;
  let release = {
    versionCode: 2,
    versionName: '2.0',
    releaseNotes: { bn: '', en: '' },
    apkUrl: '/downloads/releases/app.apk',
    sha256: 'abc',
    fileSizeBytes: 1,
    mandatory: true,
    minSupportedVersionCode: 2,
    rolloutPercent: 0,
    publishedAt: new Date(),
  };
  Release.findOne = () => ({ sort() { return this; }, lean: async () => release });

  try {
    const mandatory = await checkAppVersion({ currentVersionCode: 1 });
    assert.equal(mandatory.updateAvailable, true);
    assert.equal(mandatory.mandatory, true);

    release = { ...release, mandatory: false, minSupportedVersionCode: 0, rolloutPercent: 50 };
    const staged = await checkAppVersion({ currentVersionCode: 1 });
    assert.equal(staged.updateAvailable, false);
    assert.equal(staged.reason, 'device_id_required');
  } finally {
    Release.findOne = originalFindOne;
  }
});

test('registration rejects every existing email before updating the user or creating an OTP', async () => {
  const originalFindOne = User.findOne;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  const originalOtpUpsert = OtpCode.findOneAndUpdate;
  let queriedEmail;
  let userUpdates = 0;
  let otpUpserts = 0;

  User.findOne = async (filter) => {
    queriedEmail = filter.email;
    return { _id: 'existing-user', status: 'unverified' };
  };
  User.findByIdAndUpdate = async () => {
    userUpdates += 1;
    return { _id: 'existing-user' };
  };
  OtpCode.findOneAndUpdate = async () => {
    otpUpserts += 1;
  };

  try {
    await assert.rejects(
      register({ email: 'EXISTING@example.com', password: 'secure-password', role: 'requester' }, {}),
      (error) =>
        error.statusCode === 409 &&
        error.code === 'EMAIL_ALREADY_EXISTS' &&
        error.message === 'Email already registered'
    );
    assert.equal(queriedEmail, 'existing@example.com');
    assert.equal(userUpdates, 0);
    assert.equal(otpUpserts, 0);
  } finally {
    User.findOne = originalFindOne;
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
    OtpCode.findOneAndUpdate = originalOtpUpsert;
  }
});

test('verification email renders an escaped first name and the spaced six-digit code in both parts', () => {
  const { html, text } = renderVerificationEmail({
    name: '<script>alert(1)</script> Rahman',
    code: '048291',
    expiryMinutes: 10,
    logoUrl: 'https://cdn.example.test/bloodlink-logo.png',
    supportEmail: 'help@bloodlink.example',
    year: 2026,
  });

  assert.doesNotMatch(html, /\{\{/);
  assert.doesNotMatch(text, /\{\{/);
  assert.match(html, /048 291/);
  assert.match(text, /048 291/);
  assert.match(html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /https:\/\/cdn\.example\.test\/bloodlink-logo\.png/);
  assert.doesNotMatch(html, /href=/i);
  assert.match(text, /expires in 10 minutes/);
});

test('generated OTPs are always six numeric digits, including leading-zero values', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateOtp(), /^\d{6}$/);
  }
});

test('location child queries accept specific union and village parent aliases without changing the existing contract', () => {
  const upazilaId = '6af45c376bce675945a7cb0c';
  const unionId = '6af4b2c56bce675945a7eb7d';

  assert.equal(unionsQuerySchema.parse({ query: { upazilaId } }).query.upazilaId, upazilaId);
  assert.equal(villagesQuerySchema.parse({ query: { unionId } }).query.unionId, unionId);
  assert.equal(
    unionsQuerySchema.safeParse({ query: { parentId: upazilaId, upazilaId: unionId } }).success,
    false
  );
  assert.equal(
    villagesQuerySchema.safeParse({ query: { parentId: unionId, unionId: upazilaId } }).success,
    false
  );
});

test('union and village endpoints accept specific parent-id query aliases', async () => {
  const originalUnionFind = Union.find;
  const originalVillageFind = Village.find;
  const upazilaId = '6af45c376bce675945a7cb0c';
  const unionId = '6af4b2c56bce675945a7eb7d';
  let unionFilter;
  let villageFilter;

  Union.find = (filter) => {
    unionFilter = filter;
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => [{ _id: unionId, nameEn: 'Ward No-07', nameBn: 'ওয়ার্ড নং ০৭' }],
    };
  };
  Village.find = (filter) => {
    villageFilter = filter;
    return {
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      lean: async () => [{
        _id: '6af4b2c56bce675945a7ec01',
        unionId,
        nameEn: 'Example Village',
        nameBn: 'নমুনা গ্রাম',
        status: 'approved',
      }],
    };
  };

  const app = express();
  app.use('/v1/locations', locationRoutes);
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1/locations`;
    const unionResponse = await fetch(`${baseUrl}/unions?upazilaId=${upazilaId}&q=Ward`);
    assert.equal(unionResponse.status, 200);
    const unionBody = await unionResponse.json();
    assert.equal(unionBody.success, true);
    assert.equal(unionBody.data.items[0]._id, unionId);
    assert.equal(unionFilter.upazilaId, upazilaId);
    assert.equal(unionFilter.isActive, true);

    const villageResponse = await fetch(`${baseUrl}/villages?unionId=${unionId}`);
    assert.equal(villageResponse.status, 200);
    const villageBody = await villageResponse.json();
    assert.equal(villageBody.success, true);
    assert.equal(villageBody.data.items[0].unionId, unionId);
    assert.equal(villageFilter.unionId, unionId);
    assert.equal(villageFilter.isActive, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    Union.find = originalUnionFind;
    Village.find = originalVillageFind;
  }
});
