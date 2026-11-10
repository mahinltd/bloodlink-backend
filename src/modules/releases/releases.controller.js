import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as releasesService from './releases.service.js';
import { appVersionQuerySchema } from './releases.validation.js';

export const getAppVersion = asyncHandler(async (req, res) => {
  const query = appVersionQuerySchema.parse(req.query);
  const data = await releasesService.checkAppVersion(query);
  return ok(res, data);
});