import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './locationAdmin.service.js';
import { z } from 'zod';

const villageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

const importSchema = z.object({
  divisions: z.array(z.object({
    nameEn: z.string(),
    nameBn: z.string(),
  })).optional(),
  districts: z.array(z.object({
    divisionNameEn: z.string(),
    nameEn: z.string(),
    nameBn: z.string(),
  })).optional(),
  upazilas: z.array(z.object({
    divisionNameEn: z.string(),
    districtNameEn: z.string(),
    nameEn: z.string(),
    nameBn: z.string(),
  })).optional(),
  unions: z.array(z.object({
    divisionNameEn: z.string(),
    districtNameEn: z.string(),
    upazilaNameEn: z.string(),
    nameEn: z.string(),
    nameBn: z.string(),
  })).optional(),
  villages: z.array(z.object({
    divisionNameEn: z.string(),
    districtNameEn: z.string(),
    upazilaNameEn: z.string(),
    unionNameEn: z.string(),
    nameBn: z.string(),
    nameEn: z.string().optional(),
  })).optional(),
});

const actorId = (req) => req.admin?.adminId || req.user?._id;

export const getVillageRequests = asyncHandler(async (req, res) => {
  const query = villageQuerySchema.parse(req.query);
  const data = await service.getVillageRequests(query);
  return ApiResponse.ok(res, data);
});

export const approveVillage = asyncHandler(async (req, res) => {
  const village = await service.approveVillage(req.params.id, actorId(req), req);
  return ApiResponse.ok(res, { village });
});

export const rejectVillage = asyncHandler(async (req, res) => {
  const result = await service.rejectVillage(req.params.id, actorId(req), req);
  return ApiResponse.ok(res, result);
});

export const getPendingHospitals = asyncHandler(async (req, res) => {
  const query = z.object({ page: z.coerce.number().default(1), limit: z.coerce.number().default(20) }).parse(req.query);
  const data = await service.getPendingHospitals(query);
  return ApiResponse.ok(res, data);
});

export const approveHospital = asyncHandler(async (req, res) => {
  const hospital = await service.approveHospital(req.params.id, actorId(req), req);
  return ApiResponse.ok(res, { hospital });
});

export const rejectHospital = asyncHandler(async (req, res) => {
  const result = await service.rejectHospital(req.params.id, actorId(req), req);
  return ApiResponse.ok(res, result);
});

export const importLocations = asyncHandler(async (req, res) => {
  const data = importSchema.parse(req.body);
  const result = await service.importLocations(data, actorId(req), req);
  return ApiResponse.ok(res, result);
});