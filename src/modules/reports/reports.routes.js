import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './reports.controller.js';
import { createReportSchema } from './reports.validation.js';

const reportRoutes = Router();
reportRoutes.use(protect);
reportRoutes.post('/', validate(createReportSchema), controller.create);

export default reportRoutes;
