import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './uploads.controller.js';
import { signUploadSchema } from './uploads.validation.js';

const router = Router();

router.post('/sign', protect, validate(signUploadSchema), ctrl.signUpload);

export default router;