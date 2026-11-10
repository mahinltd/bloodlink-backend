import { asyncHandler } from '../../utils/asyncHandler.js';
import { created } from '../../utils/ApiResponse.js';
import * as service from './reports.service.js';

export const create = asyncHandler(async (req, res) =>
	created(res, await service.createReport(req.auth.userId, req.body), 'Report submitted')
);
