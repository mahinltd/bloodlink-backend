// BloodLink Backend - Config: Firebase Admin (FCM)
const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const env = require('./env');
const logger = require('../utils/logger');

let messaging = null;

if (env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey) {
  try {
    let privateKey = env.firebase.privateKey.trim();

    privateKey = privateKey
      .replace(/^"(.*)"$/s, '$1')
      .replace(/^'(.*)'$/s, '$1')
      .replace(/\\+["']\s*$/, '')
      .replace(/\\+\s*$/, '')
      .trim();

    privateKey = privateKey.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');

    if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN RSA PRIVATE KEY')) {
      const decoded = Buffer.from(privateKey, 'base64').toString('utf8');
      if (decoded.includes('BEGIN PRIVATE KEY') || decoded.includes('BEGIN RSA PRIVATE KEY')) {
        privateKey = decoded;
      }
    }

    if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN RSA PRIVATE KEY')) {
      throw new Error(
        'FIREBASE_PRIVATE_KEY is not a PEM private key. Use the "private_key" value from the Firebase service-account JSON.'
      );
    }

    const credentialFactory = admin.credential?.cert || admin.cert;
    const credential = credentialFactory({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey,
    });

    let firebaseApp;
    const apps = typeof admin.getApps === 'function' ? admin.getApps() : [];
    firebaseApp = apps.find((app) => app.name === '[DEFAULT]');
    if (!firebaseApp) {
      firebaseApp = admin.initializeApp({ credential });
    }

    messaging = getMessaging(firebaseApp);
    logger.success('Firebase Admin initialized (FCM ready).');
  } catch (err) {
    messaging = null;
    logger.error(`Firebase Admin initialization failed: ${err.message}`);
  }
} else {
  logger.warn('Firebase credentials missing — push notifications will print to console in dev mode.');
}

module.exports = { admin, messaging };