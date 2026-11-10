import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ApiError from '../../utils/ApiError.js';
import { AppConfig } from '../config/appConfig.model.js';
import { Translation } from '../config/translation.model.js'; // ⚠️ ফাইলনেম মিলিয়ে নিন
import { Release } from '../releases/release.model.js';
import { invalidateConfigCache } from '../config/config.service.js';
import { logAudit } from './admin.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ══════════════════════ CONFIG (Draft → Publish → Rollback) ══════════════════════

const EDITABLE_SECTIONS = [
  'designTokens',
  'featureFlags',
  'businessRules',
  'onboardingSlides',
  'donationCard',
  'contact',
  'developerInfo',
  'legalTexts',
  'maintenance',
];

function pickSections(source = {}) {
  const out = {};
  for (const key of EDITABLE_SECTIONS) {
    if (key === 'legalTexts' && !Object.keys(source.legalTexts || {}).length && source.legal !== undefined) {
      out.legalTexts = source.legal;
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

export async function getConfigOverview() {
  const [published, draft, versions] = await Promise.all([
    AppConfig.findOne({ status: 'published' }).sort({ version: -1 }).lean(),
    AppConfig.findOne({ status: 'draft' }).lean(),
    AppConfig.find({ status: { $in: ['published', 'archived'] } })
      .select('version status publishedAt createdAt updatedAt')
      .sort({ version: -1 })
      .limit(20)
      .lean(),
  ]);
  return { published: published || null, draft: draft || null, versions };
}

export async function getDraft() {
  return AppConfig.findOne({ status: 'draft' }).lean();
}

export async function createDraft(adminId, req) {
  const existing = await AppConfig.findOne({ status: 'draft' }).lean();
  if (existing) return existing;

  const published = await AppConfig.findOne({ status: 'published' }).sort({ version: -1 });
  const draft = await AppConfig.create({
    version: 0, // publish-এর সময় আসল version সেট হবে
    status: 'draft',
    ...(published ? pickSections(published.toObject()) : {}),
  });

  await logAudit({ adminId, action: 'admin.config_draft_create', targetType: 'config', targetId: draft._id, req });
  return draft;
}

export async function updateDraft(data, adminId, req) {
  const draft = await AppConfig.findOne({ status: 'draft' });
  if (!draft) throw ApiError.notFound('No draft exists — create one first');

  for (const key of EDITABLE_SECTIONS) {
    if (data[key] === undefined) continue;
    if (Array.isArray(data[key])) {
      draft.set(key, data[key]); // array সেকশন পুরোটা replace
    } else {
      const current = draft.get(key);
      const currentPlain = current?.toObject?.() || current || {};
      draft.set(key, { ...currentPlain, ...data[key] }); // object সেকশন one-level merge
    }
  }
  await draft.save();

  await logAudit({
    adminId,
    action: 'admin.config_draft_update',
    targetType: 'config',
    targetId: draft._id,
    meta: { sections: Object.keys(data) },
    req,
  });
  return draft;
}

export async function publishDraft(adminId, req) {
  const draft = await AppConfig.findOne({ status: 'draft' });
  if (!draft) throw ApiError.notFound('No draft to publish');

  const [current, maxDoc] = await Promise.all([
    AppConfig.findOne({ status: 'published' }).sort({ version: -1 }),
    AppConfig.findOne({}).sort({ version: -1 }).select('version').lean(),
  ]);
  const nextVersion = (maxDoc?.version || 0) + 1;

  if (current) {
    current.status = 'archived';
    await current.save();
  }

  draft.status = 'published';
  draft.version = nextVersion;
  draft.publishedAt = new Date();
  await draft.save();
  invalidateConfigCache();

  await logAudit({
    adminId,
    action: 'admin.config_publish',
    targetType: 'config',
    targetId: draft._id,
    meta: { version: nextVersion, previousVersion: current?.version ?? null },
    req,
  });
  return { version: nextVersion, id: draft._id };
}

// Rollback = পুরনো version থেকে নতুন draft → review করে publish (একই flow reuse)
export async function rollbackToVersion(version, adminId, req) {
  const target = await AppConfig.findOne({
    version: Number(version),
    status: { $in: ['published', 'archived'] },
  });
  if (!target) throw ApiError.notFound(`Config version ${version} not found`);

  await AppConfig.deleteMany({ status: 'draft' }); // পুরনো draft replace হবে
  const draft = await AppConfig.create({
    version: 0,
    status: 'draft',
    ...pickSections(target.toObject()),
  });

  await logAudit({
    adminId,
    action: 'admin.config_rollback',
    targetType: 'config',
    targetId: draft._id,
    meta: { rolledBackFrom: Number(version) },
    req,
  });
  return draft;
}

// ══════════════════════ TRANSLATIONS ══════════════════════

export async function listTranslations({ page, limit, q, group }) {
  const filter = {};
  if (group) filter.group = group;
  if (q) filter.key = new RegExp(escapeRegex(q), 'i');

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Translation.find(filter).sort({ group: 1, key: 1 }).skip(skip).limit(limit).lean(),
    Translation.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export async function createTranslation(data, adminId, req) {
  const exists = await Translation.findOne({ key: data.key });
  if (exists) throw ApiError.conflict(`Key "${data.key}" already exists`);

  const item = await Translation.create(data);
  invalidateConfigCache();
  await logAudit({ adminId, action: 'admin.translation_create', targetType: 'translation', targetId: item._id, meta: { key: data.key }, req });
  return item;
}

export async function updateTranslation(id, data, adminId, req) {
  const item = await Translation.findById(id);
  if (!item) throw ApiError.notFound('Translation not found');

  const before = { bn: item.bn, en: item.en, group: item.group };
  Object.assign(item, data);
  await item.save();
  invalidateConfigCache();

  await logAudit({ adminId, action: 'admin.translation_update', targetType: 'translation', targetId: id, meta: { key: item.key, before }, req });
  return item;
}

export async function deleteTranslation(id, adminId, req) {
  const item = await Translation.findByIdAndDelete(id);
  if (!item) throw ApiError.notFound('Translation not found');
  invalidateConfigCache();
  await logAudit({ adminId, action: 'admin.translation_delete', targetType: 'translation', targetId: id, meta: { key: item.key }, req });
  return { deleted: true };
}

export async function bulkUpsertTranslations(items, adminId, req) {
  const ops = items.map((t) => ({
    updateOne: {
      filter: { key: t.key },
      update: { $set: { bn: t.bn, en: t.en, group: t.group } },
      upsert: true,
    },
  }));
  const result = await Translation.bulkWrite(ops);
  invalidateConfigCache();
  await logAudit({
    adminId,
    action: 'admin.translation_bulk',
    targetType: 'translation',
    meta: { upserted: result.upsertedCount, modified: result.modifiedCount, total: items.length },
    req,
  });
  return { upserted: result.upsertedCount, modified: result.modifiedCount, total: items.length };
}

// ══════════════════════ RELEASES (APK Manager) ══════════════════════

const RELEASES_DIR = path.join(process.cwd(), 'uploads', 'releases');
const safeFile = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, '-');

export async function listReleases() {
  return Release.find().sort({ versionCode: -1 }).lean();
}

export async function createRelease(data, file, adminId, req) {
  if (!file) throw ApiError.badRequest('APK file is required (field name: apk)');

  const exists = await Release.findOne({ versionCode: data.versionCode });
  if (exists) throw ApiError.conflict(`versionCode ${data.versionCode} already exists`);

  await fs.mkdir(RELEASES_DIR, { recursive: true });
  const filename = `bloodlink-${safeFile(data.versionName)}-${data.versionCode}.apk`;
  await fs.writeFile(path.join(RELEASES_DIR, filename), file.buffer);

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  const release = await Release.create({
    versionCode: data.versionCode,
    versionName: data.versionName,
    apkUrl: `/downloads/releases/${filename}`,
    fileSizeBytes: file.size,
    sha256,
    releaseNotes: { bn: data.releaseNotesBn || '', en: data.releaseNotesEn || '' },
    mandatory: data.mandatory ?? false,
    minSupportedVersionCode: data.minSupportedVersionCode ?? 0,
    rolloutPercent: data.rolloutPercent ?? 100,
    status: 'draft',
    createdBy: adminId,
  });

  await logAudit({
    adminId,
    action: 'admin.release_create',
    targetType: 'release',
    targetId: release._id,
    meta: { versionCode: release.versionCode, sha256 },
    req,
  });
  return release;
}

export async function updateRelease(id, data, adminId, req) {
  const release = await Release.findById(id);
  if (!release) throw ApiError.notFound('Release not found');
  if (release.status === 'archived') throw ApiError.badRequest('Archived releases cannot be edited');

  if (data.versionCode !== undefined && data.versionCode !== release.versionCode) {
    if (release.status !== 'draft') throw ApiError.badRequest('versionCode can only change while draft');
    const dup = await Release.findOne({ versionCode: data.versionCode, _id: { $ne: id } });
    if (dup) throw ApiError.conflict(`versionCode ${data.versionCode} already exists`);
    release.versionCode = data.versionCode;
  }
  if (data.versionName !== undefined) release.versionName = data.versionName;
  if (data.releaseNotesBn !== undefined) release.releaseNotes.bn = data.releaseNotesBn;
  if (data.releaseNotesEn !== undefined) release.releaseNotes.en = data.releaseNotesEn;
  if (data.mandatory !== undefined) release.mandatory = data.mandatory;
  if (data.minSupportedVersionCode !== undefined) release.minSupportedVersionCode = data.minSupportedVersionCode;
  if (data.rolloutPercent !== undefined) release.rolloutPercent = data.rolloutPercent;
  await release.save();

  await logAudit({ adminId, action: 'admin.release_update', targetType: 'release', targetId: id, meta: data, req });
  return release;
}

export async function publishRelease(id, adminId, req) {
  const release = await Release.findById(id);
  if (!release) throw ApiError.notFound('Release not found');
  if (release.status === 'published') return release;

  // একসাথে একটাই published release — বাকিগুলো archive
  await Release.updateMany({ status: 'published', _id: { $ne: id } }, { $set: { status: 'archived' } });

  release.status = 'published';
  release.publishedAt = new Date();
  await release.save();

  await logAudit({
    adminId,
    action: 'admin.release_publish',
    targetType: 'release',
    targetId: id,
    meta: { versionCode: release.versionCode, rolloutPercent: release.rolloutPercent },
    req,
  });
  return release;
}

export async function archiveRelease(id, adminId, req) {
  const release = await Release.findById(id);
  if (!release) throw ApiError.notFound('Release not found');

  release.status = 'archived';
  await release.save();

  await logAudit({ adminId, action: 'admin.release_archive', targetType: 'release', targetId: id, meta: { versionCode: release.versionCode }, req });
  return release;
}