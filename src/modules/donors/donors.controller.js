import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as service from './donors.service.js';

export const search = asyncHandler(async (req, res) =>
  ok(res, await service.searchDonors(req.query, req.auth.userId))
);

export const detail = asyncHandler(async (req, res) =>
  ok(res, await service.getDonor(req.params.id, req.auth.userId, req.query))
);

export const revealPhone = asyncHandler(async (req, res) =>
  ok(res, await service.revealPhone(req.auth.userId, req.params.id), 'Phone number revealed')
);