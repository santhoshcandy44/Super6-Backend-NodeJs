const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const { updateFirstName, updateLastName, updateAbout,
    updateProfilePic,
    updateEmail,
    updateEmailVerifyOTP,
    getUserProfile,
    updateLocation,
    logOut
} = require('../controllers/ProfileProtectedController'); 
const { body, param } = require('express-validator');
const multer = require('multer');
const he = require('he');
const router = express.Router();

router.get(
    '/',
    authenticateToken,
    getUserProfile 
);

router.patch('/update-first-name',
    authenticateToken,
    [
        body('first_name')
            .notEmpty().withMessage('First name is required')
            .isString().withMessage('First name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 70 })
            .withMessage('First name must be between 1 and 70 characters long'),
    ],
    (req, res, next) => {
        req.body.first_name = he.decode(req.body.first_name);
        next();
    },
    updateFirstName
);

router.patch('/update-last-name',
    authenticateToken,
    [
        body('last_name')
            .notEmpty().withMessage('Last name is required')
            .isString().withMessage('Last name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 50 })
            .withMessage('Last name must be between 1 and 50 characters long'),
    ],
    (req, res, next) => {
        req.body.last_name = he.decode(req.body.last_name);
        next();
    },
    updateLastName
);

router.patch('/update-about',
    authenticateToken, 
    [
        body('about')
            .notEmpty().withMessage('Last name is required')
            .isString().withMessage('Last name must be a string')
            .trim()
            .escape()
            .isLength({ min: 1, max: 160 })
            .withMessage('Last name must be between 1 and 160 characters long'),
    ],
    (req, res, next) => {
        req.body.about = he.decode(req.body.about);
        next();
    },
    updateAbout
);

const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter(req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'));
        }
        cb(null, true);
    }
});

router.patch('/update-profile-pic',
    authenticateToken, 
    upload.single('profile_pic'), 
    [
    ],
    updateProfilePic 
);

router.patch('/update-email',
    authenticateToken, 
    [
        body('email')
            .notEmpty().withMessage('Email is required')
            .isEmail().withMessage('Valid email is required')
            .normalizeEmail(),
    ],
    (req, res, next) => {
        req.body.email = he.decode(req.body.email);
        next();
    },
    updateEmail
);

router.patch('/update-email-verify-otp',
    authenticateToken,
    [
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
        req.body.otp = he.decode(req.body.otp);
        next();
    },
    updateEmailVerifyOTP
);

router.put('/update-location',
    authenticateToken, 
    [
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


router.post('/logout',
    authenticateToken, 
    [
    ],
    logOut
);

module.exports = router;