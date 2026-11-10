import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './chat.controller.js';
import * as v from './chat.validation.js';

const conversationRoutes = Router();
conversationRoutes.use(protect);
conversationRoutes.get('/', validate(v.listConversationsSchema), ctrl.list);
conversationRoutes.post('/', validate(v.startConversationSchema), ctrl.start);
conversationRoutes.get('/:id/messages', validate(v.messagesListSchema), ctrl.messages);
conversationRoutes.post('/:id/messages', validate(v.sendMessageRestSchema), ctrl.sendRest);
conversationRoutes.post('/:id/read', validate(v.conversationParamSchema), ctrl.read);

// POST/DELETE /v1/users/:id/block (রোডম্যাপ পর্ব ১১)
const blockRoutes = Router();
blockRoutes.post('/:id/block', protect, validate(v.blockParamSchema), ctrl.block);
blockRoutes.delete('/:id/block', protect, validate(v.blockParamSchema), ctrl.unblock);
blockRoutes.post('/:id/unblock', protect, validate(v.blockParamSchema), ctrl.unblock);

export { blockRoutes };
export default conversationRoutes;