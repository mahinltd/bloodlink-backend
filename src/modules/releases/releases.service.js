import crypto from 'node:crypto';
import { Release } from './release.model.js';

export async function getLatestPublishedRelease() {
  return Release.findOne({ status: 'published' }).sort({ versionCode: -1 }).lean();
}

// একই device সবসময় একই bucket-এ পড়বে — deterministic rollout
function rolloutBucket(deviceId, versionCode) {
  const hash = crypto.createHash('sha256').update(`${deviceId}:${versionCode}`).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

function shapeRelease(release, lang = 'bn') {
  return {
    versionCode: release.versionCode,
    versionName: release.versionName,
    releaseNotes: release.releaseNotes?.[lang] || release.releaseNotes?.bn || '',
    downloadUrl: release.apkUrl,
    sha256: release.sha256,
    fileSizeBytes: release.fileSizeBytes,
    mandatory: release.mandatory,
    publishedAt: release.publishedAt,
  };
}

export async function checkAppVersion({ currentVersionCode = 0, deviceId, lang = 'bn' }) {
  const latest = await getLatestPublishedRelease();
  if (!latest) return { updateAvailable: false, latest: null };

  const current = Number.isInteger(currentVersionCode) ? currentVersionCode : 0;

  if (current >= latest.versionCode) {
    return { updateAvailable: false, mandatory: false, latest: shapeRelease(latest, lang) };
  }

  const mandatory =
    latest.mandatory ||
    (latest.minSupportedVersionCode > 0 && current < latest.minSupportedVersionCode);

  // Mandatory updates must remain available outside staged rollouts.
  if (!mandatory && latest.rolloutPercent < 100) {
    if (!deviceId) {
      return { updateAvailable: false, reason: 'device_id_required', latest: shapeRelease(latest, lang) };
    }
    if (rolloutBucket(deviceId, latest.versionCode) >= latest.rolloutPercent) {
      return { updateAvailable: false, reason: 'not_in_rollout', latest: shapeRelease(latest, lang) };
    }
  }

  return { updateAvailable: true, mandatory, latest: shapeRelease(latest, lang) };
}

export async function getLatestReleaseForSite(lang = 'bn') {
  const latest = await getLatestPublishedRelease();
  if (!latest) return null;
  return shapeRelease(latest, lang);
}