import ApiError from '../../utils/ApiError.js';
import { User } from '../users/user.model.js';
import { Conversation } from '../chat/conversation.model.js';
import { Message } from '../chat/message.model.js';
import { Report } from './report.model.js';

export const createReport = async (reporterId, { targetType, targetId, reason }) => {
	if (targetType === 'user') {
		if (String(reporterId) === String(targetId)) {
			throw ApiError.badRequest('You cannot report yourself', 'CANNOT_REPORT_OWN');
		}
		const target = await User.findById(targetId).select('_id').lean();
		if (!target) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
	}

	if (targetType === 'message') {
		const message = await Message.findById(targetId).select('senderId conversationId').lean();
		if (!message) throw ApiError.notFound('Message not found', 'MESSAGE_NOT_FOUND');
		if (String(message.senderId) === String(reporterId)) {
			throw ApiError.badRequest('You cannot report your own message', 'CANNOT_REPORT_OWN');
		}
		const isParticipant = await Conversation.exists({
			_id: message.conversationId,
			participants: reporterId,
		});
		if (!isParticipant) throw ApiError.notFound('Message not found', 'MESSAGE_NOT_FOUND');
	}

	const existing = await Report.findOne({ reporterId, targetType, targetId, status: 'pending' }).lean();
	if (existing) throw ApiError.conflict('You have already reported this target', 'ALREADY_REPORTED');

	const report = await Report.create({ reporterId, targetType, targetId, reason });
	return { report };
};
