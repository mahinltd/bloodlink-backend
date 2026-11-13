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
import {
  createRequest,
  getRequest,
  listRequests,
  listRespondedRequests,
  listSosRequests,
} from '../src/modules/requests/requests.service.js';
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
import { listRequestsSchema } from '../src/modules/requests/requests.validation.js';
import { searchDonorsSchema } from '../src/modules/donors/donors.validation.js';

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

test('create request persists the additional contact and hospital fields', async () => {
  const originals = {
    configFindOne: AppConfig.findOne,
    userFindById: User.findById,
    requestCount: BloodRequest.countDocuments,
    requestCreate: BloodRequest.create,
    requestFindById: BloodRequest.findById,
  };
  let createdRequest;
  AppConfig.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ businessRules: {} }),
  });
  User.findById = async () => ({
    status: 'active',
    createdAt: new Date(Date.now() - 10 * 86400000),
  });
  BloodRequest.countDocuments = async () => 0;
  BloodRequest.create = async (data) => {
    createdRequest = data;
    return { _id: 'request-id' };
  };
  BloodRequest.findById = async () => null;
  invalidateConfigCache();

  try {
    const neededBy = new Date(Date.now() + 4 * 86400000);
    await createRequest('requester-id', {
      patientName: 'Patient',
      patientCondition: 'Post-surgery',
      bloodGroup: 'A+',
      component: 'whole_blood',
      bagsNeeded: 2,
      neededBy,
      hospitalName: 'City Hospital',
      hospitalAddress: 'Dhaka',
      wardOrUnit: 'Ward 5',
      coordinates: { lat: 23.7, lng: 90.4 },
      attendantName: 'Attendant',
      attendantPhone: '01712345678',
      contactPreference: 'call',
      note: { bn: '', en: '' },
    });
    assert.equal(createdRequest.urgency, 'normal');
    assert.equal(createdRequest.patientCondition, 'Post-surgery');
    assert.equal(createdRequest.hospitalAddress, 'Dhaka');
    assert.equal(createdRequest.wardOrUnit, 'Ward 5');
    assert.equal(createdRequest.contactPreference, 'call');
  } finally {
    AppConfig.findOne = originals.configFindOne;
    User.findById = originals.userFindById;
    BloodRequest.countDocuments = originals.requestCount;
    BloodRequest.create = originals.requestCreate;
    BloodRequest.findById = originals.requestFindById;
    invalidateConfigCache();
  }
});

test('request feed applies escaped search, filters, radius and returns pagination totals', async () => {
  const originalAggregate = BloodRequest.aggregate;
  const originalPopulate = BloodRequest.populate;
  const pipelines = [];
  BloodRequest.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    return pipelines.length === 1
      ? [{ attendantPhone: '01712345678', distanceMeters: 1250, urgencyRank: 0 }]
      : [{ total: 22 }];
  };
  BloodRequest.populate = async (items) => items;

  try {
    const data = await listRequests({
      urgency: 'sos',
      bloodGroup: 'A+',
      component: 'platelets',
      divisionId: '6af4b2c56bce675945a7eb7d',
      districtId: '6af4b2c56bce675945a7eb7e',
      upazilaId: '6af4b2c56bce675945a7eb7f',
      q: '[',
      lat: 23.7,
      lng: 90.4,
      radiusKm: 12,
      sort: 'urgency',
      page: 2,
      limit: 10,
    });
    const near = pipelines[0][0].$geoNear;
    assert.equal(near.maxDistance, 12000);
    assert.equal(near.query.component, 'platelets');
    assert.equal(near.query.urgency, 'sos');
    assert.equal(near.query.divisionId.toString(), '6af4b2c56bce675945a7eb7d');
    assert.equal(near.query.$or[0].hospitalName.test('Hospital ['), true);
    assert.equal(pipelines[1][pipelines[1].length - 1].$count, 'total');
    assert.equal(data.total, 22);
    assert.equal(data.hasMore, true);
    assert.equal(data.items[0].distanceKm, 1.3);
    assert.equal(data.items[0].attendantPhone, '01712345678');
  } finally {
    BloodRequest.aggregate = originalAggregate;
    BloodRequest.populate = originalPopulate;
  }
});

test('SOS endpoint returns active requests and banner with nearest-first distance', async () => {
  const originalAggregate = BloodRequest.aggregate;
  const originalPopulate = BloodRequest.populate;
  let pipeline;
  let calls = 0;
  BloodRequest.aggregate = async (value) => {
    pipeline = value;
    calls += 1;
    return calls === 1
      ? [{ _id: 'sos-id', urgency: 'sos', attendantPhone: '01712345678', distanceMeters: 2200 }]
      : [];
  };
  BloodRequest.populate = async (items) => items;

  try {
    const data = await listSosRequests({ lat: 23.7, lng: 90.4, limit: 5, bloodGroup: 'A+' });
    assert.equal(pipeline[0].$geoNear.query.urgency, 'sos');
    assert.equal(pipeline[0].$geoNear.query.bloodGroup, 'A+');
    assert.deepEqual(pipeline.find((stage) => stage.$sort).$sort, { distanceMeters: 1, createdAt: -1 });
    assert.equal(data.items[0].distanceKm, 2.2);
    assert.equal(data.items[0].attendantPhone, '01712345678');
    assert.equal(data.banner._id, 'sos-id');
    const newest = await listSosRequests({ limit: 5 });
    assert.deepEqual(pipeline.find((stage) => stage.$sort).$sort, { createdAt: -1 });
    assert.equal(newest.banner, null);
  } finally {
    BloodRequest.aggregate = originalAggregate;
    BloodRequest.populate = originalPopulate;
  }
});

test('GET /v1/requests/sos is routed before request ids and returns the banner', async () => {
  const originalUserFindById = User.findById;
  const originalAggregate = BloodRequest.aggregate;
  const originalPopulate = BloodRequest.populate;
  User.findById = () => ({
    select() {
      return this;
    },
    lean: async () => ({ status: 'active', emailVerifiedAt: new Date() }),
  });
  BloodRequest.aggregate = async () => [
    { _id: 'sos-id', urgency: 'sos', attendantPhone: '01712345678', distanceMeters: 500 },
  ];
  BloodRequest.populate = async (items) => items;

  const app = express();
  app.set('trust proxy', 1);
  app.use('/v1/requests', requestRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const token = signAccessToken({ sub: '6af4b2c56bce675945a7eb7e', scope: 'user' });
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/v1/requests/sos?lat=23.7&lng=90.4`,
      { headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.40' } }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.banner.attendantPhone, '01712345678');
    assert.equal(body.data.items[0].distanceKm, 0.5);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.findById = originalUserFindById;
    BloodRequest.aggregate = originalAggregate;
    BloodRequest.populate = originalPopulate;
  }
});

test('feed and SOS query validation requires coordinate pairs and nearest coordinates', () => {
  assert.equal(listRequestsSchema.safeParse({ query: { lat: 23.7 } }).success, false);
  assert.equal(listRequestsSchema.safeParse({ query: { sort: 'nearest' } }).success, false);
  assert.equal(listRequestsSchema.safeParse({ query: { component: 'platelets', sort: 'newest' } }).success, true);
});

test('donor search query parses privacy-safe filters and requires coordinates for nearest sorting', () => {
  const parsed = searchDonorsSchema.parse({
    query: {
      bloodGroup: 'A+',
      compatible: 'true',
      availableOnly: 'false',
      eligibleOnly: 'false',
      lat: '23.7',
      lng: '90.4',
      radiusKm: '25',
      sort: 'nearest',
    },
  });
  assert.equal(parsed.query.compatible, true);
  assert.equal(parsed.query.availableOnly, false);
  assert.equal(parsed.query.eligibleOnly, false);
  assert.equal(parsed.query.radiusKm, 25);
  assert.equal(searchDonorsSchema.safeParse({ query: { compatible: 'true' } }).success, false);
  assert.equal(searchDonorsSchema.safeParse({ query: { lat: 23.7 } }).success, false);
});

test('donor directory applies compatibility, location, radius and last-donation privacy', async () => {
  const originalConfigFindOne = AppConfig.findOne;
  const originalAggregate = DonorProfile.aggregate;
  const pipelines = [];
  const lastDonationDate = new Date('2025-01-01T00:00:00Z');
  AppConfig.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ businessRules: {} }),
  });
  DonorProfile.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    return pipeline.some((stage) => stage.$count)
      ? [{ total: 25 }]
      : [{
          userId: 'donor-id',
          user: {
            name: 'Donor',
            avatar: null,
            phone: '01712345678',
            privacy: { showLastDonation: true },
          },
          bloodGroup: 'O+',
          isAvailable: false,
          lastDonationDate,
          healthDeclaration: {},
          distanceMeters: 2400,
          division: [{ nameBn: 'ঢাকা', nameEn: 'Dhaka' }],
          district: [],
          upazila: [],
          union: [],
        }];
  };
  invalidateConfigCache();

  try {
    const data = await searchDonors({
      bloodGroup: 'A+',
      compatible: true,
      divisionId: '6af4b2c56bce675945a7eb7d',
      districtId: '6af4b2c56bce675945a7eb7e',
      upazilaId: '6af4b2c56bce675945a7eb7f',
      unionId: '6af4b2c56bce675945a7eb80',
      availableOnly: false,
      eligibleOnly: false,
      lat: 23.7,
      lng: 90.4,
      radiusKm: 25,
      sort: 'recently_active',
      page: 2,
      limit: 10,
    }, '6af4b2c56bce675945a7eb7e');
    const geoMatch = pipelines[0][0].$geoNear;
    assert.equal(geoMatch.maxDistance, 25000);
    assert.deepEqual(geoMatch.query.bloodGroup.$in, ['A+', 'A-', 'O+', 'O-']);
    assert.equal(geoMatch.query.divisionId.toString(), '6af4b2c56bce675945a7eb7d');
    assert.deepEqual(pipelines[0].find((stage) => stage.$sort).$sort, {
      'user.lastSeen': -1,
      updatedAt: -1,
    });
    assert.equal(data.total, 25);
    assert.equal(data.hasMore, true);
    assert.equal(data.items[0].lastDonationDate, lastDonationDate);
    assert.equal(data.items[0].area.division.en, 'Dhaka');
    assert.equal(data.items[0].distanceKm, 2.4);
    assert.equal('location' in data.items[0], false);
  } finally {
    AppConfig.findOne = originalConfigFindOne;
    DonorProfile.aggregate = originalAggregate;
    invalidateConfigCache();
  }
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
  DonorProfile.aggregate = async (pipeline) => pipeline.some((stage) => stage.$count)
    ? [{ total: 1 }]
    : [{
        userId,
        user: { name: 'Donor', avatar: null, phone, privacy: { showLastDonation: false } },
        bloodGroup: 'A+',
        isAvailable: true,
        lastDonationDate: null,
        healthDeclaration: {},
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
    const donors = await searchDonors({ page: 1, limit: 20, availableOnly: false, eligibleOnly: false }, viewerId);
    assert.equal(donors.items[0].phone, phone);
    assert.equal(donors.total, 1);
    assert.equal(donors.hasMore, false);
    assert.equal('location' in donors.items[0], false);
    assert.equal('lastDonationDate' in donors.items[0], false);
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

test('responded requests are paginated and retain the donor response status', async () => {
  const originalAggregate = RequestResponse.aggregate;
  const originalPopulate = BloodRequest.populate;
  let pipeline;
  RequestResponse.aggregate = async (value) => {
    pipeline = value;
    return [{
      items: [{
        _id: 'response-id',
        status: 'accepted',
        respondedAt: new Date('2026-01-01T00:00:00Z'),
        request: { _id: 'request-id', attendantPhone: '01712345678' },
      }],
      total: [{ count: 21 }],
    }];
  };
  BloodRequest.populate = async (items) => items;

  try {
    const data = await listRespondedRequests('6af4b2c56bce675945a7eb7e', { page: 2, limit: 10 });
    assert.deepEqual(
      pipeline.find((stage) => stage.$match?.['request.isHidden'])?.$match['request.isHidden'],
      { $ne: true }
    );
    assert.equal(pipeline[pipeline.length - 1].$facet.items[0].$skip, 10);
    assert.equal(data.items[0].status, 'accepted');
    assert.equal(data.items[0].request.attendantPhone, '01712345678');
    assert.equal(data.total, 21);
    assert.equal(data.hasMore, true);
  } finally {
    RequestResponse.aggregate = originalAggregate;
    BloodRequest.populate = originalPopulate;
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
