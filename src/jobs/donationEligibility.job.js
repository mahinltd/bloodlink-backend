import cron from 'node-cron';
import { env } from '../config/env.js';
import { getBusinessRules } from '../modules/config/config.service.js';
import { DonorProfile } from '../modules/users/donorProfile.model.js';
import { User } from '../modules/users/user.model.js';
import { buildUnsubscribeToken, notifyOne } from '../modules/notifications/notifications.service.js';
import { sendEmail } from '../modules/notifications/email.service.js';
import { renderBrandedEmail } from '../modules/notifications/emailTemplates.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const sendEligibilityEmail = (user) => {
	const isBangla = user.language === 'bn';
	const token = buildUnsubscribeToken(user._id.toString());
	const unsubscribeUrl = `${env.PUBLIC_API_URL.replace(/\/$/, '')}/v1/email/unsubscribe?token=${encodeURIComponent(token)}`;

	return sendEmail({
		to: user.email,
		subject: isBangla ? 'আপনি আবার রক্ত দিতে পারবেন' : 'You may be eligible to donate again',
		html: renderBrandedEmail({ content: isBangla
			? `<p>আপনার রক্তদানের বিরতি শেষ হয়েছে। রক্তদানের আগে ব্লাড ব্যাংকের স্বাস্থ্য পরীক্ষা সম্পন্ন করুন।</p><p><a href="${unsubscribeUrl}">উৎসাহমূলক ইমেইল বন্ধ করুন</a></p>`
			: `<p>Your donation interval has passed. Please complete the blood bank's health screening before donating.</p><p><a href="${unsubscribeUrl}">Unsubscribe from motivational emails</a></p>` }),
	});
};

const dispatchEligibilityReminders = async () => {
	const { donor } = await getBusinessRules();
	const eligibleBefore = new Date(Date.now() - donor.donationGapDays * DAY_MS);
	const profiles = await DonorProfile.find({
		lastDonationDate: { $ne: null, $lte: eligibleBefore },
		$or: [{ eligibilityNotifiedFor: null }, { eligibilityNotifiedFor: { $exists: false } }],
	})
		.select('userId lastDonationDate')
		.limit(500);

	let notified = 0;
	for (const profile of profiles) {
		const user = await User.findOne({ _id: profile.userId, status: 'active', emailVerifiedAt: { $ne: null } })
			.select('email language notificationPrefs')
			.lean();
		if (!user) continue;

		const claim = await DonorProfile.updateOne(
			{
				_id: profile._id,
				lastDonationDate: profile.lastDonationDate,
				eligibilityNotifiedFor: { $ne: profile.lastDonationDate },
			},
			{ $set: { eligibilityNotifiedFor: profile.lastDonationDate } }
		);
		if (!claim.modifiedCount) continue;

		const lang = user.language === 'bn' ? 'bn' : 'en';
		await notifyOne({
			userId: user._id,
			type: 'motivation',
			title: { bn: 'আপনি আবার রক্ত দিতে পারবেন', en: 'You may be eligible to donate again' },
			body: {
				bn: 'রক্তদানের বিরতি শেষ হয়েছে। দানের আগে ব্লাড ব্যাংকের স্বাস্থ্য পরীক্ষা সম্পন্ন করুন।',
				en: 'Your donation interval has passed. Complete the blood bank health screening before donating.',
			},
			data: { kind: 'donation_eligibility', language: lang },
		}).catch((error) => logger.error('[Job] Eligibility push failed:', error.message));

		if (user.notificationPrefs?.email !== false && user.notificationPrefs?.motivation !== false) {
			await sendEligibilityEmail(user).catch((error) =>
				logger.error('[Job] Eligibility email failed:', error.message)
			);
		}
		notified += 1;
	}

	if (notified) logger.info(`[Job] Sent ${notified} donation eligibility reminder(s)`);
	return { notified };
};

export const startDonationEligibilityJob = () => {
	cron.schedule('0 9 * * *', () => {
		dispatchEligibilityReminders().catch((error) =>
			logger.error('[Job] Donation eligibility reminders failed:', error.message)
		);
	}, { timezone: 'Asia/Dhaka' });
};
