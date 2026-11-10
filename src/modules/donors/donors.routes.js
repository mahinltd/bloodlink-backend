import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './donors.controller.js';
import * as v from './donors.validation.js';

const donorRoutes = Router();
donorRoutes.use(protect);
donorRoutes.get('/', validate(v.searchDonorsSchema), ctrl.search);
donorRoutes.get('/:id', validate(v.donorDetailSchema), ctrl.detail);

// POST /v1/users/:id/reveal-phone (রোডম্যাপ পর্ব ১১)
const userActionRoutes = Router();
userActionRoutes.post('/:id/reveal-phone', protect, validate(v.revealPhoneSchema), ctrl.revealPhone);

export { userActionRoutes };
export default donorRoutes;