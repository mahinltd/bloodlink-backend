// BloodLink Backend - Route: /users
const express = require('express');
const { param } = require('express-validator');
const controller = require('../controllers/user.controller');
const validators = require('../validators/user.validator');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect); // সব route protected

router.get('/me', controller.getMyProfile);
router.patch('/me', validators.updateProfile, validate, controller.updateMyProfile);
router.post('/me/avatar', uploadImage.single('avatar'), controller.uploadAvatar);
router.delete('/me/avatar', controller.removeAvatar);
router.post('/me/fcm-token', validators.fcmToken, validate, controller.registerFcmToken);
router.delete('/me/fcm-token', validators.fcmToken, validate, controller.removeFcmToken);
router.post('/me/convert-to-donor', validators.convertToDonor, validate, controller.convertToDonor);
router.delete('/me', validators.deleteAccount, validate, controller.deleteAccount);
router.get('/me/blocked', controller.getBlockedUsers);
router.post('/:id/block', param('id').isMongoId().withMessage('Invalid user ID.'), validate, controller.blockUser);
router.delete('/:id/block', param('id').isMongoId().withMessage('Invalid user ID.'), validate, controller.unblockUser);

module.exports = router;