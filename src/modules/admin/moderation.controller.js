import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as dashboardService from './dashboard.service.js';
import * as moderationService from './moderation.service.js';
import {
  usersQuerySchema,
  setUserStatusSchema,
  idvQuerySchema,
  rejectIdvSchema,
  adminRequestsQuerySchema,
  reportsQuerySchema,
  resolveReportSchema,
} from './moderation.validation.js';

const actor = (req) =>
  req.admin ? { _id: req.admin.adminId, role: req.admin.role } : req.user;

export const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardStats();
  return ApiResponse.ok(res, data);
});

// Users
export const listUsers = asyncHandler(async (req, res) => {
  const query = usersQuerySchema.parse(req.query);
  const data = await moderationService.listUsers(query);
  return ApiResponse.ok(res, data);
});

export const getUserDetail = asyncHandler(async (req, res) => {
  const data = await moderationService.getUserDetail(req.params.id);
  return ApiResponse.ok(res, data);
});

export const setUserStatus = asyncHandler(async (req, res) => {
  const body = setUserStatusSchema.parse(req.body);
  const data = await moderationService.setUserStatus(actor(req)._id, req.params.id, body, req);
  return ApiResponse.ok(res, data);
});

export const revokeUserSessions = asyncHandler(async (req, res) => {
  const data = await moderationService.revokeUserSessions(actor(req)._id, req.params.id, req);
  return ApiResponse.ok(res, data);
});

// ID Verifications
export const listIdVerifications = asyncHandler(async (req, res) => {
  const query = idvQuerySchema.parse(req.query);
  const data = await moderationService.listIdVerifications(query);
  return ApiResponse.ok(res, data);
});

export const getIdVerificationDetail = asyncHandler(async (req, res) => {
  const data = await moderationService.getIdVerificationDetail(req.params.id);
  return ApiResponse.ok(res, data);
});

export const approveIdVerification = asyncHandler(async (req, res) => {
  const data = await moderationService.reviewIdVerification(actor(req)._id, req.params.id, 'approve', null, req);
  return ApiResponse.ok(res, data);
});

export const rejectIdVerification = asyncHandler(async (req, res) => {
  const body = rejectIdVationSchemaSafe(req);
  const data = await moderationService.reviewIdVerification(actor(req)._id, req.params.id, 'reject', body.reason, req);
  return ApiResponse.ok(res, data);
});

function rejectIdVationSchemaSafe(req) {
  return rejectIdvSchema.parse(req.body);
}

// Requests
export const listRequests = asyncHandler(async (req, res) => {
  const query = adminRequestsQuerySchema.parse(req.query);
  const data = await moderationService.listRequests(query);
  return ApiResponse.ok(res, data);
});

export const getRequestDetail = asyncHandler(async (req, res) => {
  const data = await moderationService.getRequestDetail(req.params.id);
  return ApiResponse.ok(res, data);
});

export const hideRequest = asyncHandler(async (req, res) => {
  const data = await moderationService.setRequestHidden(actor(req)._id, req.params.id, true, req);
  return ApiResponse.ok(res, data);
});

export const unhideRequest = asyncHandler(async (req, res) => {
  const data = await moderationService.setRequestHidden(actor(req)._id, req.params.id, false, req);
  return ApiResponse.ok(res, data);
});

export const cancelRequest = asyncHandler(async (req, res) => {
  const data = await moderationService.cancelRequestByAdmin(actor(req)._id, req.params.id, req);
  return ApiResponse.ok(res, data);
});

// Reports
export const listReports = asyncHandler(async (req, res) => {
  const query = reportsQuerySchema.parse(req.query);
  const data = await moderationService.listReports(query);
  return ApiResponse.ok(res, data);
});

export const resolveReport = asyncHandler(async (req, res) => {
  const body = resolveReportSchema.parse(req.body);
  const data = await moderationService.resolveReport(actor(req)._id, req.params.id, body, req);
  return ApiResponse.ok(res, data);
});