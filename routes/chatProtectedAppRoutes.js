const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const {chatUserProfile} = require('../controllers/chatProtectedController')
const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware

// GET /profile/:user_id route with validation
router.get(
    '/chat-user-profile/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('User ID must be a valid integer'),
    ],
    chatUserProfile // Controller function to load user profile
);



module.exports = router;
