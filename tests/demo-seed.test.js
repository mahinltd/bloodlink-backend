import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDemoData,
  buildFreshRequestTimes,
  generatePhoneNumbers,
} from '../scripts/seedDemo.js';
import { resolveUrgency } from '../src/modules/requests/urgencyRules.js';
import { User } from '../src/modules/users/user.model.js';
import { DonorProfile } from '../src/modules/users/donorProfile.model.js';
import { BloodRequest } from '../src/modules/requests/bloodRequest.model.js';
import { RequestResponse } from '../src/modules/requests/requestResponse.model.js';
import { Conversation } from '../src/modules/chat/conversation.model.js';
import { Message } from '../src/modules/chat/message.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Donation } from '../src/modules/requests/donation.model.js';

const now = new Date('2026-11-13T10:00:00.000Z');
const rules = { sosMaxHours: 6, urgentHours: 24, normalMaxDays: 7 };
const locationIds = {
  divisionId: '111111111111111111111111',
  districtId: '222222222222222222222222',
  upazilaIds: ['333333333333333333333333', '444444444444444444444444'],
};

const nextIdFactory = () => {
  let next = 1;
  return () => `00000000000000000000${String(next++).padStart(4, '0')}`;
};

const build = (options = {}) =>
  buildDemoData({
    center: { lat: 23.8103, lng: 90.4125 },
    now,
    locationIds,
    rules,
    idFactory: nextIdFactory(),
    ...options,
  });

const distanceKm = (first, second) => {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(second.lat - first.lat);
  const dLng = radians(second.lng - first.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

test('demo generator creates valid, unique phone numbers and expected donor/request shapes', () => {
  const data = build();
  const phones = data.users.map((user) => user.phone);
  const ids = Object.values(data)
    .flat()
    .map((document) => document._id);

  assert.equal(data.users.length, 8);
  assert.equal(data.donorProfiles.length, 8);
  assert.equal(data.bloodRequests.length, 9);
  assert.equal(data.donations.length, 16);
  assert.equal(new Set(phones).size, phones.length);
  assert.ok(phones.every((phone) => /^01[3-9]\d{8}$/.test(phone)));
  assert.equal(new Set(ids).size, ids.length);

  const bloodGroups = new Set(data.donorProfiles.map((profile) => profile.bloodGroup));
  for (const group of ['A+', 'O+', 'B+', 'AB+', 'O-', 'A-']) assert.ok(bloodGroups.has(group));
  assert.equal(data.donorProfiles.filter((profile) => !profile.isAvailable).length, 1);
  assert.equal((now - data.donorProfiles[6].lastDonationDate) / 86400000, 30);
  assert.equal(data.donorProfiles.filter((profile) => profile.idVerified).length, 1);
  assert.equal(new Set(data.users.map((user) => user.email)).size, 8);
  assert.ok(data.users.every((user) => user.status === 'active' && user.emailVerifiedAt instanceof Date));
  assert.ok(data.users.every((user) => user.avatar === null && user.consents.phonePublicInApp === true));
  assert.ok(data.users.every((user) => user.consents.phonePublicInAppTermsVersion));

  const urgencyCounts = data.bloodRequests.reduce((counts, request) => {
    counts[request.urgency] = (counts[request.urgency] || 0) + 1;
    assert.equal(resolveUrgency(request.urgency, request.neededBy, rules, now.getTime()), request.urgency);
    assert.equal(request.expiresAt.getTime(), request.neededBy.getTime());
    assert.ok(request.hospitalName.endsWith('(Demo)'));
    return counts;
  }, {});
  assert.deepEqual(urgencyCounts, { sos: 2, urgent: 2, normal: 5 });
  assert.equal(data.bloodRequests.filter((request) => request.status === 'fulfilled').length, 1);
  assert.equal(data.bloodRequests.filter((request) => request.status === 'cancelled').length, 1);

  for (const profile of data.donorProfiles) {
    const [lng, lat] = profile.location.coordinates;
    assert.ok(distanceKm({ lat: 23.8103, lng: 90.4125 }, { lat, lng }) <= 10);
  }
});

test('demo phone generator rejects invalid prefixes and guarantees sequential uniqueness', () => {
  const numbers = generatePhoneNumbers('013123456', 8);
  assert.equal(numbers[0], '01312345601');
  assert.equal(numbers[7], '01312345608');
  assert.equal(new Set(numbers).size, numbers.length);
  assert.throws(() => generatePhoneNumbers('123456789', 8), /9-digit prefix/);
});

test('owner-linked demo records are connected without including or modifying the owner user', () => {
  const ownerId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const data = build({ owner: { _id: ownerId, modes: { donor: true } } });

  assert.equal(data.users.some((user) => user._id === ownerId), false);
  assert.equal(data.bloodRequests.filter((request) => request.requesterId === ownerId).length, 2);
  assert.equal(data.requestResponses.length, 5);
  assert.equal(data.conversations.length, 2);
  assert.equal(data.messages.length, 6);
  assert.equal(data.notifications.length, 4);
  assert.equal(data.donations.length, 18);
  assert.equal(data.conversations.filter((conversation) => conversation.requestId).length, 2);
  assert.ok(data.conversations.every((conversation) => new Set(conversation.participants).size === 2));
  assert.equal(
    new Set(data.conversations.map((conversation) => conversation.participantsKey)).size,
    data.conversations.length
  );
  assert.equal(
    new Set(data.requestResponses.map((response) => `${response.requestId}:${response.donorId}`)).size,
    data.requestResponses.length
  );
  assert.equal(
    new Set(data.notifications.map((notification) => `${notification.userId}:${notification.requestId}:${notification.type}`))
      .size,
    data.notifications.length
  );
  assert.ok(data.conversations.some((conversation) => conversation.unreadCounts[ownerId] > 0));
});

test('generated documents pass existing model validators without connecting to a database', async () => {
  const data = build({ owner: { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', modes: { donor: true } } });
  const groups = [
    [User, data.users.map((user) => ({ ...user, passwordHash: 'unusable-test-hash' }))],
    [DonorProfile, data.donorProfiles],
    [BloodRequest, data.bloodRequests],
    [RequestResponse, data.requestResponses],
    [Conversation, data.conversations],
    [Message, data.messages],
    [Notification, data.notifications],
    [Donation, data.donations],
  ];
  for (const [Model, documents] of groups) {
    await Promise.all(documents.map((document) => new Model(document).validate()));
  }
});

test('fresh demo request times stay in the configured urgency windows', () => {
  const requests = [
    { _id: 's1', urgency: 'sos' },
    { _id: 's2', urgency: 'sos' },
    { _id: 'u1', urgency: 'urgent' },
    { _id: 'n1', urgency: 'normal' },
    { _id: 'n2', urgency: 'normal' },
  ];
  const refreshed = buildFreshRequestTimes(requests, rules, now);
  assert.equal(refreshed.length, requests.length);
  for (const request of refreshed) {
    assert.ok(request.neededBy > now);
    assert.equal(request.expiresAt.getTime(), request.neededBy.getTime());
    const urgency = requests.find((candidate) => candidate._id === request._id).urgency;
    assert.equal(resolveUrgency(urgency, request.neededBy, rules, now.getTime()), urgency);
  }
});
