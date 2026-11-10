import { z } from "zod";

const roleEnum = z.enum(["superAdmin", "moderator", "contentEditor", "viewer"]);

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const verify2faSchema = z.object({
  tempToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const enable2faSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const disable2faSchema = z.object({
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export const createAdminSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(2).max(80).trim(),
  password: z.string().min(8).max(72),
  role: roleEnum.default("viewer"),
});

export const updateAdminSchema = z
  .object({
    name: z.string().min(2).max(80).trim().optional(),
    role: roleEnum.optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .refine((d) => d.name || d.role || d.status, {
    message: "Nothing to update",
  });

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().max(80).optional(),
  adminId: z.string().optional(),
});
