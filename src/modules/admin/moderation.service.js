import ApiError from '../../utils/ApiError.js';
import { User } from '../users/user.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { Donation } from '../requests/donation.model.js';
import { IdVerification } from '../users/idVerification.model.js';
import { Device } from '../notifications/device.model.js';
import { RefreshToken } from '../auth/refreshToken.model.js';
import { BloodRequest } from '../requests/bloodRequest.model.js';
import { RequestResponse } from '../requests/requestResponse.model.js';
import { Report } from '../reports/report.model.js';
import { Message } from '../chat/message.model.js';
import { notifyOne } from '../notifications/notifications.service.js';
import { getCloudinary } from '../../config/cloudinary.js';
import { logAudit } from './admin.service.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function notifyUser(userId, { titleBn, titleEn, bodyBn, bodyEn, data = {} }) {
	try {
		await notifyOne({
			userId,
			type: 'account',
			title: { bn: titleBn, en: titleEn },
			body: { bn: bodyBn, en: bodyEn },
			data: { type: 'account', ...data },
		});
	} catch {
		// Notification failure must not block moderation.
	}
}

// ── Users ──
export async function listUsers({ page, limit, q, status, bloodGroup }) {
	const filter = {};
	if (status) filter.status = status;
	if (q) {
		const regex = new RegExp(escapeRegex(q), 'i');
		filter.$or = [{ email: regex }, { name: regex }, { phone: regex }];
	}
	if (bloodGroup) {
		const userIds = await DonorProfile.find({ bloodGroup }).distinct('userId');
		filter._id = { $in: userIds };
	}

	const skip = (page - 1) * limit;
	const [users, total] = await Promise.all([
		User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
		User.countDocuments(filter),
	]);

	const profiles = await DonorProfile.find({ userId: { $in: users.map((user) => user._id) } })
		.select('userId bloodGroup isAvailable idVerified donationCount lastDonationDate')
		.lean();
	const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

	const items = users.map((user) => ({
		...user,
		donorProfile: profileByUser.get(user._id.toString()) || null,
	}));
	return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export async function getUserDetail(userId) {
	const user = await User.findById(userId).lean();
	if (!user) throw ApiError.notFound('User not found');

	const [donorProfile, requestsCount, responsesCount, donationsCount, devicesCount, reportsAgainst, latestIdv] =
		await Promise.all([
			DonorProfile.findOne({ userId }).lean(),
			BloodRequest.countDocuments({ requesterId: userId }),
			RequestResponse.countDocuments({ donorId: userId }),
			Donation.countDocuments({ donorId: userId }),
			Device.countDocuments({ userId }),
			Report.countDocuments({ targetType: 'user', targetId: userId }),
			IdVerification.findOne({ userId }).sort({ createdAt: -1 }).lean(),
		]);

	return {
		user,
		donorProfile,
		stats: {
			requests: requestsCount,
			responses: responsesCount,
			donations: donationsCount,
			devices: devicesCount,
			reportsAgainst,
		},
		latestIdVerification: latestIdv || null,
	};
}

async function applySuspension(userId, reason = '') {
	const user = await User.findById(userId);
	if (!user || user.status === 'deleted') return null;
	user.status = 'suspended';
	user.suspendedReason = reason;
	await user.save();
	await Promise.all([
		DonorProfile.updateOne({ userId }, { isAvailable: false }),
		RefreshToken.deleteMany({ userId }),
	]);
	await notifyUser(userId, {
		titleBn: 'অ্যাকাউন্ট সাসপেন্ড করা হয়েছে',
		titleEn: 'Account suspended',
		bodyBn: reason ? `কারণ: ${reason}` : 'নীতিমালা লঙ্ঘনের কারণে আপনার অ্যাকাউন্ট সাসপেন্ড করা হয়েছে।',
		bodyEn: reason ? `Reason: ${reason}` : 'Your account has been suspended for policy violation.',
		data: { action: 'suspended' },
	});
	return user;
}

export async function setUserStatus(adminId, userId, { status, reason }, req) {
	const user = await User.findById(userId);
	if (!user) throw ApiError.notFound('User not found');
	if (user.status === 'deleted') throw ApiError.badRequest('User is deleted');

	if (status === 'suspended') {
		await applySuspension(userId, reason || '');
	} else {
		user.status = 'active';
		user.suspendedReason = '';
		await user.save();
		await notifyUser(userId, {
			titleBn: 'অ্যাকাউন্ট পুনরায় চালু হয়েছে',
			titleEn: 'Account reactivated',
			bodyBn: 'আপনার অ্যাকাউন্ট আবার সক্রিয় করা হয়েছে।',
			bodyEn: 'Your account has been reactivated.',
			data: { action: 'reactivated' },
		});
	}

	await logAudit({
		adminId,
		action: status === 'suspended' ? 'admin.user_suspend' : 'admin.user_activate',
		targetType: 'user',
		targetId: userId,
		meta: { reason: reason || '' },
		req,
	});
	return { userId, status };
}

export async function revokeUserSessions(adminId, userId, req) {
	const result = await RefreshToken.deleteMany({ userId });
	await logAudit({
		adminId,
		action: 'admin.user_revoke_sessions',
		targetType: 'user',
		targetId: userId,
		meta: { revoked: result.deletedCount },
		req,
	});
	return { revoked: result.deletedCount };
}

// ── ID Verification queue ──
async function toViewableUrl(stored) {
	if (!stored || typeof stored !== 'string') return stored ?? null;
	try {
		const cloudinary = getCloudinary();
		let publicId = stored;
		if (stored.startsWith('http')) {
			const match = stored.match(/\/upload\/(?:authenticated\/)?(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
			if (!match) return null;
			publicId = match[1];
		}
		return cloudinary.url(publicId, { sign_url: true, type: 'authenticated', secure: true });
	} catch {
		return null;
	}
}

async function deleteVerificationImages(idv) {
	const cloudinary = getCloudinary();
	const images = [idv.frontImage, idv.backImage, idv.selfie].filter(Boolean);
	const publicIds = images.map((stored) => {
		if (!stored.startsWith('http')) return stored;
		const match = stored.match(/\/upload\/(?:authenticated\/)?(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
		if (!match) throw ApiError.badRequest('Stored verification image reference is invalid');
		return match[1];
	});

	await Promise.all(
		publicIds.map((publicId) =>
			cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image', invalidate: true })
		)
	);
	idv.frontImage = null;
	idv.backImage = null;
	idv.selfie = null;
	idv.imagesDeletedAt = new Date();
}

export async function listIdVerifications({ page, limit, status }) {
	const skip = (page - 1) * limit;
	const [items, total] = await Promise.all([
		IdVerification.find({ status }).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
		IdVerification.countDocuments({ status }),
	]);
	const users = await User.find({ _id: { $in: items.map((item) => item.userId) } })
		.select('name email phone status')
		.lean();
	const userById = new Map(users.map((user) => [user._id.toString(), user]));
	return {
		items: items.map((item) => ({ ...item, user: userById.get(item.userId?.toString()) || null })),
		total,
		page,
		pages: Math.ceil(total / limit) || 1,
	};
}

export async function getIdVerificationDetail(id) {
	const idv = await IdVerification.findById(id).select('+frontImage +backImage +selfie').lean();
	if (!idv) throw ApiError.notFound('Verification request not found');
	const user = await User.findById(idv.userId).select('name email phone status').lean();
	const [front, back, selfie] = await Promise.all([
		toViewableUrl(idv.frontImage),
		toViewableUrl(idv.backImage),
		toViewableUrl(idv.selfie),
	]);
	return { ...idv, user, images: { front, back, selfie } };
}

export async function reviewIdVerification(adminId, id, action, reason, req) {
	const idv = await IdVerification.findById(id);
	if (!idv) throw ApiError.notFound('Verification request not found');
	if (idv.status !== 'pending') throw ApiError.badRequest('Already reviewed');

	if (action === 'approve') await deleteVerificationImages(idv);
	idv.status = action === 'approve' ? 'approved' : 'rejected';
	idv.reviewedBy = adminId;
	idv.reviewedAt = new Date();
	if (action === 'reject') idv.reviewNote = reason;
	await idv.save();

	if (action === 'approve') {
		await DonorProfile.updateOne({ userId: idv.userId }, { idVerified: true });
	}

	await notifyUser(idv.userId, {
		titleBn: action === 'approve' ? 'পরিচয় যাচাই সফল হয়েছে' : 'পরিচয় যাচাই বাতিল হয়েছে',
		titleEn: action === 'approve' ? 'ID verified' : 'ID verification rejected',
		bodyBn: action === 'approve' ? 'আপনার পরিচয়পত্র যাচাই সম্পন্ন হয়েছে।' : `কারণ: ${reason}`,
		bodyEn: action === 'approve' ? 'Your ID has been verified.' : `Reason: ${reason}`,
		data: { action: `idv_${action}d` },
	});

	await logAudit({
		adminId,
		action: `admin.idv_${action}`,
		targetType: 'idVerification',
		targetId: id,
		meta: { userId: idv.userId },
		req,
	});
	return { id, status: idv.status };
}

// ── Requests moderation ──
export async function listRequests({ page, limit, status, urgency, flagged, hidden, q }) {
	const filter = {};
	if (status) filter.status = status;
	if (urgency) filter.urgency = urgency;
	if (flagged !== undefined) filter.flagged = flagged === 'true';
	if (hidden !== undefined) filter.isHidden = hidden === 'true';
	if (q) {
		const regex = new RegExp(escapeRegex(q), 'i');
		filter.$or = [{ patientName: regex }, { hospitalName: regex }];
	}

	const skip = (page - 1) * limit;
	const [items, total] = await Promise.all([
		BloodRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
		BloodRequest.countDocuments(filter),
	]);
	const users = await User.find({ _id: { $in: items.map((item) => item.requesterId) } })
		.select('name email phone status')
		.lean();
	const userById = new Map(users.map((user) => [user._id.toString(), user]));
	return {
		items: items.map((item) => ({ ...item, requester: userById.get(item.requesterId?.toString()) || null })),
		total,
		page,
		pages: Math.ceil(total / limit) || 1,
	};
}

export async function getRequestDetail(id) {
	const request = await BloodRequest.findById(id).lean();
	if (!request) throw ApiError.notFound('Request not found');
	const [requester, responsesCount, reports] = await Promise.all([
		User.findById(request.requesterId).select('name email phone status').lean(),
		RequestResponse.countDocuments({ requestId: id }),
		Report.find({ targetType: 'request', targetId: id }).sort({ createdAt: -1 }).lean(),
	]);
	return { ...request, requester, responsesCount, reports };
}

export async function setRequestHidden(adminId, id, hidden, req) {
	const request = await BloodRequest.findById(id);
	if (!request) throw ApiError.notFound('Request not found');
	request.isHidden = hidden;
	await request.save();

	if (hidden) {
		await notifyUser(request.requesterId, {
			titleBn: 'রিকোয়েস্ট লুকানো হয়েছে',
			titleEn: 'Request hidden',
			bodyBn: 'নীতিমালা পর্যালোচনার কারণে আপনার রিকোয়েস্টটি সাময়িকভাবে লুকানো হয়েছে।',
			bodyEn: 'Your request has been temporarily hidden pending policy review.',
			data: { action: 'request_hidden', requestId: id },
		});
	}

	await logAudit({
		adminId,
		action: hidden ? 'admin.request_hide' : 'admin.request_unhide',
		targetType: 'request',
		targetId: id,
		req,
	});
	return { id, isHidden: hidden };
}

export async function cancelRequestByAdmin(adminId, id, req) {
	const request = await BloodRequest.findById(id);
	if (!request) throw ApiError.notFound('Request not found');
	if (request.status !== 'open') throw ApiError.badRequest('Only open requests can be cancelled');

	request.status = 'cancelled';
	await request.save();

	await notifyUser(request.requesterId, {
		titleBn: 'রিকোয়েস্ট বাতিল করা হয়েছে',
		titleEn: 'Request cancelled',
		bodyBn: 'নীতিমালা লঙ্ঘনের কারণে আপনার রক্তের রিকোয়েস্টটি বাতিল করা হয়েছে।',
		bodyEn: 'Your blood request has been cancelled due to policy violation.',
		data: { action: 'request_cancelled', requestId: id },
	});

	await logAudit({ adminId, action: 'admin.request_cancel', targetType: 'request', targetId: id, req });
	return { id, status: 'cancelled' };
}

// ── Reports queue ──
export async function listReports({ page, limit, status, targetType }) {
	const filter = { status };
	if (targetType) filter.targetType = targetType;

	const skip = (page - 1) * limit;
	const [items, total] = await Promise.all([
		Report.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
		Report.countDocuments(filter),
	]);

	const reporterIds = [...new Set(items.map((item) => item.reporterId?.toString()).filter(Boolean))];
	const requestIds = items.filter((item) => item.targetType === 'request').map((item) => item.targetId);
	const userIds = items.filter((item) => item.targetType === 'user').map((item) => item.targetId);
	const messageIds = items.filter((item) => item.targetType === 'message').map((item) => item.targetId);

	const [reporters, requestTargets, userTargets, messageTargets] = await Promise.all([
		User.find({ _id: { $in: reporterIds } }).select('name email phone').lean(),
		requestIds.length
			? BloodRequest.find({ _id: { $in: requestIds } }).select('patientName bloodGroup status isHidden').lean()
			: [],
		userIds.length ? User.find({ _id: { $in: userIds } }).select('name email phone status').lean() : [],
		messageIds.length
			? Message.find({ _id: { $in: messageIds } }).select('text senderId conversationId').lean()
			: [],
	]);
	const reporterById = new Map(reporters.map((user) => [user._id.toString(), user]));
	const targetMaps = {
		request: new Map(requestTargets.map((target) => [target._id.toString(), target])),
		user: new Map(userTargets.map((target) => [target._id.toString(), target])),
		message: new Map(messageTargets.map((target) => [target._id.toString(), target])),
	};

	return {
		items: items.map((item) => ({
			...item,
			reporter: reporterById.get(item.reporterId?.toString()) || null,
			targetSummary: targetMaps[item.targetType]?.get(item.targetId?.toString()) || null,
		})),
		total,
		page,
		pages: Math.ceil(total / limit) || 1,
	};
}

export async function resolveReport(adminId, reportId, { action, note }, req) {
	const report = await Report.findById(reportId);
	if (!report) throw ApiError.notFound('Report not found');
	if (report.status !== 'pending') throw ApiError.badRequest('Report already handled');

	if (action === 'hide_request') {
		if (report.targetType !== 'request') throw ApiError.badRequest('Action not valid for this target');
		await BloodRequest.findByIdAndUpdate(report.targetId, { isHidden: true });
	} else if (action === 'suspend_user') {
		if (report.targetType !== 'user') throw ApiError.badRequest('Action not valid for this target');
		const user = await applySuspension(report.targetId, note || 'Reported by users');
		if (!user) throw ApiError.notFound('Target user not found or already deleted');
	} else if (action === 'delete_message') {
		if (report.targetType !== 'message') throw ApiError.badRequest('Action not valid for this target');
		await Message.findByIdAndDelete(report.targetId);
	}

	const newStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
	await Report.updateMany(
		{ targetType: report.targetType, targetId: report.targetId, status: 'pending' },
		{ $set: { status: newStatus, resolvedBy: adminId, resolvedAt: new Date(), resolutionNote: note || '' } }
	);

	await logAudit({
		adminId,
		action: 'admin.report_resolve',
		targetType: report.targetType,
		targetId: report.targetId,
		meta: { action, note: note || '' },
		req,
	});
	return { id: reportId, status: newStatus, action };
}
