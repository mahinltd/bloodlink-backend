// BloodLink Backend - Route: /conversations
const express = require('express');
const { body, param, query } = require('express-validator');
const convoController = require('../controllers/conversation.controller');
const messageController = require('../controllers/message.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');
const Message = require('../models/Message');

const router = express.Router();
router.use(protect);

router.get('/', convoController.listMyConversations);

router.post(
  '/',
  [
    body('participantId').notEmpty().withMessage('participantId is required.').bail()
      .isMongoId().withMessage('Invalid participant ID.'),
    body('requestRef').optional().isMongoId().withMessage('Invalid request reference.'),
  ],
  validate,
  convoController.createOrGetConversation
);

router.get('/:id', param('id').isMongoId().withMessage('Invalid conversation ID.'), validate, convoController.getConversationById);

router.get(
  '/:id/messages',
  [
    param('id').isMongoId().withMessage('Invalid conversation ID.'),
    query('before').optional().isISO8601().withMessage('Invalid cursor date.'),
  ],
  validate,
  messageController.getMessages
);

router.post(
  '/:id/messages',
  [
    param('id').isMongoId().withMessage('Invalid conversation ID.'),
    body('type').isIn(Message.MESSAGE_TYPES).withMessage(`Type must be one of: ${Message.MESSAGE_TYPES.join(', ')}`),
    body('text').optional().trim().isLength({ max: 2000 }).withMessage('Message too long (max 2000 characters).'),
    body('mediaUrl').optional().isURL().withMessage('mediaUrl must be a valid URL.'),
    body('durationSec').optional().isFloat({ min: 0, max: 600 }).withMessage('Invalid duration.'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ],
  validate,
  messageController.sendMessage
);

module.exports = router;