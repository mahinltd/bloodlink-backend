// BloodLink Backend - Route: /messages
const express = require('express');
const { param } = require('express-validator');
const controller = require('../controllers/message.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const { uploadImage, uploadAudio } = require('../middlewares/upload.middleware');

const router = express.Router();
router.use(protect);

router.post('/upload/image', uploadImage.single('image'), controller.uploadChatImage);
router.post('/upload/voice', uploadAudio.single('voice'), controller.uploadVoiceMessage);
router.delete('/:id', param('id').isMongoId().withMessage('Invalid message ID.'), validate, controller.deleteMessageForMe);

module.exports = router;