import { Router } from 'express';
import { protect, optionalAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ctrl from './locations.controller.js';
import * as v from './locations.validation.js';

const locationRoutes = Router();
locationRoutes.get('/divisions', validate(v.childrenQuerySchema), ctrl.getDivisions);
locationRoutes.get('/districts', validate(v.childrenQuerySchema), ctrl.getDistricts);
locationRoutes.get('/upazilas', validate(v.childrenQuerySchema), ctrl.getUpazilas);
locationRoutes.get('/unions', validate(v.childrenQuerySchema), ctrl.getUnions);
locationRoutes.get('/villages', optionalAuth, validate(v.childrenQuerySchema), ctrl.getVillages);
locationRoutes.post('/villages', protect, validate(v.createVillageSchema), ctrl.createVillage);

const hospitalRoutes = Router();
hospitalRoutes.get('/', validate(v.hospitalQuerySchema), ctrl.getHospitals);
hospitalRoutes.post('/', protect, validate(v.createHospitalSchema), ctrl.createHospital);

export { locationRoutes, hospitalRoutes };
export default locationRoutes;