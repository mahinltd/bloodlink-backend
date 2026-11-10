import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/ApiResponse.js';
import * as service from './locations.service.js';

export const getDivisions = asyncHandler(async (req, res) =>
  ok(res, await service.listChildren('division', req.query))
);
export const getDistricts = asyncHandler(async (req, res) =>
  ok(res, await service.listChildren('district', req.query))
);
export const getUpazilas = asyncHandler(async (req, res) =>
  ok(res, await service.listChildren('upazila', req.query))
);
export const getUnions = asyncHandler(async (req, res) =>
  ok(res, await service.listChildren('union', req.query))
);

export const getVillages = asyncHandler(async (req, res) =>
  ok(res, await service.listVillages(req.query, req.auth?.userId))
);

export const createVillage = asyncHandler(async (req, res) => {
  const result = await service.createVillage(req.body, req.auth.userId);
  (result.alreadyExists ? ok : created)(res, result, result.alreadyExists ? 'Village already exists' : 'Village submitted');
});

export const getHospitals = asyncHandler(async (req, res) =>
  ok(res, await service.listHospitals(req.query, req.auth?.userId))
);

export const createHospital = asyncHandler(async (req, res) => {
  const result = await service.createHospital(req.body, req.auth.userId);
  (result.alreadyExists ? ok : created)(res, result, result.alreadyExists ? 'Hospital already exists' : 'Hospital submitted for review');
});