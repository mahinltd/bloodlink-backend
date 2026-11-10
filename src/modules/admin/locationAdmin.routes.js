import { Router } from 'express';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js'; // ⚠️ path মিলিয়ে নিন
import { requireRole } from '../../middlewares/role.middleware.js'; // ⚠️ path মিলিয়ে নিন
import * as controller from './locationAdmin.controller.js';

const router = Router();
router.use(protectAdmin);

const canModerate = requireRole('superAdmin', 'moderator');

// Villages
router.get('/locations/villages', canModerate, controller.getVillageRequests);
router.post('/locations/villages/:id/approve', canModerate, controller.approveVillage);
router.post('/locations/villages/:id/reject', canModerate, controller.rejectVillage);

// Hospitals
router.get('/locations/hospitals', canModerate, controller.getPendingHospitals);
router.post('/locations/hospitals/:id/approve', canModerate, controller.approveHospital);
router.post('/locations/hospitals/:id/reject', canModerate, controller.rejectHospital);

// Bulk import (superAdmin only)
router.post('/locations/import', requireRole('superAdmin'), controller.importLocations);

export default router;