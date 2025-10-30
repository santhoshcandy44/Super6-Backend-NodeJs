const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { changePassword, forgotPassword, forgotPasswordVerifyOTP, resetPassword, updateAccountType } = require('../controllers/accountSettingsProtectedController');

router.patch('/update-account-type',
    authenticateToken,
    [
        body('account_type')
            .notEmpty().withMessage('Account type is required')
            .isString().withMessage('Account type must be a string')
            .trim()
            .escape()
            .isIn(['Personal', 'Business']).withMessage('Account type must be either Personal or Business'),
    ],
    updateAccountType
);

router.put('/change-password',
    authenticateToken,
    [
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
            .isLength({ min: 8, max: 16 }).withMessage('New password must be between 8 and 16 characters long')
    ],
    changePassword);

router.post('/forgot-password',
    authenticateToken,
    [
        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()
    ],
    forgotPassword);

router.post('/forgot-password-verify-otp',
    authenticateToken,
    [
        body('otp')
            .notEmpty().withMessage('OTP is required')
            .isString().withMessage('OTP must be a string')
            .trim()
            .escape()
            .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()

    ],
    forgotPasswordVerifyOTP);


router.post('/reset-password',
    authenticateToken,
    [
        body('auth_token')
            .isString().withMessage('Token must be a valid string')
            .trim(),

        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail()
    ],
    resetPassword);

module.exports = router;