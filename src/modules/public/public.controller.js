import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as publicService from './public.service.js';

// ভুল lang দিলে error না দিয়ে silently 'bn'-তে fallback
const langSchema = z.enum(['bn', 'en']).catch('bn');

export const getSite = asyncHandler(async (req, res) => {
  const lang = langSchema.parse(req.query.lang);
  const data = await publicService.getSiteContent(lang);
  return ok(res, data);
});

export const getStats = asyncHandler(async (req, res) => {
  const data = await publicService.getPublicStats();
  return ok(res, data);
});

export const getLatestRelease = asyncHandler(async (req, res) => {
  const lang = langSchema.parse(req.query.lang);
  const data = await publicService.getLatestRelease(lang);
  return ok(res, { release: data });
});