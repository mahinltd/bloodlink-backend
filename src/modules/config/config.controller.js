import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import * as service from './config.service.js';

export const getConfig = asyncHandler(async (req, res) => {
  const { payload, etag } = await service.getPublicConfig();

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache'); // সবসময় revalidate, পরিবর্তন না থাকলে 304

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  ok(res, payload);
});

export const getTranslations = asyncHandler(async (req, res) => {
  const map = await service.getTranslationMap(req.params.lang);
  res.setHeader('Cache-Control', 'public, max-age=300');
  ok(res, { lang: req.params.lang, version: map.version, strings: map.strings });
});