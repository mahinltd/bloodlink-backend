import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './notifications.controller.js';
import * as v from './notifications.validation.js';

const notificationRoutes = Router();
notificationRoutes.use(protect);
notificationRoutes.get('/', validate(v.listNotificationsSchema), ctrl.list);
notificationRoutes.get('/unread-count', ctrl.unreadCount);
notificationRoutes.post('/read', validate(v.markReadSchema), ctrl.markRead);
notificationRoutes.patch('/read', validate(v.markReadSchema), ctrl.markRead);

const emailRoutes = Router();
emailRoutes.get('/unsubscribe', validate(v.unsubscribeSchema), ctrl.unsubscribe);

export { emailRoutes };
export default notificationRoutes;
