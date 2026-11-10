import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './cms.service.js';
import { z } from 'zod';

const cmsSectionSchema = z.record(z.string(), z.any());

export const getCmsContent = asyncHandler(async (req, res) => {
  const data = await service.getCmsContent();
  return ApiResponse.ok(res, data);
});

export const updateCmsSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  const data = cmsSectionSchema.parse(req.body);
  const result = await service.updateCmsSection(section, data, req.admin?.adminId || req.user?._id, req);
  return ApiResponse.ok(res, { section, content: result });
});