import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as service from './uploads.service.js';

export const signUpload = asyncHandler(async (req, res) =>
  ok(res, await service.createUploadSignature(req.body.preset, req.auth.userId))
);