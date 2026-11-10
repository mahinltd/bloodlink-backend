import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './systemAdmin.service.js';
import {
  updateConfigDraftSchema,
  createTranslationSchema,
  updateTranslationSchema,
  bulkTranslationsSchema,
  translationsQuerySchema,
  createReleaseSchema,
  updateReleaseSchema,
} from './systemAdmin.validation.js';

const actor = (req) =>
  req.admin ? { _id: req.admin.adminId, role: req.admin.role } : req.user;

// ── Config ──
export const getConfigOverview = asyncHandler(async (req, res) => {
  const data = await service.getConfigOverview();
  return ApiResponse.ok(res, data);
});

export const getDraft = asyncHandler(async (req, res) => {
  const draft = await service.getDraft();
  return ApiResponse.ok(res, { draft: draft || null });
});

export const createDraft = asyncHandler(async (req, res) => {
  const draft = await service.createDraft(actor(req)._id, req);
  return ApiResponse.created(res, { draft });
});

export const updateDraft = asyncHandler(async (req, res) => {
  const data = updateConfigDraftSchema.parse(req.body);
  const draft = await service.updateDraft(data, actor(req)._id, req);
  return ApiResponse.ok(res, { draft });
});

export const publishDraft = asyncHandler(async (req, res) => {
  const result = await service.publishDraft(actor(req)._id, req);
  return ApiResponse.ok(res, result);
});

export const rollbackConfig = asyncHandler(async (req, res) => {
  const draft = await service.rollbackToVersion(req.params.version, actor(req)._id, req);
  return ApiResponse.ok(res, { draft });
});

// ── Translations ──
export const listTranslations = asyncHandler(async (req, res) => {
  const query = translationsQuerySchema.parse(req.query);
  const data = await service.listTranslations(query);
  return ApiResponse.ok(res, data);
});

export const createTranslation = asyncHandler(async (req, res) => {
  const data = createTranslationSchema.parse(req.body);
  const item = await service.createTranslation(data, actor(req)._id, req);
  return ApiResponse.created(res, { translation: item });
});

export const bulkTranslations = asyncHandler(async (req, res) => {
  const { items } = bulkTranslationsSchema.parse(req.body);
  const result = await service.bulkUpsertTranslations(items, actor(req)._id, req);
  return ApiResponse.ok(res, result);
});

export const updateTranslation = asyncHandler(async (req, res) => {
  const data = updateTranslationSchema.parse(req.body);
  const item = await service.updateTranslation(req.params.id, data, actor(req)._id, req);
  return ApiResponse.ok(res, { translation: item });
});

export const deleteTranslation = asyncHandler(async (req, res) => {
  const result = await service.deleteTranslation(req.params.id, actor(req)._id, req);
  return ApiResponse.ok(res, result);
});

// ── Releases ──
export const listReleases = asyncHandler(async (req, res) => {
  const releases = await service.listReleases();
  return ApiResponse.ok(res, { releases });
});

export const createRelease = asyncHandler(async (req, res) => {
  const data = createReleaseSchema.parse(req.body);
  const release = await service.createRelease(data, req.file, actor(req)._id, req);
  return ApiResponse.created(res, { release });
});

export const updateRelease = asyncHandler(async (req, res) => {
  const data = updateReleaseSchema.parse(req.body);
  const release = await service.updateRelease(req.params.id, data, actor(req)._id, req);
  return ApiResponse.ok(res, { release });
});

export const publishRelease = asyncHandler(async (req, res) => {
  const release = await service.publishRelease(req.params.id, actor(req)._id, req);
  return ApiResponse.ok(res, { release });
});

export const archiveRelease = asyncHandler(async (req, res) => {
  const release = await service.archiveRelease(req.params.id, actor(req)._id, req);
  return ApiResponse.ok(res, { release });
});