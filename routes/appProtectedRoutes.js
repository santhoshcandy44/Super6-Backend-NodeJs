const express = require('express');
const router = express.Router();

const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
// Import the controller
const appProtectedController = require('../controllers/appProtectedController');

const { body, query } = require('express-validator');


// Registration route
router.post('/update-fcm', 
    authenticateToken, // Ensure the user is authenticated
    [
    // Validate and sanitize the email and password fields
    body('fcm_token').not().isEmpty().withMessage('FCM token is required').trim().escape(),
   
   ], appProtectedController.updateFCMToken);



   // Registration route
router.post('/update-ee2ee-public-key', 
    authenticateToken, // Ensure the user is authenticated
    [
    // Validate and sanitize the email and password fields
    body('e2ee_public_key').not().isEmpty().withMessage('Pyblic key is required').trim().escape(),

    body('key_version')
    .not().isEmpty().withMessage('Key version is required')  // Ensure key_version is not empty
    .isNumeric().withMessage('Key version must be a number')  // Ensure key_version is numeric (i.e., a Long)
    .custom(value => {
      // Ensure key_version is greater than or equal to 0 and not equal to -1
      if (parseInt(value) < 0 || parseInt(value) === -1) {
        throw new Error('Key version cannot be negative or -1');
      }
      return true;
    })
    .trim()  // Trim whitespace around the value
    .escape()  // Escape any special characters in the value

   
   ], appProtectedController.updateE2EEPublicKey);

   
module.exports = router;