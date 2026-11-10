export const ok = (res, data = null, message) =>
  res.status(200).json({ success: true, ...(message ? { message } : {}), data });

export const created = (res, data = null, message) =>
  res.status(201).json({ success: true, ...(message ? { message } : {}), data });

export default { ok, created };