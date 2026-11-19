// BloodLink Backend - Util: Helpers
// User input থেকে regex injection রোধ
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ?page=1&limit=20 → { page, limit, skip }
const buildPagination = (query, defaults = {}) => {
  const maxLimit = defaults.maxLimit || 50;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaults.limit || 20));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { escapeRegex, buildPagination };