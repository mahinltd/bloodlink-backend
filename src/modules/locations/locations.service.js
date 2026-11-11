import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import { VILLAGE_AUTO_APPROVE_COUNT } from '../../constants/index.js';
import { Division } from './division.model.js';
import { District } from './district.model.js';
import { Upazila } from './upazila.model.js';
import { Union } from './union.model.js';
import { Village } from './village.model.js';
import { Hospital } from './hospital.model.js';

export const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MODELS = { division: Division, district: District, upazila: Upazila, union: Union };
const PARENT_FIELD = { district: 'divisionId', upazila: 'districtId', union: 'upazilaId' };

/* ---------------- তালিকা (সিঙ্ক সহ) ---------------- */

export const listChildren = async (key, { parentId, q, since, limit }) => {
  const Model = MODELS[key];
  const filter = { isActive: true };

  const parentField = PARENT_FIELD[key];
  if (parentField) {
    if (!parentId) throw ApiError.badRequest('parentId is required', 'PARENT_REQUIRED');
    filter[parentField] = parentId;
  }
  if (since) filter.updatedAt = { $gt: since };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ nameBn: rx }, { nameEn: rx }];
  }

  const items = await Model.find(filter).sort({ nameEn: 1 }).limit(limit).lean();
  return { items };
};

export const listVillages = async ({ parentId, q, since, limit }, userId) => {
  if (!parentId) throw ApiError.badRequest('parentId (unionId) is required', 'PARENT_REQUIRED');

  // সবাই: approved; লগইন করা ব্যবহারকারী: নিজের pending-ও দেখবে (রোডম্যাপ পর্ব ৯)
  const visibilityOr = [{ status: 'approved' }];
  if (userId) visibilityOr.push({ status: 'pending', createdBy: new mongoose.Types.ObjectId(userId) });

  const andConditions = [{ $or: visibilityOr }];
  if (q) {
    const rx = new RegExp(escapeRegex(normalizeName(q)), 'i');
    andConditions.push({ $or: [{ nameBn: rx }, { nameEn: rx }, { nameBnNorm: rx }, { nameEnNorm: rx }] });
  }
  if (since) andConditions.push({ updatedAt: { $gt: since } });

  const items = await Village.find({ unionId: parentId, isActive: true, $and: andConditions })
    .select('nameBn nameEn unionId source status usageCount updatedAt')
    .sort({ usageCount: -1, nameBn: 1 })
    .limit(limit)
    .lean();

  return { items };
};

/* ---------------- গ্রাম: ব্যবহার / যোগ / ৩-ব্যবহারকারী নিয়ম ---------------- */

export const touchVillageUsage = async (villageId, userId) => {
  if (!villageId || !userId) return;
  const village = await Village.findById(villageId).select('+usedBy');
  if (!village) return;

  const uid = userId.toString();
  if (village.usedBy.some((u) => u.toString() === uid)) return;

  village.usedBy.push(userId);
  village.usageCount = village.usedBy.length;
  if (village.status === 'pending' && village.usageCount >= VILLAGE_AUTO_APPROVE_COUNT) {
    village.status = 'approved'; // ৩ জন ব্যবহার করলে সবার জন্য দৃশ্যমান
  }
  await village.save();
};

// ডোনার ফর্মে টাইপ করা গ্রাম → খুঁজে নেয় বা pending তৈরি করে (auth/users সার্ভিস থেকে ডাকা হয়)
export const resolveVillageName = async ({ unionId, nameBn, nameEn = null, userId }) => {
  if (!unionId || !nameBn) return null;
  const nameBnNorm = normalizeName(nameBn);

  const village = await Village.findOneAndUpdate(
    { unionId, nameBnNorm },
    {
      $setOnInsert: {
        nameBn: nameBn.trim(),
        nameEn: nameEn?.trim() || null,
        nameEnNorm: nameEn ? normalizeName(nameEn) : null,
        unionId,
        source: 'user',
        status: 'pending',
        createdBy: userId,
      },
      $addToSet: { usedBy: userId },
    },
    { upsert: true, new: true }
  ).select('+usedBy');

  const usageCount = village.usedBy.length;
  if (village.status === 'pending' && usageCount >= VILLAGE_AUTO_APPROVE_COUNT) {
    village.status = 'approved';
  }
  if (village.usageCount !== usageCount) village.usageCount = usageCount;
  if (village.isModified()) await village.save();

  return village;
};

export const createVillage = async ({ unionId, nameBn, nameEn }, userId) => {
  const unionDoc = await Union.findById(unionId).lean();
  if (!unionDoc) throw ApiError.badRequest('Invalid unionId', 'INVALID_UNION');

  const nameBnNorm = normalizeName(nameBn);
  const existing = await Village.findOne({ unionId, nameBnNorm });
  if (existing) {
    await touchVillageUsage(existing._id, userId);
    return { village: existing, alreadyExists: true };
  }

  // "আপনি কি এটি বোঝাতে চেয়েছেন?" সাজেশন
  const prefixRx = new RegExp(`^${escapeRegex(nameBnNorm.slice(0, 3))}`, 'i');
  const suggestions = await Village.find({ unionId, nameBnNorm: prefixRx })
    .select('nameBn nameEn status')
    .limit(5)
    .lean();

  const village = await Village.create({
    unionId,
    nameBn: nameBn.trim(),
    nameEn: nameEn?.trim() || null,
    nameBnNorm,
    nameEnNorm: nameEn ? normalizeName(nameEn) : null,
    source: 'user',
    status: 'pending',
    createdBy: userId,
    usedBy: [userId],
    usageCount: 1,
  });

  return { village, alreadyExists: false, suggestions };
};

/* ---------------- হাসপাতাল ---------------- */

export const listHospitals = async ({ q, lat, lng, districtId, page, limit }, userId) => {
  const visibilityOr = [{ status: 'approved' }];
  if (userId) visibilityOr.push({ status: 'pending', createdBy: new mongoose.Types.ObjectId(userId) });

  const qMatch = q
    ? { $or: ['nameBn', 'nameEn', 'nameBnNorm', 'nameEnNorm'].map((f) => ({ [f]: new RegExp(escapeRegex(normalizeName(q)), 'i') })) }
    : null;

  // কোঅর্ডিনেট থাকলে দূরত্ব অনুযায়ী সাজানো
  if (lat != null && lng != null) {
    const geoQuery = { isActive: true, $or: visibilityOr };
    if (districtId) geoQuery.districtId = new mongoose.Types.ObjectId(districtId);

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceMeters',
          spherical: true,
          query: geoQuery,
        },
      },
      ...(qMatch ? [{ $match: qMatch }] : []),
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];
    const items = await Hospital.aggregate(pipeline);
    return { items };
  }

  const filter = { isActive: true, $or: visibilityOr };
  if (districtId) filter.districtId = districtId;
  if (qMatch) filter.$and = [qMatch];

  const items = await Hospital.find(filter)
    .sort({ nameBn: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return { items };
};

export const createHospital = async (payload, userId) => {
  const nameBnNorm = normalizeName(payload.nameBn);
  const dupFilter = { nameBnNorm };
  if (payload.districtId) dupFilter.districtId = payload.districtId;

  const existing = await Hospital.findOne(dupFilter);
  if (existing) return { hospital: existing, alreadyExists: true };

  const hospital = await Hospital.create({
    nameBn: payload.nameBn.trim(),
    nameEn: payload.nameEn?.trim() || null,
    nameBnNorm,
    nameEnNorm: payload.nameEn ? normalizeName(payload.nameEn) : null,
    location: payload.coordinates
      ? { type: 'Point', coordinates: [payload.coordinates.lng, payload.coordinates.lat] }
      : undefined,
    divisionId: payload.divisionId || null,
    districtId: payload.districtId || null,
    upazilaId: payload.upazilaId || null,
    source: 'user',
    status: 'pending', // অ্যাডমিন অনুমোদনের আগে শুধু জমাকারী দেখবে
    createdBy: userId,
  });

  return { hospital, alreadyExists: false };
};

/* ---------------- সিড ইমপোর্ট (CSV/JSON) ---------------- */

const point = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' ? { type: 'Point', coordinates: [lng, lat] } : undefined;

export const importHierarchy = async ({ divisions = [], hospitals = [] }) => {
  const counters = { divisions: 0, districts: 0, upazilas: 0, unions: 0, villages: 0, hospitals: 0 };
  const operations = (rows) => rows.map(({ filter, doc }) => ({
    updateOne: { filter, update: { $set: doc }, upsert: true },
  }));
  const writeBulk = (Model, rows) => (rows.length ? Model.bulkWrite(operations(rows)) : Promise.resolve());
  const idsBy = (rows, getKey) => new Map(rows.map((row) => [getKey(row), row._id]));

  await writeBulk(Division, divisions.map((div) => ({
    filter: { nameEn: div.nameEn },
    doc: {
      nameBn: div.nameBn,
      nameEn: div.nameEn,
      lat: div.lat ?? null,
      lng: div.lng ?? null,
      source: 'seed',
    },
  })));
  const divisionDocs = await Division.find({ nameEn: { $in: divisions.map((div) => div.nameEn) } })
    .select('nameEn')
    .lean();
  const divisionIds = idsBy(divisionDocs, (doc) => doc.nameEn);

  const districtRows = divisions.flatMap((div) => (div.districts || []).map((dist) => ({
    divisionId: divisionIds.get(div.nameEn),
    dist,
  })));
  await writeBulk(District, districtRows.map(({ divisionId, dist }) => ({
    filter: { nameEn: dist.nameEn, divisionId },
    doc: {
      nameBn: dist.nameBn,
      nameEn: dist.nameEn,
      divisionId,
      ...(point(dist.lat, dist.lng) ? { location: point(dist.lat, dist.lng) } : {}),
    },
  })));
  const districtDocs = await District.find({ divisionId: { $in: [...divisionIds.values()] } })
    .select('nameEn divisionId')
    .lean();
  const districtIds = idsBy(districtDocs, (doc) => `${doc.divisionId}:${doc.nameEn}`);

  const upazilaRows = districtRows.flatMap(({ divisionId, dist }) => (dist.upazilas || []).map((upz) => ({
    districtId: districtIds.get(`${divisionId}:${dist.nameEn}`),
    upz,
  })));
  await writeBulk(Upazila, upazilaRows.map(({ districtId, upz }) => ({
    filter: { nameEn: upz.nameEn, districtId },
    doc: {
      nameBn: upz.nameBn,
      nameEn: upz.nameEn,
      districtId,
      ...(point(upz.lat, upz.lng) ? { location: point(upz.lat, upz.lng) } : {}),
    },
  })));
  const upazilaDocs = await Upazila.find({ districtId: { $in: [...districtIds.values()] } })
    .select('nameEn districtId')
    .lean();
  const upazilaIds = idsBy(upazilaDocs, (doc) => `${doc.districtId}:${doc.nameEn}`);

  const unionRows = upazilaRows.flatMap(({ districtId, upz }) => {
    const upazilaId = upazilaIds.get(`${districtId}:${upz.nameEn}`);
    const rows = (upz.unions || []).map((uni) => ({ upazilaId, uni }));
    if (upz.villages?.length) {
      rows.push({ upazilaId, uni: { nameBn: 'অন্যান্য', nameEn: 'Other', villages: upz.villages } });
    }
    return rows;
  });
  await writeBulk(Union, unionRows.map(({ upazilaId, uni }) => ({
    filter: { nameEn: uni.nameEn, upazilaId },
    doc: { nameBn: uni.nameBn, nameEn: uni.nameEn, upazilaId },
  })));
  const unionDocs = await Union.find({ upazilaId: { $in: [...upazilaIds.values()] } })
    .select('nameEn upazilaId')
    .lean();
  const unionIds = idsBy(unionDocs, (doc) => `${doc.upazilaId}:${doc.nameEn}`);

  const villageRows = unionRows.flatMap(({ upazilaId, uni }) => (uni.villages || []).map((vil) => ({
    unionId: unionIds.get(`${upazilaId}:${uni.nameEn}`),
    vil,
  })));
  await writeBulk(Village, villageRows.map(({ unionId, vil }) => ({
    filter: { unionId, nameBnNorm: normalizeName(vil.nameBn) },
    doc: {
      nameBn: vil.nameBn,
      nameEn: vil.nameEn || null,
      nameBnNorm: normalizeName(vil.nameBn),
      nameEnNorm: vil.nameEn ? normalizeName(vil.nameEn) : null,
      unionId,
      source: 'seed',
      status: 'approved',
    },
  })));

  const hospitalOperations = hospitals.map((hos) => ({
    filter: { nameBnNorm: normalizeName(hos.nameBn), districtId: null },
    doc: {
      nameBn: hos.nameBn,
      nameEn: hos.nameEn || null,
      nameBnNorm: normalizeName(hos.nameBn),
      nameEnNorm: hos.nameEn ? normalizeName(hos.nameEn) : null,
      location: point(hos.lat, hos.lng),
      source: 'seed',
      status: 'approved',
    },
  }));
  await writeBulk(Hospital, hospitalOperations);

  counters.divisions = divisions.length;
  counters.districts = districtRows.length;
  counters.upazilas = upazilaRows.length;
  counters.unions = unionRows.length;
  counters.villages = villageRows.length;
  counters.hospitals = hospitals.length;

  return counters;
};