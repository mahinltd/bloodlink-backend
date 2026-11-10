import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });

export const signRefreshToken = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });

// পাসওয়ার্ড রিসেটের স্বল্পমেয়াদি টোকেন (১০ মিনিট)
export const signPasswordResetToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "10m" });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET);

// '15m' / '30d' → milliseconds
const DURATION_UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export const durationToMs = (value, fallbackMs = 30 * 86_400_000) => {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  if (!match) return fallbackMs;
  return Number(match[1]) * DURATION_UNITS[match[2]];
};
