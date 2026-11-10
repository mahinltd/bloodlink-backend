import { Router } from 'express';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import * as controller from './cms.controller.js';

const router = Router();
router.use(protectAdmin);

const canEdit = requireRole('superAdmin', 'contentEditor');

router.get('/cms', canEdit, controller.getCmsContent);
router.patch('/cms/:section', canEdit, controller.updateCmsSection);

export default router;