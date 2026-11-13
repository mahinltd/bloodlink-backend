import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './requests.controller.js';
import * as v from './requests.validation.js';
import { requestFeedLimiter } from '../../middlewares/rateLimiter.middleware.js';

const requestRoutes = Router();
requestRoutes.use(protect);

requestRoutes.get('/sos', requestFeedLimiter, validate(v.sosRequestsSchema), controller.sos);
requestRoutes.get('/', requestFeedLimiter, validate(v.listRequestsSchema), controller.list);
requestRoutes.post('/', validate(v.createRequestSchema), controller.create);
requestRoutes.get('/mine', validate(v.paginationSchema), controller.listMine);
requestRoutes.get('/responded', requestFeedLimiter, validate(v.paginationSchema), controller.listResponded);
requestRoutes.get('/:id/matching-preview', validate(v.idParamSchema), controller.matchingPreview);
requestRoutes.get('/:id/responses', requestFeedLimiter, validate(v.idParamSchema), controller.listResponses);
requestRoutes.post('/:id/respond', validate(v.respondSchema), controller.respond);
requestRoutes.post('/:id/confirm-donation', validate(v.confirmDonationSchema), controller.confirmDonation);
requestRoutes.post('/:id/fulfill', validate(v.idParamSchema), controller.fulfill);
requestRoutes.post('/:id/cancel', validate(v.idParamSchema), controller.cancel);
requestRoutes.post('/:id/report', validate(v.reportSchema), controller.report);
requestRoutes.patch('/:id', validate(v.updateRequestSchema), controller.update);
requestRoutes.get('/:id', requestFeedLimiter, validate(v.idParamSchema), controller.get);

export default requestRoutes;
