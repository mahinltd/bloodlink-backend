import { z } from "zod";

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const boolStr = z.enum(["true", "false"]).optional();

export const usersQuerySchema = z.object({
  page,
  limit,
  q: z.string().max(80).optional(),
  status: z.enum(["unverified", "active", "suspended", "deleted"]).optional(),
  bloodGroup: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional(),
});

export const setUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().max(300).optional(),
});

export const idvQuerySchema = z.object({
  page,
  limit,
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export const rejectIdvSchema = z.object({
  reason: z.string().min(2).max(300),
});

export const adminRequestsQuerySchema = z.object({
  page,
  limit,
  status: z.enum(["open", "fulfilled", "cancelled", "expired"]).optional(),
  urgency: z.enum(["normal", "urgent", "sos"]).optional(),
  flagged: boolStr,
  hidden: boolStr,
  q: z.string().max(80).optional(),
});

export const reportsQuerySchema = z.object({
  page,
  limit,
  status: z.enum(["pending", "resolved", "dismissed"]).default("pending"),
  targetType: z.enum(["request", "user", "message"]).optional(),
});

export const resolveReportSchema = z.object({
  action: z.enum(["dismiss", "hide_request", "suspend_user", "delete_message"]),
  note: z.string().max(300).optional(),
});
