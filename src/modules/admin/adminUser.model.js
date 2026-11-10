import mongoose from "mongoose";

export const ADMIN_ROLES = [
  "superAdmin",
  "moderator",
  "contentEditor",
  "viewer",
];

const adminUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: "viewer", index: true },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    totpSecret: { type: String, select: false, default: null },
    pendingTotpSecret: { type: String, select: false, default: null },
    totpEnabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adminUserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.totpSecret;
  delete obj.pendingTotpSecret;
  return obj;
};

export const AdminUser = mongoose.model("AdminUser", adminUserSchema);
