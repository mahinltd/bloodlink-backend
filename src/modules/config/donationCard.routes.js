import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js'; // ⚠️ path মিলিয়ে নিন
import * as controller from './donationCard.controller.js';

const router = Router();

router.use(protect);
router.get('/', controller.getDonationCard);
router.post('/dismiss', controller.dismissDonationCard);

export default router;