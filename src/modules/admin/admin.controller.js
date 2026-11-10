import { asyncHandler } from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import * as adminService from "./admin.service.js";
import {
  loginSchema,
  verify2faSchema,
  enable2faSchema,
  disable2faSchema,
  changePasswordSchema,
  createAdminSchema,
  updateAdminSchema,
  auditLogQuerySchema,
} from "./admin.validation.js";

// protectAdmin req.admin নাকি req.user সেট করে — দুটোই সামলানো হচ্ছে
const actor = (req) =>
  req.admin ? { _id: req.admin.adminId, role: req.admin.role } : req.user;

export const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const result = await adminService.login(data, req);
  return ApiResponse.ok(res, result);
});

export const verify2fa = asyncHandler(async (req, res) => {
  const data = verify2faSchema.parse(req.body);
  const result = await adminService.verify2fa(data, req);
  return ApiResponse.ok(res, result);
});

export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, { admin: actor(req) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const result = await adminService.changePassword(actor(req)._id, data, req);
  return ApiResponse.ok(res, result);
});

export const setup2fa = asyncHandler(async (req, res) => {
  const result = await adminService.setup2fa(actor(req)._id);
  return ApiResponse.ok(res, result);
});

export const enable2fa = asyncHandler(async (req, res) => {
  const data = enable2faSchema.parse(req.body);
  const result = await adminService.enable2fa(actor(req)._id, data.code, req);
  return ApiResponse.ok(res, result);
});

export const disable2fa = asyncHandler(async (req, res) => {
  const data = disable2faSchema.parse(req.body);
  const result = await adminService.disable2fa(
    actor(req)._id,
    data.password,
    req,
  );
  return ApiResponse.ok(res, result);
});

export const listAdmins = asyncHandler(async (req, res) => {
  const admins = await adminService.listAdmins();
  return ApiResponse.ok(res, { admins });
});

export const createAdmin = asyncHandler(async (req, res) => {
  const data = createAdminSchema.parse(req.body);
  const admin = await adminService.createAdmin(data, actor(req)._id, req);
  return ApiResponse.created(res, { admin });
});

export const updateAdmin = asyncHandler(async (req, res) => {
  const data = updateAdminSchema.parse(req.body);
  const admin = await adminService.updateAdmin(
    req.params.id,
    data,
    actor(req)._id,
    req,
  );
  return ApiResponse.ok(res, { admin });
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const query = auditLogQuerySchema.parse(req.query);
  const result = await adminService.getAuditLogs(query);
  return ApiResponse.ok(res, result);
});
