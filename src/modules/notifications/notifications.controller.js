import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as service from './notifications.service.js';

export const list = asyncHandler(async (req, res) =>
  ok(res, await service.listForUser(req.auth.userId, req.query))
);

export const unreadCount = asyncHandler(async (req, res) =>
  ok(res, await service.unreadCount(req.auth.userId))
);

export const markRead = asyncHandler(async (req, res) =>
  ok(res, await service.markRead(req.auth.userId, req.body))
);

export const unsubscribe = asyncHandler(async (req, res) => {
  await service.unsubscribeByToken(req.query.token);
  res
    .status(200)
    .send('<h3 style="font-family:sans-serif">আপনাকে আর উৎসাহ-ইমেইল পাঠানো হবে না। You have been unsubscribed. ✓</h3>');
});