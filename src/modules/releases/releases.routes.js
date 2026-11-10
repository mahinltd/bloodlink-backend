import { Router } from 'express';
import * as controller from './releases.controller.js';

const router = Router();

// Public — অ্যাপ প্রতিবার খুললে এখানে version চেক করবে
router.get('/version', controller.getAppVersion);

export default router;