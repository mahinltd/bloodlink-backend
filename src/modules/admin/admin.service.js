import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { env } from "../../config/env.js";
import ApiError from "../../utils/ApiError.js";
import { AdminUser } from "./adminUser.model.js";
import { AuditLog } from "./auditLog.model.js";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
} from "../../utils/totp.util.js";

const ADMIN_TOKEN_EXPIRES = process.env.JWT_ADMIN_EXPIRES || "12h";
const TWO_FA_TEMP_EXPIRES = "5m";
const SALT = Number(env.BCRYPT_SALT_ROUNDS) || 12;

const signAdminToken = (admin) =>
  jwt.sign(
    { sub: admin._id.toString(), scope: "admin", role: admin.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRES },
  );

const sign2faTempToken = (adminId) =>
  jwt.sign(
    { sub: adminId.toString(), scope: "admin-2fa" },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: TWO_FA_TEMP_EXPIRES,
    },
  );

// ── Audit helper — অন্য সব admin module থেকেও এটাই ব্যবহার হবে ──
export async function logAudit({
  adminId,
  action,
  targetType = null,
  targetId = null,
  meta = {},
  req = null,
}) {
  try {
    await AuditLog.create({
      adminId,
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      meta,
      ip: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
    });
  } catch {
    // audit লিখতে ব্যর্থ হলেও মূল অপারেশন আটকাব না
  }
}

// ── Auth ──
export async function login({ email, password }, req) {
  const admin = await AdminUser.findOne({ email }).select(
    "+passwordHash +totpSecret",
  );
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (admin.status !== "active")
    throw ApiError.forbidden("Admin account is suspended");

  if (admin.totpEnabled) {
    return { requires2fa: true, tempToken: sign2faTempToken(admin._id) };
  }

  admin.lastLoginAt = new Date();
  await admin.save();
  await logAudit({ adminId: admin._id, action: "admin.login", req });

  return {
    requires2fa: false,
    accessToken: signAdminToken(admin),
    admin: admin.toJSON(),
  };
}

export async function verify2fa({ tempToken, code }, req) {
  let payload;
  try {
    payload = jwt.verify(tempToken, env.JWT_ACCESS_SECRET);
  } catch {
    throw ApiError.unauthorized("Invalid or expired 2FA session");
  }
  if (payload.scope !== "admin-2fa")
    throw ApiError.unauthorized("Invalid 2FA session");

  const admin = await AdminUser.findById(payload.sub).select("+totpSecret");
  if (
    !admin ||
    admin.status !== "active" ||
    !admin.totpEnabled ||
    !admin.totpSecret
  ) {
    throw ApiError.unauthorized("Invalid 2FA session");
  }
  if (!verifyTotp(admin.totpSecret, code, 1)) {
    throw ApiError.unauthorized("Invalid authenticator code");
  }

  admin.lastLoginAt = new Date();
  await admin.save();
  await logAudit({ adminId: admin._id, action: "admin.login_2fa", req });

  return { accessToken: signAdminToken(admin), admin: admin.toJSON() };
}

export async function changePassword(
  adminId,
  { currentPassword, newPassword },
  req,
) {
  const admin = await AdminUser.findById(adminId).select("+passwordHash");
  if (!admin) throw ApiError.notFound("Admin not found");
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    throw ApiError.unauthorized("Current password is wrong");
  }

  admin.passwordHash = await bcrypt.hash(newPassword, SALT);
  await admin.save();
  await logAudit({ adminId, action: "admin.change_password", req });
  return { changed: true };
}

// ── 2FA setup ──
export async function setup2fa(adminId) {
  const admin = await AdminUser.findById(adminId);
  if (!admin) throw ApiError.notFound("Admin not found");
  if (admin.totpEnabled) throw ApiError.badRequest("2FA is already enabled");

  const secret = generateTotpSecret();
  admin.pendingTotpSecret = secret;
  await admin.save();

  return {
    secret,
    otpauthUrl: buildOtpauthUrl({
      issuer: "BloodLink Admin",
      account: admin.email,
      secret,
    }),
  };
}

export async function enable2fa(adminId, code, req) {
  const admin = await AdminUser.findById(adminId).select("+pendingTotpSecret");
  if (!admin) throw ApiError.notFound("Admin not found");
  if (!admin.pendingTotpSecret)
    throw ApiError.badRequest("Run 2FA setup first");
  if (!verifyTotp(admin.pendingTotpSecret, code, 1)) {
    throw ApiError.badRequest("Invalid authenticator code");
  }

  admin.totpSecret = admin.pendingTotpSecret;
  admin.pendingTotpSecret = null;
  admin.totpEnabled = true;
  await admin.save();
  await logAudit({ adminId, action: "admin.2fa_enable", req });
  return { enabled: true };
}

export async function disable2fa(adminId, password, req) {
  const admin = await AdminUser.findById(adminId).select("+passwordHash");
  if (!admin) throw ApiError.notFound("Admin not found");
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    throw ApiError.unauthorized("Wrong password");
  }

  admin.totpSecret = null;
  admin.pendingTotpSecret = null;
  admin.totpEnabled = false;
  await admin.save();
  await logAudit({ adminId, action: "admin.2fa_disable", req });
  return { enabled: false };
}

// ── Admin management (superAdmin) ──
export async function listAdmins() {
  return AdminUser.find().sort({ createdAt: -1 });
}

export async function createAdmin(data, actorId, req) {
  const exists = await AdminUser.findOne({ email: data.email });
  if (exists)
    throw ApiError.conflict("An admin with this email already exists");

  const admin = await AdminUser.create({
    email: data.email,
    name: data.name,
    passwordHash: await bcrypt.hash(data.password, SALT),
    role: data.role || "viewer",
  });

  await logAudit({
    adminId: actorId,
    action: "admin.create",
    targetType: "adminUser",
    targetId: admin._id,
    meta: { email: admin.email, role: admin.role },
    req,
  });
  return admin;
}

export async function updateAdmin(adminId, data, actorId, req) {
  if (adminId === actorId.toString() && (data.role || data.status)) {
    throw ApiError.badRequest("You cannot change your own role or status");
  }
  const admin = await AdminUser.findById(adminId);
  if (!admin) throw ApiError.notFound("Admin not found");

  const before = { name: admin.name, role: admin.role, status: admin.status };
  if (data.name) admin.name = data.name;
  if (data.role) admin.role = data.role;
  if (data.status) admin.status = data.status;
  await admin.save();

  await logAudit({
    adminId: actorId,
    action: "admin.update",
    targetType: "adminUser",
    targetId: admin._id,
    meta: {
      before,
      after: { name: admin.name, role: admin.role, status: admin.status },
    },
    req,
  });
  return admin;
}

// ── Audit logs ──
export async function getAuditLogs({ page, limit, action, adminId }) {
  const filter = {};
  if (action) filter.action = action;
  if (adminId) filter.adminId = adminId;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("adminId", "email name role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}
