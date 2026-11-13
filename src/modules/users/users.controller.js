import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/ApiResponse.js';
import * as service from './users.service.js';

export const getMe = asyncHandler(async (req, res) => ok(res, await service.getMe(req.auth.userId)));

export const acceptTerms = asyncHandler(async (req, res) =>
  ok(res, await service.acceptTerms(req.auth.userId, req.body.termsVersion), 'Terms accepted')
);

export const updateMe = asyncHandler(async (req, res) =>
  ok(res, await service.updateMe(req.auth.userId, req.body), 'Profile updated')
);

export const updateAvatar = asyncHandler(async (req, res) =>
  ok(res, await service.updateAvatar(req.auth.userId, req.body.avatar), 'Avatar updated')
);

export const enableDonorMode = asyncHandler(async (req, res) =>
  created(res, await service.enableDonorMode(req.auth.userId, req.body), 'Donor mode enabled')
);

export const setAvailability = asyncHandler(async (req, res) =>
  ok(res, await service.setAvailability(req.auth.userId, req.body.isAvailable))
);

export const updateSettings = asyncHandler(async (req, res) =>
  ok(res, await service.updateSettings(req.auth.userId, req.body), 'Settings updated')
);

export const updateLocation = asyncHandler(async (req, res) =>
  ok(res, await service.updateLocation(req.auth.userId, req.body))
);

export const registerDevice = asyncHandler(async (req, res) =>
  ok(res, await service.registerDevice(req.auth.userId, req.body), 'Device registered')
);

export const removeDevice = asyncHandler(async (req, res) =>
  ok(res, await service.removeDevice(req.auth.userId, req.params.token || req.body.fcmToken), 'Device removed')
);

export const submitIdVerification = asyncHandler(async (req, res) =>
  ok(res, await service.submitIdVerification(req.auth.userId, req.body), 'ID submitted for review')
);

export const getIdVerification = asyncHandler(async (req, res) =>
  ok(res, await service.getIdVerification(req.auth.userId))
);

export const getDonations = asyncHandler(async (req, res) =>
  ok(res, await service.getDonations(req.auth.userId))
);

export const deleteAccount = asyncHandler(async (req, res) =>
  ok(res, await service.deleteAccount(req.auth.userId, req.body.password), 'Account deleted')
);