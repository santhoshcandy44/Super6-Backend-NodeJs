const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('A a valid email is required'),
  ],
  authController.register);

router.post('/register-verify-otp',
  [
    body('otp')
      .notEmpty().withMessage('OTP is required')
      .isString().withMessage('OTP must be a string')
      .trim()
      .escape()
      .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

    body('first_name')
      .notEmpty().withMessage('First name is required')
      .isString().withMessage('First name must be a string')
      .trim()
      .escape()
      .isLength({ min: 1, max: 70 })
      .withMessage('First name must be between 1 and 70 characters long'),

    body('last_name')
      .notEmpty().withMessage('Last name is required')
      .isString().withMessage('Last name must be a string')
      .trim()
      .escape()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be between 1 and 50 characters long'),

    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),

    body('password')
      .notEmpty().withMessage('Password is required')
      .isString().withMessage('Password must be a string')
      .trim()
      .escape()
      .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),

    body('account_type')
      .notEmpty().withMessage('Account type is required')
      .isString().withMessage('Account type must be a string')
      .trim()
      .escape()
      .isIn(['Personal', 'Business']).withMessage('Account type must be either Personal or Business'),

    // body('is_terms_and_conditions_accepted')
    //   .isBoolean().withMessage('Terms and Conditions acceptance is required'),
  ],
  authController.verifyOTP);

router.post('/google-sign-up',
  [
    body('sign_up_method')
      .notEmpty().withMessage('Sign up method is required')
      .isString().withMessage('Sign up method must be a string')
      .trim()
      .escape()
      .isIn(['google']).withMessage('Invalid sign up method'),

    body('id_token')
      .notEmpty().withMessage('ID Token is required')
      .isString().withMessage('ID Token must be a string')
      .trim()
      .escape(),

    body('account_type')
      .notEmpty().withMessage('Account type is required')
      .isString().withMessage('Account type must be a string')
      .trim()
      .escape()
      .isIn(['Personal', 'Business']).withMessage('Account type must be either Personal or Business'),
  ],
  authController.googleSignUp);

router.post('/legacy-email-login',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Email must be a valid email address'),

    body('password')
      .notEmpty().withMessage('Password is required')
      .isString().withMessage('Password must be a string')
      .trim()
      .escape()
      .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),
  ],
  authController.legacyEmailLogIn);

router.post('/partner/legacy-email-login',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Email must be a valid email address'),

    body('password')
      .notEmpty().withMessage('Password is required')
      .isString().withMessage('Password must be a string')
      .trim()
      .escape()
      .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),
  ],
  authController.partnerLegacyEmailLogIn);

router.post('/google-sign-in',
  [
    body('sign_in_method')
      .notEmpty().withMessage('Sign up method is required')
      .isString().withMessage('Sign up method must be a string')
      .trim()
      .escape()
      .isIn(['google']).withMessage('Invalid sign up method'),

    body('id_token')
      .notEmpty().withMessage('ID Token is required')
      .isString().withMessage('ID Token must be a string')
      .trim()
      .escape(),

  ],
  authController.googleSignin);


router.post('/partner/google-sign-in',
  [
    body('sign_in_method')
      .notEmpty().withMessage('Sign up method is required')
      .isString().withMessage('Sign up method must be a string')
      .trim()
      .escape()
      .isIn(['google']).withMessage('Invalid sign up method'),

    body('id_token')
      .notEmpty().withMessage('ID Token is required')
      .isString().withMessage('ID Token must be a string')
      .trim()
      .escape()
  ],
  authController.partnerGoogleSignin);

router.post('/forgot-password',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('A a valid email is required').normalizeEmail(),
  ], authController.forgotPassword);

router.post('/forgot-password-verify-otp',
  [
    body('otp')
      .notEmpty().withMessage('OTP is required')
      .isString().withMessage('OTP must be a string')
      .trim()
      .escape()
      .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('A a valid email is required')
  ],
  authController.forgotPasswordVerifyOTP);

router.post('/reset-password',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('A a valid email is required'),

    body('password')
      .notEmpty().withMessage('Password is required')
      .isString().withMessage('Password must be a string')
      .trim()
      .escape()
      .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long')
  ],
  authController.resetPassword);

router.post('/refresh-token', authController.refreshToken);

module.exports = router;