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
import { getBusinessRules, invalidateConfigCache } from '../src/modules/config/config.service.js';
import { AppConfig } from '../src/modules/config/appConfig.model.js';
import { DonorProfile } from '../src/modules/users/donorProfile.model.js';
import { getMe, acceptTerms } from '../src/modules/users/users.service.js';
import { getDonor, revealPhone, searchDonors } from '../src/modules/donors/donors.service.js';
import { getRequest } from '../src/modules/requests/requests.service.js';
import { BloodRequest } from '../src/modules/requests/bloodRequest.model.js';
import { RequestResponse } from '../src/modules/requests/requestResponse.model.js';
import { expectedUrgency, normalMaxDays, resolveUrgency } from '../src/modules/requests/urgencyRules.js';
import { signAccessToken } from '../src/utils/jwt.util.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { donorDirectoryLimiter, requestFeedLimiter } from '../src/middlewares/rateLimiter.middleware.js';
import requestRoutes from '../src/modules/requests/requests.routes.js';
import locationRoutes from '../src/modules/locations/locations.routes.js';
import { Union } from '../src/modules/locations/union.model.js';
import { Village } from '../src/modules/locations/village.model.js';
import { renderVerificationEmail } from '../src/modules/notifications/emailTemplates.js';
import { generateOtp } from '../src/utils/otp.util.js';
import { unionsQuerySchema, villagesQuerySchema } from '../src/modules/locations/locations.validation.js';
import { donorProfileSchema } from '../src/modules/users/users.validation.js';
import { registerSchema } from '../src/modules/auth/auth.validation.js';

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

test('donor registration requires explicit phone-public consent before creating an account', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let created = false;
  User.findOne = async () => null;
  User.create = async () => {
    created = true;
  };

  try {
    await assert.rejects(
      register({ role: 'donor', email: 'donor@example.com', consents: { phonePublicInApp: false } }, {}),
      (error) => error.code === 'PHONE_CONSENT_REQUIRED'
    );
    assert.equal(created, false);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test('donor registration and donor-mode payload validation require phone-public consent', () => {
  const donor = {
    bloodGroup: 'A+',
    dob: '1990-01-01',
    gender: 'male',
    weightKg: 70,
    coordinates: { lat: 23.7, lng: 90.4 },
  };
  const registration = {
    role: 'donor',
    name: 'Example Donor',
    phone: '01712345678',
    email: 'donor@example.com',
    password: 'secure-password1',
    consents: { termsAccepted: true, contactAllowed: true, noBloodSelling: true },
    donor,
  };
  assert.equal(registerSchema.safeParse({ body: registration }).success, false);
  assert.equal(
    registerSchema.safeParse({
      body: { ...registration, consents: { ...registration.consents, phonePublicInApp: true } },
    }).success,
    true
  );
  assert.equal(donorProfileSchema.safeParse({ body: donor }).success, false);
  assert.equal(
    donorProfileSchema.safeParse({ body: { ...donor, consents: { phonePublicInApp: true } } }).success,
    true
  );
});

test('urgency defaults follow the configured windows and reject mismatched selections', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');
  const hours = (value) => now + value * 60 * 60 * 1000;
  const rules = { sosMaxHours: 6, urgentHours: 24 };

  assert.equal(expectedUrgency(hours(6), rules, now), 'sos');
  assert.equal(expectedUrgency(hours(6) + 1, rules, now), 'urgent');
  assert.equal(expectedUrgency(hours(24), rules, now), 'urgent');
  assert.equal(expectedUrgency(hours(24) + 1, rules, now), 'normal');
  assert.equal(resolveUrgency(undefined, hours(3), rules, now), 'sos');
  assert.equal(normalMaxDays({ normalMaxDays: 7, urgentHours: 24 }), 7);
  assert.throws(
    () => normalMaxDays({ normalMaxDays: 1, urgentHours: 24 }),
    (error) => error.code === 'INVALID_URGENCY_CONFIG'
  );
  assert.throws(
    () => resolveUrgency('urgent', hours(3), rules, now),
    (error) => error.code === 'URGENCY_WINDOW_MISMATCH'
  );
});

test('legacy urgentThresholdHours no longer overrides SOS and urgent windows', async () => {
  const originalFindOne = AppConfig.findOne;
  AppConfig.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ businessRules: { matching: { urgentThresholdHours: 48 } } }),
  });
  invalidateConfigCache();

  try {
    const rules = await getBusinessRules();
    assert.equal(rules.matching.sosMaxHours, 6);
    assert.equal(rules.matching.urgentHours, 24);
    assert.equal(rules.matching.urgentThresholdHours, 24);
  } finally {
    AppConfig.findOne = originalFindOne;
    invalidateConfigCache();
  }
});

test('GET me reports outdated terms and accept-terms only accepts the current version', async () => {
  const originalConfigFindOne = AppConfig.findOne;
  const originalUserFindById = User.findById;
  const originalDonorFindOne = DonorProfile.findOne;
  const user = {
    status: 'active',
    acceptedTermsVersion: '1.0.0',
    consents: { termsAcceptedAt: null },
    toJSON() {
      return { acceptedTermsVersion: this.acceptedTermsVersion };
    },
    async save() {},
  };
  AppConfig.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ termsVersion: '2.0.0' }),
  });
  User.findById = async () => user;
  DonorProfile.findOne = () => ({ lean: async () => null });
  invalidateConfigCache();

  try {
    const me = await getMe('user-id');
    assert.equal(me.termsVersion, '2.0.0');
    assert.equal(me.needsTermsAcceptance, true);
    await assert.rejects(
      acceptTerms('user-id', '1.0.0'),
      (error) => error.code === 'TERMS_VERSION_MISMATCH'
    );
    const accepted = await acceptTerms('user-id', '2.0.0');
    assert.deepEqual(accepted, { accepted: true, acceptedTermsVersion: '2.0.0' });
    assert.equal(user.acceptedTermsVersion, '2.0.0');
  } finally {
    AppConfig.findOne = originalConfigFindOne;
    User.findById = originalUserFindById;
    DonorProfile.findOne = originalDonorFindOne;
    invalidateConfigCache();
  }
});

test('donor and request phones are available to verified viewers regardless of legacy privacy settings', async () => {
  const originals = {
    configFindOne: AppConfig.findOne,
    profileFindOne: DonorProfile.findOne,
    profileAggregate: DonorProfile.aggregate,
    userFindById: User.findById,
    userFindOne: User.findOne,
    requestFindById: BloodRequest.findById,
    responseCount: RequestResponse.countDocuments,
    responseFindOne: RequestResponse.findOne,
  };
  const userId = '6af4b2c56bce675945a7eb7d';
  const viewerId = '6af4b2c56bce675945a7eb7e';
  const phone = '01712345678';
  AppConfig.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ businessRules: {} }),
  });
  DonorProfile.findOne = () => ({
    populate() {
      return this;
    },
    lean: async () => ({
      userId,
      bloodGroup: 'A+',
      isAvailable: false,
      lastDonationDate: null,
      healthDeclaration: {},
      location: { coordinates: [90, 23] },
      districtId: { nameBn: 'ঢাকা', nameEn: 'Dhaka' },
      upazilaId: null,
    }),
    select() {
      return this;
    },
  });
  DonorProfile.aggregate = async () => [{
    userId,
    user: { name: 'Donor', avatar: null, phone },
    bloodGroup: 'A+',
    isAvailable: true,
    createdAt: new Date(),
  }];
  User.findById = () => ({
    select() {
      return this;
    },
    lean: async () => ({
      name: 'Donor',
      avatar: null,
      phone,
      privacy: { showPhone: 'never' },
      status: 'active',
      emailVerifiedAt: new Date(),
      modes: { donor: true },
    }),
  });
  User.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => ({ phone, status: 'active', emailVerifiedAt: new Date() }),
  });
  BloodRequest.findById = () => ({
    populate() {
      return this;
    },
    lean: async () => ({
      requesterId: { _id: userId },
      attendantPhone: phone,
      isHidden: false,
    }),
  });
  RequestResponse.countDocuments = async () => 0;
  RequestResponse.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  invalidateConfigCache();

  try {
    const donors = await searchDonors({ page: 1, limit: 20 }, viewerId);
    assert.equal(donors.items[0].phone, phone);
    const donor = await getDonor(userId, viewerId, {});
    assert.equal(donor.donor.phone, phone);
    assert.equal(await revealPhone(viewerId, userId).then((result) => result.phone), phone);
    const request = await getRequest('request-id', userId);
    assert.equal(request.request.attendantPhone, phone);
  } finally {
    AppConfig.findOne = originals.configFindOne;
    DonorProfile.findOne = originals.profileFindOne;
    DonorProfile.aggregate = originals.profileAggregate;
    User.findById = originals.userFindById;
    User.findOne = originals.userFindOne;
    BloodRequest.findById = originals.requestFindById;
    RequestResponse.countDocuments = originals.responseCount;
    RequestResponse.findOne = originals.responseFindOne;
    invalidateConfigCache();
  }
});

test('protected request feed rejects anonymous and unverified users', async () => {
  const originalFindById = User.findById;
  User.findById = () => ({
    select() {
      return this;
    },
    lean: async () => ({ status: 'active', emailVerifiedAt: null }),
  });
  const app = express();
  app.use('/v1/requests', requestRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const url = `http://127.0.0.1:${server.address().port}/v1/requests`;
    const anonymous = await fetch(url);
    assert.equal(anonymous.status, 401);

    const token = signAccessToken({ sub: '6af4b2c56bce675945a7eb7e', scope: 'user' });
    const unverified = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(unverified.status, 401);
    assert.equal((await unverified.json()).error.code, 'ACCOUNT_NOT_ACTIVE');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originalFindById;
  }
});

test('phone-bearing donor reads are limited to 60 requests per 15 minutes', async () => {
  const app = express();
  app.get('/', donorDirectoryLimiter, (_req, res) => res.json({ success: true }));
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (let index = 0; index < 60; index += 1) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
    }
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('phone-bearing request reads are limited to 60 requests per 15 minutes', async () => {
  const app = express();
  app.get('/', requestFeedLimiter, (_req, res) => res.json({ success: true }));
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (let index = 0; index < 60; index += 1) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
    }
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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
