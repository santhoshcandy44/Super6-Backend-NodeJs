const express = require('express');
const { param } = require('express-validator');
const authenticateToken = require('../middlewares/authMiddleware');
const { chatUserProfile } = require('../controllers/chatProtectedController')
const router = express.Router();

router.get(
    '/chat-user-profile/:user_id(\\d+)', 
    authenticateToken, 
    [
        param('user_id')
            .isInt().withMessage('User ID must be a valid integer'),
    ],
    chatUserProfile 
);

module.exports = router;