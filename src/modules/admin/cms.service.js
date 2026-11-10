import ApiError from '../../utils/ApiError.js';
import { AppConfig } from '../config/appConfig.model.js';
import { logAudit } from './admin.service.js';

// ══════════════════════ CMS (Legal texts, Onboarding, Contact) ══════════════════════

const CMS_SECTIONS = ['legalTexts', 'onboardingSlides', 'contact', 'developerInfo'];

export async function getCmsContent() {
  const config = await AppConfig.findOne({ status: 'published' }).sort({ version: -1 }).lean();
  if (!config) return { sections: {} };
  
  const sections = {};
  for (const key of CMS_SECTIONS) {
    if (key === 'legalTexts' && !Object.keys(config.legalTexts || {}).length) {
      sections[key] = config.legal || null;
    } else {
      sections[key] = config[key] || null;
    }
  }
  return { sections, version: config.version };
}

export async function updateCmsSection(section, data, adminId, req) {
  if (!CMS_SECTIONS.includes(section)) {
    throw ApiError.badRequest(`Invalid CMS section. Allowed: ${CMS_SECTIONS.join(', ')}`);
  }

  // Draft থেকে update করতে হবে (config workflow অনুসরণ)
  const draft = await AppConfig.findOne({ status: 'draft' });
  if (!draft) throw ApiError.notFound('No draft exists. Create config draft first.');

  const current = draft.get(section) || {};
  draft.set(section, { ...current, ...data });
  await draft.save();

  await logAudit({ adminId, action: `admin.cms_update_${section}`, targetType: 'config', targetId: draft._id, meta: { section }, req });
  return draft.get(section);
}