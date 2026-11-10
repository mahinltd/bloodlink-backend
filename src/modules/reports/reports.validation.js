import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createReportSchema = z.object({
	body: z.object({
		targetType: z.enum(['user', 'message']),
		targetId: objectId,
		reason: z.string().trim().min(5).max(300),
	}),
});
