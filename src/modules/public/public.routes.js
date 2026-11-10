import { Router } from 'express';
import * as controller from './public.controller.js';

const router = Router();

// সব public — Next.js ওয়েবসাইটের জন্য, auth লাগবে না
router.get('/site', controller.getSite);
router.get('/stats', controller.getStats);
router.get('/latest-release', controller.getLatestRelease);

export default router;