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
