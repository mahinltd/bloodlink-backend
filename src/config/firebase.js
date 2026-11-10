import admin from 'firebase-admin';
import { env } from './env.js';
import ApiError from '../utils/ApiError.js';

let app = null;

export const getFirebaseMessaging = () => {
  if (!app) {
    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      throw ApiError.internal('Firebase is not configured. Set FIREBASE_* in .env', 'FIREBASE_NOT_CONFIGURED');
    }
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  return admin.messaging();
};