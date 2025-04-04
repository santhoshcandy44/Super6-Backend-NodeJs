const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
// Import the controller
const authController = require('../controllers/authController');

// Registration route
router.post('/register', [
  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A a valid email is required'),
    // .normalizeEmail(),
], authController.register);

// Verify OTP route
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
      .isLength({ min: 1, max: 70 }) // Ensures length is between 1 and 70 characters
      .withMessage('First name must be between 1 and 70 characters long'),

    body('last_name')
      .notEmpty().withMessage('Last name is required')
      .isString().withMessage('Last name must be a string')
      .trim()
      .escape()
      .isLength({ min: 1, max: 50 }) // Ensures length is between 1 and 50 characters
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
  ], authController.verifyOTP);


// Google sign up route    
router.post('/google-sign-up', [
  // Validate and sanitize the method field (expecting a string)
  body('sign_up_method')
    .notEmpty().withMessage('Sign up method is required')
    .isString().withMessage('Sign up method must be a string')
    .trim()
    .escape()
    .isIn(['google']).withMessage('Invalid sign up method'),

  // Validate and sanitize the id_token field (expecting a string)
  body('id_token')
    .notEmpty().withMessage('ID Token is required')
    .isString().withMessage('ID Token must be a string')
    .trim()
    .escape(),

  // Validate and sanitize the account_type field (expecting either 'Personal' or 'Business')
  body('account_type')
    .notEmpty().withMessage('Account type is required')
    .isString().withMessage('Account type must be a string')
    .trim()
    .escape()
    .isIn(['Personal', 'Business']).withMessage('Account type must be either Personal or Business'),
], authController.googleSignUp);


// Login route
router.post('/legacy-email-login', [
  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Email must be a valid email address'),
    // .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isString().withMessage('Password must be a string')
    .trim()
    .escape()
    .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),
], authController.legacyEmailLogIn);



// Login route
router.post('/partner/legacy-email-login', [
  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Email must be a valid email address'),
    // .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isString().withMessage('Password must be a string')
    .trim()
    .escape()
    .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),
], authController.partnerLegacyEmailLogIn);



// Google sign up route
router.post('/google-sign-in', [
  // Validate and sanitize the method field (expecting a string)
  body('sign_in_method')
    .notEmpty().withMessage('Sign up method is required')
    .isString().withMessage('Sign up method must be a string')
    .trim()
    .escape()
    .isIn(['google']).withMessage('Invalid sign up method'),
  // Validate and sanitize the id_token field (expecting a string)
  
  body('id_token')
    .notEmpty().withMessage('ID Token is required')
    .isString().withMessage('ID Token must be a string')
    .trim()
    .escape(),

], authController.googleSignin);


// Google sign up route
router.post('/partner/google-sign-in', [
  // Validate and sanitize the method field (expecting a string)
  body('sign_in_method')
    .notEmpty().withMessage('Sign up method is required')
    .isString().withMessage('Sign up method must be a string')
    .trim()
    .escape()
    .isIn(['google']).withMessage('Invalid sign up method'),
  // Validate and sanitize the id_token field (expecting a string)
  
  body('id_token')
    .notEmpty().withMessage('ID Token is required')
    .isString().withMessage('ID Token must be a string')
    .trim()
    .escape(),

], authController.partnerGoogleSignin);



// Forgot password route
router.post('/forgot-password', [
  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A a valid email is required').normalizeEmail(),
], authController.forgotPassword);

// Forgot password route
router.post('/forgot-password-verify-otp', [

  body('otp')
    .notEmpty().withMessage('OTP is required')
    .isString().withMessage('OTP must be a string')
    .trim()
    .escape()
    .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A a valid email is required').normalizeEmail()

], authController.forgotPasswordVerifyOTP);

// Forgot password route
router.post('/reset-password', [
  // Validate and sanitize the email and password fields
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A a valid email is required').normalizeEmail(),
    
  body('password')
    .notEmpty().withMessage('Password is required')
    .isString().withMessage('Password must be a string')
    .trim()
    .escape()
    .isLength({ min: 8, max: 16 }).withMessage('Password must be between 8 and 16 characters long'),


], authController.resetPassword);


// Refresh token route
router.post('/refresh-token', authController.refreshToken);



module.exports = router;