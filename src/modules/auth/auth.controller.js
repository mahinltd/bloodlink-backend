import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/ApiResponse.js';
import * as authService from './auth.service.js';
import { env } from '../../config/env.js';
import { durationToMs } from '../../utils/jwt.util.js';

const REFRESH_COOKIE = 'refreshToken';

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES),
  });
};

// কুকি (ওয়েব) বা বডি (মোবাইল অ্যাপ) — দুই জায়গা থেকেই নেয়
const readRefreshToken = (req) => req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;

export const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body, req);
  created(res, data, 'Registration successful. Please verify your email.');
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const data = await authService.verifyEmail(req.body, req);
  setRefreshCookie(res, data.tokens.refreshToken);
  ok(res, data, 'Email verified successfully');
});

export const resendOtp = asyncHandler(async (req, res) => {
  const data = await authService.resendOtp(req.body);
  ok(res, data, 'OTP sent');
});

export const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body, req);
  setRefreshCookie(res, data.tokens.refreshToken);
  ok(res, data, 'Login successful');
});

export const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refresh(readRefreshToken(req), req);
  setRefreshCookie(res, data.tokens.refreshToken);
  ok(res, data);
});

export const logout = asyncHandler(async (req, res) => {
  const data = await authService.logout(req.auth.userId, readRefreshToken(req));
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  ok(res, data, 'Logged out');
});

export const logoutAll = asyncHandler(async (req, res) => {
  const data = await authService.logoutAll(req.auth.userId);
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  ok(res, data, 'Logged out from all devices');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.body);
  ok(res, data, 'If the email exists, a reset code has been sent');
});

export const verifyResetOtp = asyncHandler(async (req, res) => {
  const data = await authService.verifyResetOtp(req.body);
  ok(res, data);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body);
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  ok(res, data, 'Password has been reset. Please login.');
});

export const changePassword = asyncHandler(async (req, res) => {
  const data = await authService.changePassword(req.auth.userId, req.body);
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  ok(res, data, 'Password changed. Please login again.');
});