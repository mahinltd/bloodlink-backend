// BloodLink Backend - Route: /notifications
const express = require('express');
const { param } = require('express-validator');
const controller = require('../controllers/notification.controller');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', controller.getMyNotifications);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllAsRead);
router.patch('/:id/read', param('id').isMongoId().withMessage('Invalid notification ID.'), validate, controller.markAsRead);

module.exports = router;