import ApiError from '../../utils/ApiError.js';

export const expectedUrgency = (neededBy, rules, now = Date.now()) => {
  const sosMaxHours = Number(rules?.sosMaxHours ?? 6);
  const urgentHours = Number(rules?.urgentHours ?? 24);
  if (!Number.isFinite(sosMaxHours) || !Number.isFinite(urgentHours) || sosMaxHours <= 0 || urgentHours <= sosMaxHours) {
    throw ApiError.internal('Urgency window configuration is invalid', 'INVALID_URGENCY_CONFIG');
  }

  const hoursUntilNeeded = (new Date(neededBy).getTime() - now) / 3600000;
  if (hoursUntilNeeded <= sosMaxHours) return 'sos';
  if (hoursUntilNeeded <= urgentHours) return 'urgent';
  return 'normal';
};

export const normalMaxDays = (rules) => {
  const maxDays = Number(rules?.normalMaxDays ?? 7);
  const urgentHours = Number(rules?.urgentHours ?? 24);
  if (!Number.isFinite(maxDays) || maxDays <= 0 || maxDays * 24 <= urgentHours) {
    throw ApiError.internal('Normal request window configuration is invalid', 'INVALID_URGENCY_CONFIG');
  }
  return maxDays;
};

export const resolveUrgency = (requestedUrgency, neededBy, rules, now = Date.now()) => {
  const expected = expectedUrgency(neededBy, rules, now);
  if (requestedUrgency && requestedUrgency !== expected) {
    throw ApiError.badRequest(
      `Urgency must be "${expected}" for the selected needed-by time`,
      'URGENCY_WINDOW_MISMATCH'
    );
  }
  return expected;
};
