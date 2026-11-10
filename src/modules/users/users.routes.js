import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './users.controller.js';
import * as v from './users.validation.js';

const router = Router();

router.use(protect); // সব রুটে লগইন বাধ্যতামূলক

router.get('/', ctrl.getMe);
router.patch('/', validate(v.updateMeSchema), ctrl.updateMe);
router.put('/avatar', validate(v.avatarSchema), ctrl.updateAvatar);
router.post('/donor-profile', validate(v.donorProfileSchema), ctrl.enableDonorMode);
router.post('/donor-mode', validate(v.donorProfileSchema), ctrl.enableDonorMode);
router.patch('/availability', validate(v.availabilitySchema), ctrl.setAvailability);
router.patch('/settings', validate(v.settingsSchema), ctrl.updateSettings);
router.put('/location', validate(v.locationSchema), ctrl.updateLocation);
router.patch('/location', validate(v.locationSchema), ctrl.updateLocation);
router.post('/devices', validate(v.deviceSchema), ctrl.registerDevice);
router.delete('/devices', validate(v.deviceRemoveSchema), ctrl.removeDevice);
router.delete('/devices/:token', validate(v.deviceRemoveParamSchema), ctrl.removeDevice);
router.post('/id-verification', validate(v.idVerificationSchema), ctrl.submitIdVerification);
router.get('/id-verification', ctrl.getIdVerification);
router.get('/donations', ctrl.getDonations);
router.delete('/', validate(v.deleteAccountSchema), ctrl.deleteAccount);

export default router;