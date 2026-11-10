import { Router } from 'express';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import * as controller from './campaign.controller.js';

const router = Router();
router.use(protectAdmin);

const canManage = requireRole('superAdmin', 'contentEditor');

router.get('/campaigns', canManage, controller.listCampaigns);
router.post('/campaigns', canManage, controller.createCampaign);
router.post('/campaigns/:id/send', canManage, controller.sendCampaign);
router.post('/campaigns/:id/schedule', canManage, controller.scheduleCampaign);

export default router;