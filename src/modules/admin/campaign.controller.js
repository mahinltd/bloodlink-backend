import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './campaign.service.js';
import { z } from 'zod';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.object({ bn: z.string().min(1), en: z.string().min(1) }),
  body: z.object({ bn: z.string().min(1), en: z.string().min(1) }),
  channel: z.enum(['urgent_requests', 'blood_requests', 'responses', 'messages', 'account', 'motivation', 'email']).default('account'),
  segment: z.object({
    type: z.enum(['all', 'donors', 'bloodGroup', 'division', 'inactive']),
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
    divisionId: z.string().optional(),
    inactiveDays: z.coerce.number().min(1).default(30),
  }),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'scheduled', 'sent', 'cancelled']).optional(),
});

export const createCampaign = asyncHandler(async (req, res) => {
  const data = createCampaignSchema.parse(req.body);
  const campaign = await service.createCampaign(data, req.admin?.adminId || req.user?._id, req);
  return ApiResponse.created(res, { campaign });
});

export const listCampaigns = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const data = await service.listCampaigns(query);
  return ApiResponse.ok(res, data);
});

export const sendCampaign = asyncHandler(async (req, res) => {
  const result = await service.sendCampaign(req.params.id, req.admin?.adminId || req.user?._id, req);
  return ApiResponse.ok(res, result);
});

export const scheduleCampaign = asyncHandler(async (req, res) => {
  const { scheduledAt } = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
  const campaign = await service.scheduleCampaign(req.params.id, scheduledAt, req.admin?.adminId || req.user?._id, req);
  return ApiResponse.ok(res, { campaign });
});