import { AppConfig } from '../config/appConfig.model.js';
import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { Donation } from '../requests/donation.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CARD = {
  enabled: true,
  title: { bn: 'BloodLink-কে সহযোগিতা করুন', en: 'Support BloodLink' },
  message: {
    bn: 'আপনার রক্তদানে বেঁচে উঠেছে একটি প্রাণ। এই প্ল্যাটফর্মটি সবার জন্য ফ্রি রাখতে সামান্য অনুদানে পাশে দাঁড়ান।',
    en: 'Your donation saved a life. Support us with a small contribution to keep this platform free for everyone.',
  },
  bkashNumber: '',
  qrImageUrl: '',
  disclaimer: {
    bn: 'রক্ত সবসময় বিনামূল্যে। এই অনুদান শুধুমাত্র প্ল্যাটফর্ম রক্ষণাবেক্ষণের জন্য এবং সম্পূর্ণ ঐচ্ছিক।',
    en: 'Blood is always free. This contribution is only for platform maintenance and completely voluntary.',
  },
};

async function getDonationCardConfig() {
  const config = await AppConfig.findOne({ status: 'published' }).sort({ version: -1 }).lean();
  const rules = config?.businessRules || {};
  const card = config?.donationCard || {};
  return {
    card: {
      ...DEFAULT_CARD,
      ...card,
      title: { ...DEFAULT_CARD.title, ...(card.title || {}) },
      message: { ...DEFAULT_CARD.message, ...(card.message || {}) },
      disclaimer: { ...DEFAULT_CARD.disclaimer, ...(card.disclaimer || {}) },
    },
    cooldownDays:
      Number(rules.donationCardCooldownDays ?? rules.donationCard?.cooldownDays) > 0
        ? Number(rules.donationCardCooldownDays ?? rules.donationCard?.cooldownDays)
        : 30,
  };
}

const pick = (field, lang) => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.bn || field.en || '';
};

export async function getDonationCardForUser(userId) {
  const [{ card, cooldownDays }, latestDonation, user] = await Promise.all([
    getDonationCardConfig(),
    Donation.findOne({ $or: [{ donorId: userId }, { requesterId: userId }] }).sort({ date: -1 }).select('date').lean(),
    User.findById(userId).select('language donationCardDismissedAt').lean(),
  ]);

  if (!card.enabled) return { show: false };
  if (!latestDonation) return { show: false };

  // Dismiss cooldown — ৩০ দিনের আগে আবার দেখাব না, তবে নতুন donation হলে দেখাবে
  const dismissedAt = user?.donationCardDismissedAt ? new Date(user.donationCardDismissedAt) : null;
  if (dismissedAt) {
    const donatedAgainAfterDismiss = new Date(latestDonation.date) > dismissedAt;
    const cooldownPassed = Date.now() - dismissedAt.getTime() >= cooldownDays * DAY_MS;
    if (!donatedAgainAfterDismiss && !cooldownPassed) return { show: false };
  }

  const lang = user?.language === 'en' ? 'en' : 'bn';
  return {
    show: true,
    card: {
      title: pick(card.title, lang),
      message: pick(card.message, lang),
      bkashNumber: card.bkashNumber || '',
      qrImageUrl: card.qrImageUrl || '',
      disclaimer: pick(card.disclaimer, lang),
    },
  };
}

export async function dismissDonationCard(userId) {
  const dismissedAt = new Date();
  await User.findByIdAndUpdate(userId, { donationCardDismissedAt: dismissedAt });
  return { dismissedAt };
}