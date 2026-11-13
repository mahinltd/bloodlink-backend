import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { resolveUrgency } from '../src/modules/requests/urgencyRules.js';
import { User } from '../src/modules/users/user.model.js';
import { DonorProfile } from '../src/modules/users/donorProfile.model.js';
import { BloodRequest } from '../src/modules/requests/bloodRequest.model.js';
import { RequestResponse } from '../src/modules/requests/requestResponse.model.js';
import { Conversation } from '../src/modules/chat/conversation.model.js';
import { Message } from '../src/modules/chat/message.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Donation } from '../src/modules/requests/donation.model.js';
import { Division } from '../src/modules/locations/division.model.js';
import { District } from '../src/modules/locations/district.model.js';
import { Upazila } from '../src/modules/locations/upazila.model.js';
import { getBusinessRules, getTermsVersion } from '../src/modules/config/config.service.js';

export const DEMO_BATCH_ID = 'bloodlink-demo-v1';
export const DEMO_LOG_COLLECTION = 'demoSeedLog';
export const DEFAULT_CENTER = { lat: 23.8103, lng: 90.4125 };
export const DEFAULT_PHONE_BASE = '013000000';
export const DEFAULT_URGENCY_RULES = { sosMaxHours: 6, urgentHours: 24, normalMaxDays: 7 };

const DEMO_DONORS = [
  { name: 'Mina Rahman', slug: 'mina.rahman', bloodGroup: 'A+', gender: 'female' },
  { name: 'Rafiq Hasan', slug: 'rafiq.hasan', bloodGroup: 'O+', gender: 'male' },
  { name: 'Nusrat Jahan', slug: 'nusrat.jahan', bloodGroup: 'B+', gender: 'female' },
  { name: 'Sajid Ahmed', slug: 'sajid.ahmed', bloodGroup: 'AB+', gender: 'male' },
  { name: 'Sumaiya Akter', slug: 'sumaiya.akter', bloodGroup: 'O-', gender: 'female' },
  { name: 'Tanim Chowdhury', slug: 'tanim.chowdhury', bloodGroup: 'A-', gender: 'male' },
  { name: 'Farhana Islam', slug: 'farhana.islam', bloodGroup: 'B-', gender: 'female' },
  { name: 'Imran Kabir', slug: 'imran.kabir', bloodGroup: 'AB-', gender: 'male' },
];

const DONOR_DISTANCES_KM = [0.8, 1.9, 3.1, 4.4, 5.8, 7.2, 8.3, 9.4];
const REQUEST_DISTANCES_KM = [0.6, 1.7, 2.8, 4.2, 5.5, 6.6, 8.8, 3.9, 7.6];
const DONOR_COLLECTIONS = {
  users: User,
  donorProfiles: DonorProfile,
  bloodRequests: BloodRequest,
  requestResponses: RequestResponse,
  conversations: Conversation,
  messages: Message,
  notifications: Notification,
  donations: Donation,
};
const CLEANUP_ORDER = [
  'notifications',
  'messages',
  'conversations',
  'requestResponses',
  'donations',
  'bloodRequests',
  'donorProfiles',
  'users',
];

const INDEX_REQUIREMENTS = [
  {
    model: User,
    label: 'unique user email',
    key: { email: 1 },
    options: { unique: true },
  },
  {
    model: DonorProfile,
    label: 'unique donor profile per user',
    key: { userId: 1 },
    options: { unique: true },
  },
  {
    model: BloodRequest,
    label: 'request geospatial search',
    key: { location: '2dsphere' },
  },
  {
    model: BloodRequest,
    label: 'request status/urgency/expiry queries',
    key: { status: 1, urgency: 1, expiresAt: 1 },
  },
  {
    model: BloodRequest,
    label: 'request status/hidden/expiry queries',
    key: { status: 1, isHidden: 1, expiresAt: 1 },
  },
  {
    model: DonorProfile,
    label: 'donor geospatial search and matching',
    key: { location: '2dsphere' },
  },
  {
    model: DonorProfile,
    label: 'donor blood-group/location filters',
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
    model: RequestResponse,
    label: 'unique response per donor/request',
    key: { requestId: 1, donorId: 1 },
    options: { unique: true },
  },
  {
    model: Conversation,
    label: 'unique conversation participant pair',
    key: { participantsKey: 1 },
    options: { unique: true },
  },
  {
    model: Donation,
    label: 'unique donation per request/donor',
    key: { requestId: 1, donorId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { requestId: { $type: 'objectId' } },
    },
  },
  {
    model: Notification,
    label: 'unique request notification per user/type',
    key: { userId: 1, requestId: 1, type: 1 },
    options: {
      unique: true,
      partialFilterExpression: { requestId: { $exists: true } },
    },
  },
];

const idString = (id) => String(id);
const dateDaysAgo = (now, days) => new Date(now.getTime() - days * 86400000);
const dateHoursAhead = (now, hours) => new Date(now.getTime() + hours * 3600000);

const validateCenter = (center) => {
  if (
    !center ||
    !Number.isFinite(center.lat) ||
    center.lat < -90 ||
    center.lat > 90 ||
    !Number.isFinite(center.lng) ||
    center.lng < -180 ||
    center.lng > 180
  ) {
    throw new Error('Center coordinates must have valid latitude and longitude');
  }
};

export const generatePhoneNumbers = (phoneBase = DEFAULT_PHONE_BASE, count = 8) => {
  if (!/^01[3-9]\d{6}$/.test(phoneBase)) {
    throw new Error('phone-base must be a 9-digit prefix matching 01[3-9] followed by 6 digits');
  }
  if (!Number.isInteger(count) || count < 1 || count > 99) {
    throw new Error('Phone count must be an integer from 1 to 99');
  }
  return Array.from({ length: count }, (_value, index) => `${phoneBase}${String(index + 1).padStart(2, '0')}`);
};

export const offsetCoordinates = (center, distanceKm, bearingDegrees) => {
  validateCenter(center);
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(bearingDegrees)) {
    throw new Error('Distance and bearing must be finite numbers');
  }
  const earthRadiusKm = 6371;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const angularDistance = distanceKm / earthRadiusKm;
  const latitude = (center.lat * Math.PI) / 180;
  const longitude = (center.lng * Math.PI) / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const targetLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude)
    );
  const lng = ((((targetLongitude * 180) / Math.PI) + 540) % 360) - 180;
  return { lat: (targetLatitude * 180) / Math.PI, lng };
};

const chooseOffsets = (targets, minimumExclusive, maximumInclusive) => {
  const span = maximumInclusive - minimumExclusive;
  if (!Number.isFinite(span) || span <= 0.001) {
    throw new Error('Configured urgency windows are too narrow to create valid demo requests');
  }
  const lower = minimumExclusive + Math.min(span / 1000, 1 / 60);
  const selected = targets.map((target) => Math.min(maximumInclusive, Math.max(lower, target)));
  if (selected.every((value, index) => index === 0 || value > selected[index - 1])) return selected;
  return targets.map((_target, index) => minimumExclusive + (span * (index + 1)) / (targets.length + 1));
};

const getUrgencyOffsets = (rules) => {
  const sosMaxHours = Number(rules?.sosMaxHours ?? DEFAULT_URGENCY_RULES.sosMaxHours);
  const urgentHours = Number(rules?.urgentHours ?? DEFAULT_URGENCY_RULES.urgentHours);
  const normalMaxHours = Number(rules?.normalMaxDays ?? DEFAULT_URGENCY_RULES.normalMaxDays) * 24;
  if (
    !Number.isFinite(sosMaxHours) ||
    !Number.isFinite(urgentHours) ||
    !Number.isFinite(normalMaxHours) ||
    sosMaxHours <= 0 ||
    urgentHours <= sosMaxHours ||
    normalMaxHours <= urgentHours
  ) {
    throw new Error('Published urgency windows are invalid for demo request creation');
  }
  return {
    sos: chooseOffsets([2, 5], 0, sosMaxHours),
    urgent: chooseOffsets([10, 20], sosMaxHours, urgentHours),
    normal: chooseOffsets([48, 96, 144], urgentHours, normalMaxHours),
    sosMaxHours,
    urgentHours,
    normalMaxHours,
  };
};

const createRequestDocument = ({
  idFactory,
  now,
  rules,
  urgency,
  offsetHours,
  status,
  requesterId,
  donorIndex,
  requestIndex,
  locationIds,
  center,
  phoneNumbers,
}) => {
  const donor = DEMO_DONORS[donorIndex];
  const neededBy = dateHoursAhead(now, offsetHours);
  const resolvedUrgency = resolveUrgency(urgency, neededBy, rules, now.getTime());
  if (resolvedUrgency !== urgency) {
    throw new Error(`Generated ${urgency} request falls in the ${resolvedUrgency} window`);
  }

  const distanceKm = REQUEST_DISTANCES_KM[requestIndex % REQUEST_DISTANCES_KM.length];
  const coordinates = offsetCoordinates(center, distanceKm, (requestIndex * 43 + 17) % 360);
  const hospitalNames = [
    'Dhaka Medical College Hospital',
    'Shaheed Suhrawardy Medical College Hospital',
    'Sir Salimullah Medical College Mitford Hospital',
    'National Institute of Cardiovascular Diseases',
    'National Institute of Cancer Research and Hospital',
    'Bangladesh Medical College Hospital',
  ];
  const components = ['whole_blood', 'platelets', 'plasma'];
  const relations = ['Family Member', 'Patient Attendant', 'Sibling', 'Spouse'];
  const contacts = ['any', 'call', 'sms', 'chat'];
  const bagsNeeded = (requestIndex % 3) + 1;
  const fulfilled = status === 'fulfilled';
  const cancelled = status === 'cancelled';

  return {
    _id: idFactory(),
    requesterId,
    patientName: `Demo Patient ${requestIndex + 1}`,
    bloodGroup: donor.bloodGroup,
    component: components[requestIndex % components.length],
    bagsNeeded,
    bagsCollected: fulfilled ? bagsNeeded : 0,
    neededBy,
    urgency,
    hospitalId: null,
    hospitalName: `${hospitalNames[requestIndex % hospitalNames.length]} (Demo)`,
    hospitalAddress: `${requestIndex + 1} Demo Road, Dhaka`,
    wardOrUnit: `Ward ${(requestIndex % 8) + 1}`,
    location: { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] },
    divisionId: locationIds.divisionId,
    districtId: locationIds.districtId,
    upazilaId: locationIds.upazilaIds[requestIndex % locationIds.upazilaIds.length],
    attendantName: donor.name,
    attendantRelation: relations[requestIndex % relations.length],
    attendantPhone: phoneNumbers[donorIndex],
    contactPreference: contacts[requestIndex % contacts.length],
    patientCondition: ['Post-surgery care', 'Severe anemia', 'Accident injury'][requestIndex % 3],
    note: {
      bn: 'এটি পরীক্ষার জন্য তৈরি ডেমো রিকোয়েস্ট।',
      en: 'This is a demo request created for testing.',
    },
    status,
    expiresAt: neededBy,
    createdAt: status === 'open' ? dateDaysAgo(now, 0.25) : dateDaysAgo(now, 3),
    updatedAt: status === 'open' ? dateDaysAgo(now, 0.25) : dateDaysAgo(now, 1),
    isHidden: false,
    consentAccepted: true,
    matchRadiusKm: 10,
    fulfilledAt: fulfilled ? dateDaysAgo(now, 1) : null,
    cancelledAt: cancelled ? dateDaysAgo(now, 1) : null,
  };
};

const makeConversationAndMessages = ({ idFactory, ownerId, donorId, requestId, now, reverseUnread }) => {
  const conversationId = idFactory();
  const participants = [ownerId, donorId];
  const participantsKey = participants.map(idString).sort().join('_');
  const senders = reverseUnread ? [ownerId, donorId, ownerId] : [ownerId, donorId, donorId];
  const texts = [
    'Hello, I saw your donor/request details.',
    'Thank you for reaching out. I can share more information.',
    'Please let me know if you need anything else.',
  ];
  const messages = texts.map((text, index) => ({
    _id: idFactory(),
    conversationId,
    senderId: senders[index],
    text,
    imageUrl: null,
    status: index === 0 ? 'seen' : 'sent',
    createdAt: new Date(now.getTime() - (15 - index * 5) * 60000),
    updatedAt: new Date(now.getTime() - (15 - index * 5) * 60000),
  }));
  const last = messages[messages.length - 1];
  const ownerUnreadCount = reverseUnread ? 0 : 2;
  const donorUnreadCount = reverseUnread ? 1 : 0;
  return {
    conversation: {
      _id: conversationId,
      participants,
      participantsKey,
      requestId,
      createdAt: new Date(now.getTime() - 16 * 60000),
      updatedAt: last.createdAt,
      lastMessage: {
        text: last.text,
        imageUrl: last.imageUrl,
        senderId: last.senderId,
        createdAt: last.createdAt,
      },
      unreadCounts: {
        [idString(ownerId)]: ownerUnreadCount,
        [idString(donorId)]: donorUnreadCount,
      },
    },
    messages,
  };
};

export const buildDemoData = ({
  center = DEFAULT_CENTER,
  now = new Date(),
  phoneBase = DEFAULT_PHONE_BASE,
  locationIds,
  rules = DEFAULT_URGENCY_RULES,
  termsVersion = '1.0.0',
  owner = null,
  idFactory = randomUUID,
} = {}) => {
  validateCenter(center);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('now must be a valid Date');
  if (
    !locationIds?.divisionId ||
    !locationIds?.districtId ||
    !Array.isArray(locationIds.upazilaIds) ||
    locationIds.upazilaIds.length === 0
  ) {
    throw new Error('At least one real division, district, and upazila id is required');
  }

  const phoneNumbers = generatePhoneNumbers(phoneBase, DEMO_DONORS.length);
  const offsets = getUrgencyOffsets(rules);
  const users = [];
  const donorProfiles = [];
  const donations = [];
  const userIds = DEMO_DONORS.map(() => idFactory());
  const donorProfileIds = DEMO_DONORS.map(() => idFactory());

  DEMO_DONORS.forEach((donor, index) => {
    const userId = userIds[index];
    const lastDonationDaysAgo = index === 6 ? 30 : 180 + index * 9;
    users.push({
      _id: userId,
      email: `demo.${donor.slug}@demo.bloodlink.invalid`,
      name: donor.name,
      phone: phoneNumbers[index],
      avatar: null,
      status: 'active',
      emailVerifiedAt: new Date(now),
      modes: { donor: true, requester: true },
      language: index % 2 === 0 ? 'bn' : 'en',
      theme: 'system',
      acceptedTermsVersion: termsVersion,
      privacy: { showPhone: 'always', showLastDonation: index % 2 === 0 },
      consents: {
        termsAcceptedAt: new Date(now),
        phonePublicInApp: true,
        phonePublicInAppAcceptedAt: new Date(now),
        phonePublicInAppTermsVersion: termsVersion,
        contactAllowed: true,
        noBloodSelling: true,
      },
      notificationPrefs: {
        push: true,
        email: true,
        urgentRequests: true,
        normalRequests: true,
        responses: true,
        messages: true,
        motivation: true,
      },
    });

    const location = offsetCoordinates(center, DONOR_DISTANCES_KM[index], (index * 47 + 28) % 360);
    donorProfiles.push({
      _id: donorProfileIds[index],
      userId,
      bloodGroup: donor.bloodGroup,
      dob: new Date(now.getTime() - (24 + index * 2) * 365.25 * 86400000),
      gender: donor.gender,
      weightKg: 54 + index * 3,
      lastDonationDate: dateDaysAgo(now, lastDonationDaysAgo),
      donationCount: 2 + (index % 3),
      healthDeclaration: {
        recentIllness: [],
        surgery: false,
        tattooOrPiercing: false,
        onMedication: false,
        pregnantOrBreastfeeding: false,
        chronicDisease: false,
      },
      isAvailable: index !== 5,
      radiusKm: 10,
      nightOk: index % 2 === 0,
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      divisionId: locationIds.divisionId,
      districtId: locationIds.districtId,
      upazilaId: locationIds.upazilaIds[index % locationIds.upazilaIds.length],
      isLocationVerified: true,
      idVerified: index === 2,
      idVerifiedAt: index === 2 ? dateDaysAgo(now, 90) : null,
    });

    donations.push(
      {
        _id: idFactory(),
        requestId: null,
        donorId: userId,
        requesterId: null,
        confirmedBy: null,
        date: dateDaysAgo(now, lastDonationDaysAgo),
      },
      {
        _id: idFactory(),
        requestId: null,
        donorId: userId,
        requesterId: null,
        confirmedBy: null,
        date: dateDaysAgo(now, lastDonationDaysAgo + 210),
      }
    );
  });

  const bloodRequests = [];
  const coreRequestIds = [];
  const requestTemplates = [
    { urgency: 'sos', offsetIndex: 0, status: 'open' },
    { urgency: 'sos', offsetIndex: 1, status: 'open' },
    { urgency: 'urgent', offsetIndex: 0, status: 'open' },
    { urgency: 'urgent', offsetIndex: 1, status: 'open' },
    { urgency: 'normal', offsetIndex: 0, status: 'open' },
    { urgency: 'normal', offsetIndex: 1, status: 'open' },
    { urgency: 'normal', offsetIndex: 2, status: 'open' },
    { urgency: 'normal', offsetIndex: 1, status: 'fulfilled' },
    { urgency: 'normal', offsetIndex: 2, status: 'cancelled' },
  ];
  requestTemplates.forEach((template, index) => {
    const request = createRequestDocument({
      idFactory,
      now,
      rules,
      urgency: template.urgency,
      offsetHours: offsets[template.urgency][template.offsetIndex],
      status: template.status,
      requesterId: userIds[index % userIds.length],
      donorIndex: index % userIds.length,
      requestIndex: index,
      locationIds,
      center,
      phoneNumbers,
    });
    bloodRequests.push(request);
    coreRequestIds.push(request._id);
  });

  const requestResponses = [];
  const conversations = [];
  const messages = [];
  const notifications = [];
  if (owner?._id) {
    const ownerOpenRequest = createRequestDocument({
      idFactory,
      now,
      rules,
      urgency: 'normal',
      offsetHours: offsets.normal[0],
      status: 'open',
      requesterId: owner._id,
      donorIndex: 0,
      requestIndex: 9,
      locationIds,
      center,
      phoneNumbers,
    });
    const ownerFulfilledRequest = createRequestDocument({
      idFactory,
      now,
      rules,
      urgency: 'normal',
      offsetHours: offsets.normal[1],
      status: 'fulfilled',
      requesterId: owner._id,
      donorIndex: 1,
      requestIndex: 10,
      locationIds,
      center,
      phoneNumbers,
    });
    bloodRequests.push(ownerOpenRequest, ownerFulfilledRequest);

    ['accepted', 'declined', 'accepted'].forEach((status, index) => {
      requestResponses.push({
        _id: idFactory(),
        requestId: ownerOpenRequest._id,
        donorId: userIds[index],
        status,
        respondedAt: new Date(now.getTime() - (index + 1) * 3600000),
        createdAt: new Date(now.getTime() - (index + 1) * 3600000),
        updatedAt: new Date(now.getTime() - (index + 1) * 3600000),
      });
    });
    requestResponses.push(
      {
        _id: idFactory(),
        requestId: coreRequestIds[2],
        donorId: owner._id,
        status: 'accepted',
        respondedAt: new Date(now.getTime() - 30 * 60000),
        createdAt: new Date(now.getTime() - 30 * 60000),
        updatedAt: new Date(now.getTime() - 30 * 60000),
      },
      {
        _id: idFactory(),
        requestId: coreRequestIds[4],
        donorId: owner._id,
        status: 'declined',
        respondedAt: new Date(now.getTime() - 20 * 60000),
        createdAt: new Date(now.getTime() - 20 * 60000),
        updatedAt: new Date(now.getTime() - 20 * 60000),
      }
    );

    const firstConversation = makeConversationAndMessages({
      idFactory,
      ownerId: owner._id,
      donorId: userIds[0],
      requestId: ownerOpenRequest._id,
      now,
      reverseUnread: false,
    });
    const secondConversation = makeConversationAndMessages({
      idFactory,
      ownerId: owner._id,
      donorId: userIds[1],
      requestId: coreRequestIds[2],
      now,
      reverseUnread: true,
    });
    conversations.push(firstConversation.conversation, secondConversation.conversation);
    messages.push(...firstConversation.messages, ...secondConversation.messages);

    const notificationRequests = [
      { type: 'request_sos', request: bloodRequests[0], readAt: null },
      { type: 'request_urgent', request: bloodRequests[2], readAt: dateDaysAgo(now, 0.01) },
      { type: 'request_normal', request: bloodRequests[4], readAt: dateDaysAgo(now, 0.02) },
      { type: 'message', request: ownerOpenRequest, readAt: null },
    ];
    const titles = {
      request_sos: { bn: 'জরুরি SOS রক্তের অনুরোধ', en: 'SOS blood request' },
      request_urgent: { bn: 'জরুরি রক্তের অনুরোধ', en: 'Urgent blood request' },
      request_normal: { bn: 'নতুন রক্তের অনুরোধ', en: 'New blood request' },
      message: { bn: 'নতুন বার্তা', en: 'New message' },
    };
    notificationRequests.forEach(({ type, request, readAt }) => {
      notifications.push({
        _id: idFactory(),
        userId: owner._id,
        requestId: request._id,
        type,
        createdAt: type === 'message' ? new Date(now.getTime() - 4 * 60000) : dateDaysAgo(now, 0.04),
        updatedAt: type === 'message' ? new Date(now.getTime() - 4 * 60000) : dateDaysAgo(now, 0.04),
        title: titles[type],
        body: {
          bn: `${request.hospitalName} · ${request.bagsNeeded} ব্যাগ`,
          en: `${request.hospitalName} · ${request.bagsNeeded} bag(s)`,
        },
        data: {
          requestId: idString(request._id),
          ...(type === 'message'
            ? {
                conversationId: idString(firstConversation.conversation._id),
                messageId: idString(firstConversation.messages[2]._id),
              }
            : { urgency: request.urgency, bloodGroup: request.bloodGroup }),
        },
        readAt,
      });
    });

    if (owner.modes?.donor === true) {
      donations.push(
        {
          _id: idFactory(),
          requestId: null,
          donorId: owner._id,
          requesterId: null,
          confirmedBy: null,
          date: dateDaysAgo(now, 210),
        },
        {
          _id: idFactory(),
          requestId: null,
          donorId: owner._id,
          requesterId: null,
          confirmedBy: null,
          date: dateDaysAgo(now, 510),
        }
      );
    }
  }

  return {
    users,
    donorProfiles,
    bloodRequests,
    requestResponses,
    conversations,
    messages,
    notifications,
    donations,
  };
};

export const buildFreshRequestTimes = (requests, rules, now = new Date()) => {
  const windows = getUrgencyOffsets(rules);
  const grouped = new Map();
  for (const request of [...requests].sort((a, b) => idString(a._id).localeCompare(idString(b._id)))) {
    if (!['sos', 'urgent', 'normal'].includes(request.urgency)) {
      throw new Error(`Cannot refresh request ${request._id}: unknown urgency "${request.urgency}"`);
    }
    if (!grouped.has(request.urgency)) grouped.set(request.urgency, []);
    grouped.get(request.urgency).push(request);
  }
  const result = [];
  for (const [urgency, group] of grouped) {
    const minimum = urgency === 'sos' ? 0 : urgency === 'urgent' ? windows.sosMaxHours : windows.urgentHours;
    const maximum =
      urgency === 'sos'
        ? windows.sosMaxHours
        : urgency === 'urgent'
          ? windows.urgentHours
          : windows.normalMaxHours;
    const offsets = group.map((_request, index) => minimum + ((maximum - minimum) * (index + 1)) / (group.length + 1));
    group.forEach((request, index) => {
      const neededBy = dateHoursAhead(now, offsets[index]);
      resolveUrgency(urgency, neededBy, rules, now.getTime());
      result.push({ _id: request._id, neededBy, expiresAt: neededBy });
    });
  }
  return result;
};

export const parseArguments = (args) => {
  const values = new Map();
  const flags = new Set();
  const valueOptions = new Set(['--owner-email', '--lat', '--lng', '--phone-base', '--confirm-db']);
  const flagOptions = new Set(['--apply', '--refresh', '--cleanup', '--dry-run', '--force']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueOptions.has(arg)) {
      if (values.has(arg) || !args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(`Expected one value after ${arg}`);
      }
      values.set(arg, args[index + 1]);
      index += 1;
    } else if (flagOptions.has(arg)) {
      if (flags.has(arg)) throw new Error(`Duplicate option ${arg}`);
      flags.add(arg);
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  const operations = ['--apply', '--refresh', '--cleanup'].filter((flag) => flags.has(flag));
  if (operations.length > 1) throw new Error('Choose only one of --apply, --refresh, or --cleanup');
  const operation = operations[0] || '--apply';
  const dryRun = flags.has('--dry-run') || operations.length === 0;
  const ownerEmail = values.get('--owner-email')?.trim().toLowerCase() || null;
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('owner-email must be a valid email address');
  }
  if (values.has('--lat') !== values.has('--lng')) {
    throw new Error('Provide --lat and --lng together');
  }
  const center = {
    lat: values.has('--lat') ? Number(values.get('--lat')) : DEFAULT_CENTER.lat,
    lng: values.has('--lng') ? Number(values.get('--lng')) : DEFAULT_CENTER.lng,
  };
  validateCenter(center);
  const phoneBase = values.get('--phone-base') || DEFAULT_PHONE_BASE;
  generatePhoneNumbers(phoneBase, DEMO_DONORS.length);

  return {
    operation,
    dryRun,
    force: flags.has('--force'),
    ownerEmail,
    center,
    phoneBase,
    confirmDb: values.get('--confirm-db') || null,
  };
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sameIndexKey = (actual, required) => {
  const actualEntries = Object.entries(actual || {});
  const requiredEntries = Object.entries(required || {});
  return (
    actualEntries.length === requiredEntries.length &&
    actualEntries.every(([key, value], index) => requiredEntries[index][0] === key && requiredEntries[index][1] === value)
  );
};

const sameIndexOptions = (actual, required = {}) =>
  (!required.unique || actual.unique === true) &&
  (!required.partialFilterExpression ||
    stableStringify(actual.partialFilterExpression) === stableStringify(required.partialFilterExpression));

const listIndexes = async (model) => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: model.collection.name }, { nameOnly: true }).toArray();
  if (!collections.length) return [];
  return model.collection.indexes();
};

const inspectIndexes = async () => {
  const indexesByCollection = new Map();
  for (const requirement of INDEX_REQUIREMENTS) {
    const collectionName = requirement.model.collection.name;
    if (!indexesByCollection.has(collectionName)) {
      indexesByCollection.set(collectionName, await listIndexes(requirement.model));
    }
    const currentIndexes = indexesByCollection.get(collectionName);
    const found = currentIndexes.find(
      (candidate) =>
        sameIndexKey(candidate.key, requirement.key) && sameIndexOptions(candidate, requirement.options)
    );
    console.log(
      `Index ${requirement.model.collection.name} ${requirement.label}: ${
        found ? `OK (${found.name})` : 'MISSING'
      }`
    );
    requirement.found = Boolean(found);
  }
  const missing = INDEX_REQUIREMENTS.filter((requirement) => !requirement.found);
  if (missing.length) {
    console.warn(
      'WARNING: Required indexes are missing. Production autoIndex is disabled; coordinate-based geo features may fail, and unique deduplication may be weakened. This script never creates indexes.'
    );
  } else {
    console.log('Index check: all listed indexes exist.');
  }
  return missing;
};

const maskHost = (host) => {
  if (!host) return '***';
  return `${host.slice(0, 2)}***`;
};

const printCounts = (counts, verb = 'would create') => {
  console.log(`Demo data counts (${verb}):`);
  for (const [collection, count] of Object.entries(counts)) {
    console.log(`  ${collection}: ${count}`);
  }
};

const countPlan = (data) => ({
  users: data.users.length,
  donorProfiles: data.donorProfiles.length,
  bloodRequests: data.bloodRequests.length,
  requestResponses: data.requestResponses.length,
  conversations: data.conversations.length,
  messages: data.messages.length,
  notifications: data.notifications.length,
  donations: data.donations.length,
  [DEMO_LOG_COLLECTION]: 1,
});

const countExistingNonDemoUsers = () =>
  User.countDocuments({
    $nor: [{ email: /^demo\.[^@]+@demo\.bloodlink\.invalid$/i }],
  });

const getDhakaLocations = async () => {
  const division = await Division.findOne({ nameEn: /^Dhaka$/i }).lean();
  if (!division) throw new Error('Dhaka division was not found; import the location hierarchy before seeding demo data');
  const district = await District.findOne({ nameEn: /^Dhaka$/i, divisionId: division._id }).lean();
  if (!district) throw new Error('Dhaka district was not found under Dhaka division; no demo data was written');
  const upazilas = await Upazila.find({ districtId: district._id, isActive: { $ne: false } })
    .sort({ nameEn: 1 })
    .select('_id')
    .lean();
  if (!upazilas.length) {
    throw new Error('No active Dhaka upazilas/thanas were found; import the location hierarchy before seeding demo data');
  }
  return {
    divisionId: division._id,
    districtId: district._id,
    upazilaIds: upazilas.map((upazila) => upazila._id),
  };
};

const findOwner = async (email) => {
  if (!email) return null;
  const owner = await User.findOne({ email }).select('_id name email modes').lean();
  if (!owner) console.warn('Owner account was not found; owner-linked demo requests, chat, notifications, and donations will be skipped.');
  else console.log('Owner account found; owner-linked demo documents will be included.');
  return owner;
};

const assertNoAccountCollisions = async (data) => {
  const emails = data.users.map((user) => user.email);
  const phones = data.users.map((user) => user.phone);
  const collisions = await User.find({ $or: [{ email: { $in: emails } }, { phone: { $in: phones } }] })
    .select('email phone')
    .lean();
  if (collisions.length) {
    throw new Error(
      `Found ${collisions.length} existing user email/phone collision(s) outside the tracked batch. No users were modified. Choose another --phone-base or resolve the demo email collision.`
    );
  }
};

const collectionIds = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([collection, documents]) => [
      collection,
      documents.map((document) => document._id),
    ])
  );

const assertTrackedLog = (log) => {
  if (!log || log._id !== DEMO_BATCH_ID || log.batchId !== DEMO_BATCH_ID || !log.idsByCollection) {
    throw new Error('The demo seed log is missing or malformed; refusing to modify data');
  }
  for (const collection of Object.keys(DONOR_COLLECTIONS)) {
    if (!Array.isArray(log.idsByCollection[collection])) {
      throw new Error(`The demo seed log has no valid ID list for ${collection}; refusing to modify data`);
    }
  }
  if (
    !Array.isArray(log.idsByCollection[DEMO_LOG_COLLECTION]) ||
    log.idsByCollection[DEMO_LOG_COLLECTION].length !== 1 ||
    log.idsByCollection[DEMO_LOG_COLLECTION][0] !== DEMO_BATCH_ID
  ) {
    throw new Error('The demo seed log has no valid tracking-document ID; refusing to modify data');
  }
};

const printCleanupPreview = async (log) => {
  assertTrackedLog(log);
  console.log('Cleanup preview: only documents whose _id appears in this batch log are targets.');
  for (const [collection, Model] of Object.entries(DONOR_COLLECTIONS)) {
    const ids = log.idsByCollection[collection];
    const found = ids.length ? await Model.countDocuments({ _id: { $in: ids } }) : 0;
    console.log(`  ${collection}: ${found} document(s) found among ${ids.length} tracked ID(s)`);
  }
  const logIds = log.idsByCollection[DEMO_LOG_COLLECTION];
  const logCount = await mongoose.connection.db.collection(DEMO_LOG_COLLECTION).countDocuments({
    _id: { $in: logIds },
    batchId: DEMO_BATCH_ID,
  });
  console.log(`  ${DEMO_LOG_COLLECTION}: ${logCount} tracking document(s) found among ${logIds.length} tracked ID(s)`);
};

const cleanupBatch = async (log, logCollection) => {
  assertTrackedLog(log);
  for (const collection of CLEANUP_ORDER) {
    const Model = DONOR_COLLECTIONS[collection];
    const ids = log.idsByCollection[collection];
    if (!ids.length) {
      console.log(`${collection}: no tracked IDs`);
      continue;
    }
    const result = await Model.deleteMany({ _id: { $in: ids } });
    console.log(`${collection}: deleted ${result.deletedCount} tracked document(s)`);
  }
  const deletedLog = await logCollection.deleteOne({
    _id: { $in: log.idsByCollection[DEMO_LOG_COLLECTION] },
    batchId: DEMO_BATCH_ID,
  });
  console.log(`${DEMO_LOG_COLLECTION}: deleted ${deletedLog.deletedCount} tracking document`);
};

const hashDemoPasswords = async (users) => {
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error('BCRYPT_SALT_ROUNDS must be an integer from 10 to 15');
  }
  return Promise.all(
    users.map(async (user) => {
      const randomPassword = `${randomBytes(32).toString('hex')}A1`;
      return { ...user, passwordHash: await bcrypt.hash(randomPassword, rounds) };
    })
  );
};

const insertPlan = async (data, logCollection) => {
  const log = {
    _id: DEMO_BATCH_ID,
    batchId: DEMO_BATCH_ID,
    status: 'preparing',
    createdAt: new Date(),
    updatedAt: new Date(),
    idsByCollection: {
      ...collectionIds(data),
      [DEMO_LOG_COLLECTION]: [DEMO_BATCH_ID],
    },
  };
  await logCollection.insertOne(log);

  const prepared = { ...data, users: await hashDemoPasswords(data.users) };
  for (const [collection, Model] of Object.entries(DONOR_COLLECTIONS)) {
    const documents = prepared[collection];
    if (documents.length) await Model.insertMany(documents, { ordered: true });
    console.log(`${collection}: inserted ${documents.length}`);
  }
  await logCollection.updateOne(
    { _id: DEMO_BATCH_ID, batchId: DEMO_BATCH_ID },
    { $set: { status: 'active', updatedAt: new Date() } }
  );
  console.log(`Seed batch ${DEMO_BATCH_ID} is active. No matching, email, push, socket, or notification services were called.`);
};

export const runDemoSeed = async (args = process.argv.slice(2)) => {
  const options = parseArguments(args);
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required; set it in the current shell');
  if (!options.dryRun && !options.confirmDb) {
    throw new Error('Write modes require --confirm-db <exact connected database name>');
  }

  console.warn(
    'PHONE SAFETY: generated numbers are synthetic-looking, but could theoretically belong to real people. Never dial demo numbers during tests; the app opens the dialer.'
  );
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const connectedDbName = mongoose.connection.name;
    console.log(`Connected MongoDB host: ${maskHost(mongoose.connection.host)} (masked)`);
    console.log(`Connected database: ${connectedDbName}`);
    if (!options.dryRun && options.confirmDb !== connectedDbName) {
      throw new Error(`--confirm-db must exactly match the connected database name "${connectedDbName}"`);
    }

    await inspectIndexes();
    const nonDemoUsers = await countExistingNonDemoUsers();
    console.log(`Existing non-demo user count: ${nonDemoUsers}`);
    if (!options.dryRun && nonDemoUsers > 25 && !options.force) {
      throw new Error(
        `Found ${nonDemoUsers} non-demo users; write modes are blocked above 25 unless --force is passed. --force does not broaden cleanup targets.`
      );
    }
    if (options.dryRun && nonDemoUsers > 25) {
      console.warn('WARNING: apply/refresh/cleanup would require --force because the non-demo user count exceeds 25.');
    }

    const logCollection = mongoose.connection.db.collection(DEMO_LOG_COLLECTION);
    const existingLog = await logCollection.findOne({ _id: DEMO_BATCH_ID });
    if (options.operation === '--cleanup') {
      if (!existingLog) {
        console.log('No tracked demo batch exists; nothing to clean up.');
        return;
      }
      await printCleanupPreview(existingLog);
      if (!options.dryRun) await cleanupBatch(existingLog, logCollection);
      else console.log('Dry run only: no documents were deleted.');
      return;
    }

    if (options.operation === '--refresh') {
      if (!existingLog) {
        console.log('No tracked demo batch exists; nothing to refresh.');
        return;
      }
      assertTrackedLog(existingLog);
      if (existingLog.status !== 'active') {
        throw new Error('The seed batch is incomplete; preview and run --cleanup before refreshing it.');
      }
      const rules = await getBusinessRules();
      const trackedRequests = await BloodRequest.find({
        _id: { $in: existingLog.idsByCollection.bloodRequests },
      })
        .select('_id urgency')
        .lean();
      const refreshed = buildFreshRequestTimes(trackedRequests, rules.matching, new Date());
      console.log(`Demo requests to refresh: ${refreshed.length}`);
      if (!options.dryRun) {
        const updatedAt = new Date();
        if (refreshed.length) {
          await BloodRequest.bulkWrite(
            refreshed.map((update) => ({
              updateOne: {
                filter: { _id: update._id },
                update: { $set: { neededBy: update.neededBy, expiresAt: update.expiresAt, updatedAt } },
              },
            }))
          );
        }
        console.log('Refreshed only the tracked demo request IDs.');
      } else {
        console.log('Dry run only: no request dates were changed.');
      }
      return;
    }

    if (existingLog?.status === 'active') {
      assertTrackedLog(existingLog);
      console.log(`Seed batch ${DEMO_BATCH_ID} is already active; apply is an idempotent no-op.`);
      printCounts(
        Object.fromEntries(
          [
            ...Object.keys(DONOR_COLLECTIONS).map((collection) => [
              collection,
              existingLog.idsByCollection[collection].length,
            ]),
            [DEMO_LOG_COLLECTION, 1],
          ]
        ),
        'already tracked'
      );
      return;
    }
    if (existingLog) {
      throw new Error(
        `A ${existingLog.status || 'incomplete'} seed log exists. Preview and run --cleanup before applying again.`
      );
    }

    const locationIds = await getDhakaLocations();
    const owner = await findOwner(options.ownerEmail);
    const rules = await getBusinessRules();
    const termsVersion = await getTermsVersion();
    const data = buildDemoData({
      center: options.center,
      now: new Date(),
      phoneBase: options.phoneBase,
      locationIds,
      rules: rules.matching,
      termsVersion,
      owner,
      idFactory: () => new mongoose.Types.ObjectId(),
    });
    printCounts(countPlan(data));
    console.log('The demo seed uses direct model inserts only; it does not call application services.');

    if (options.dryRun) {
      const conflictingUsers = await User.find({
        $or: [
          { email: { $in: data.users.map((user) => user.email) } },
          { phone: { $in: data.users.map((user) => user.phone) } },
        ],
      })
        .select('_id')
        .lean();
      console.log(
        conflictingUsers.length
          ? `WARNING: ${conflictingUsers.length} generated demo email/phone collision(s) found; apply would abort.`
          : 'Demo email/phone preflight: no collisions found.'
      );
      console.log('Dry run only: no documents were inserted or changed.');
      return;
    }

    await assertNoAccountCollisions(data);
    await insertPlan(data, logCollection);
  } finally {
    await mongoose.disconnect();
  }
};

const directExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (directExecution) {
  runDemoSeed().catch((error) => {
    console.error(`Demo seed stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
