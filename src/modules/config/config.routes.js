import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './config.controller.js';

export const configRouter = Router();
configRouter.get('/', ctrl.getConfig);

export const i18nRouter = Router();
i18nRouter.get(
  '/:lang',
  validate(z.object({ params: z.object({ lang: z.enum(['bn', 'en']) }) })),
  ctrl.getTranslations
);

export { configRouter as default, i18nRouter as i18nRoutes };