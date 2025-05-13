const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

const { changePassword, forgotPassword, forgotPasswordVerifyOTP, resetPassword, updateAccountType } =
    require('../controllers/accountSettingsProtectedController');


// Update about section route
router.patch('/update-account-type',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('account_type')
            .notEmpty().withMessage('Account type is required')
            .isString().withMessage('Account type must be a string')
            .trim()
            .escape()
            .isIn(['Personal', 'Business']).withMessage('Account type must be either Personal or Business'),
    ],
    updateAccountType
);


// Change password route
router.put('/change-password',
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the email and password fields
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('current_password')
            .notEmpty().withMessage('Current password is required')
            .isString().withMessage('Current password must be a string')
            .trim()
            .escape()
            .isLength({ min: 8, max: 16 }).withMessage('Current password must be between 8 and 16 characters long'),

        body('new_password')
            .notEmpty().withMessage('New password is required')
            .isString().withMessage('New password must be a string')
            .trim()
            .escape()
            .isLength({ min: 8, max: 16 }).withMessage('New password must be between 8 and 16 characters long'),


    ],
    changePassword);
// Forgot password route
router.post('/forgot-password',
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the email and password fields
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()
    ],
    forgotPassword);

// Forgot password route
router.post('/forgot-password-verify-otp',
    authenticateToken, // Ensure the user is authenticated
    [

        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        // Validate and sanitize the otp
        body('otp')
            .notEmpty().withMessage('OTP is required')
            .isString().withMessage('OTP must be a string')
            .trim()
            .escape()
            .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

        // Validate and sanitize the email and password fields
        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()

    ], forgotPasswordVerifyOTP);


// Forgot password route
router.post('/reset-password',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        // Validate and sanitize the email and password fields
        body('auth_token')
            .isString().withMessage('Token must be a valid string') // Ensure the token is a string
            .trim(), // Trim whitespace from the token

        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()
    ], resetPassword);


module.exports = router;