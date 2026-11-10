import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as donationCardService from './donationCard.service.js';

export const getDonationCard = asyncHandler(async (req, res) => {
  const data = await donationCardService.getDonationCardForUser(req.auth.userId);
  return ok(res, data);
});

export const dismissDonationCard = asyncHandler(async (req, res) => {
  const data = await donationCardService.dismissDonationCard(req.auth.userId);
  return ok(res, data);
});