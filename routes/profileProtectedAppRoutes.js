const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
const { updateFirstName, updateLastName, updateAbout, getIndustries, updateIndustries,
    updateProfilePic,
    updateEmail,
    updateEmailVerifyOTP,
    getUserProfile,
    updateLocation,
    logOut
} = require('../controllers/ProfileProtectedController'); // Import the controller function for protected routes
const router = express.Router();
const { body, query, param } = require('express-validator');
const multer = require('multer');
const he = require('he');


// GET /profile/:user_id route with validation
router.get(
    '/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('User ID must be a valid integer'),
    ],
    getUserProfile // Controller function to load user profile
);


// Update first name route
router.patch('/update-first-name',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        body('first_name')
            .notEmpty().withMessage('First name is required')
            .isString().withMessage('First name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 70 }) // Ensures length is between 1 and 70 characters
            .withMessage('First name must be between 1 and 70 characters long'),
    ],

    
    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.first_name = he.decode(req.body.first_name);
        // Continue to validation and controller
        next();
    },


    updateFirstName
);

// Update last name route
router.patch('/update-last-name',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('last_name')
            .notEmpty().withMessage('Last name is required')
            .isString().withMessage('Last name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 50 }) // Ensures length is between 1 and 50 characters
            .withMessage('Last name must be between 1 and 50 characters long'),
    ],

    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.last_name = he.decode(req.body.last_name);
        // Continue to validation and controller
        next();
    },

    updateLastName
);

// Update about section route
router.patch('/update-about',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('about')
            .notEmpty().withMessage('Last name is required')
            .isString().withMessage('Last name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 160 }) // Ensures length is between 1 and 50 characters
            .withMessage('Last name must be between 1 and 160 characters long'),
    ],

    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.about = he.decode(req.body.about);
        // Continue to validation and controller
        next();
    },

    updateAbout
);


// Configure multer for handling file uploads (profile picture)
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB file size
    fileFilter(req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'));
        }
        cb(null, true);
    }
});
// Route to update profile picture (PATCH request)
router.patch('/update-profile-pic',
    authenticateToken, // Ensure the user is authenticated
    upload.single('profile_pic'), // Expecting a single file field named 'profilePicture'
    [
        // Validate user_id as an integer
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
    ],
    updateProfilePic // Controller function to handle the update
);

// Update about section route
router.patch('/update-email',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail(),
    ],

    
    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.email = he.decode(req.body.email);
        // Continue to validation and controller
        next();
    },

    updateEmail
);

// Update about section route
router.patch('/update-email-verify-otp',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail(),

        body('otp')
            .notEmpty().withMessage('OTP is required')
            .isString().withMessage('OTP must be a string')
            .trim()
            .escape()
            .matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits and contain only numbers'),

    ],

    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.otp = he.decode(req.body.otp);
        // Continue to validation and controller
        next();
    },
    updateEmailVerifyOTP
);

// Update about section route
router.put('/update-location',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        body('latitude')
            .isFloat().withMessage('Latitude must be a valid float')
            .trim()
            .escape(),

        body('longitude')
            .isFloat().withMessage('Longitude must be a valid float')
            .trim()
            .escape(),

        body('geo')
            .isString().withMessage('Geo must be a valid string')
            .notEmpty().withMessage('Geo cannot be empty')
            .trim()
            .escape(),

        body('location_type')
            .isString().withMessage('Location type must be a valid string')
            .notEmpty().withMessage('Location type cannot be empty')
            .trim()
            .escape(),
    ],
    updateLocation
);


// Update about section route
router.post('/logout',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
    ],
    logOut
);


module.exports = router;
