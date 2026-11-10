import { Resend } from 'resend';
import { env } from './env.js';
import ApiError from '../utils/ApiError.js';

let client = null;

export const getResend = () => {
  if (!client) {
    if (!env.RESEND_API_KEY) {
      throw ApiError.internal('Resend is not configured. Set RESEND_API_KEY in .env', 'RESEND_NOT_CONFIGURED');
    }
    client = new Resend(env.RESEND_API_KEY);
  }
  return client;
};