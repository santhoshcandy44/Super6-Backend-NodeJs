const express = require('express');
const { body, param, query } = require('express-validator');
const authenticateToken = require('../middlewares/authMiddleware');
const servicesProtectedController = require('../controllers/servicesProtectedController');
const { uploadSingle, uploadFields } = require('./utils/multerUpload');

const router = express.Router();

router.get('/services',
    authenticateToken,
    [
        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format')
            .trim()
            .isLength({ min: 0, max: 100 })
            .withMessage('Query string must be between 1 and 100 characters long'),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('next_token')
            .optional()
            .isString().withMessage('Next token must be a valid string'),

        query('previous_token')
            .optional()
            .isString().withMessage('Previous token must be a valid string')
    ],
    servicesProtectedController.getServices
);

router.get('/guest-services',
    [
        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format')
            .trim()
            .isLength({ min: 0, max: 100 })
            .withMessage('Query string must be between 1 and 100 characters long'),

        query('latitude')
            .optional()
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be a valid float between -90 and 90'),

        query('longitude')
            .optional()
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be a valid float between -180 and 180'),

        query('industries')
            .optional()
            .customSanitizer(value => {
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : null;
                } catch (e) {
                    return null;
                }
            })
            .isArray()
            .withMessage('Industries must be an array of integers'),

        query('industries.*')
            .isInt({ gt: 0 }).withMessage('Each industry ID must be a positive integer'),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('next_token')
            .optional()
            .isString().withMessage('Next token must be a valid string'),

        query('previous_token')
            .optional()
            .isString().withMessage('Previous token must be a valid string')
    ],
    servicesProtectedController.getGuestServices
);

router.get('/guest-feed-user-published-services/:user_id(\\d+)',
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format')
            .toInt(),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('next_token')
            .optional()
            .isString().withMessage('Next token must be a valid string'),

        query('previous_token')
            .optional()
            .isString().withMessage('Previous token must be a valid string')
    ],
    servicesProtectedController.getGuestFeedUserPublishedServices
);

router.get('/feed-user-published-services/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format')
            .toInt(),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('next_token')
            .optional()
            .isString().withMessage('Next token must be a valid string'),

        query('previous_token')
            .optional()
            .isString().withMessage('Previous token must be a valid string')

    ],
    servicesProtectedController.getFeedUserPublishedServices
);

router.get('/published-services',
    authenticateToken,
    [
        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('next_token')
            .optional()
            .isString().withMessage('Next token must be a valid string'),

        query('previous_token')
            .optional()
            .isString().withMessage('Previous token must be a valid string')
    ],
    servicesProtectedController.getPublishedServices
);

router.patch('/:service_id(\\d+)/update-service-info',
    authenticateToken,
    [
        param('service_id')
        .isInt()
        .withMessage('Service ID must be a valid integer')
        .toInt(),

        body('title')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 })
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 })
            .withMessage('Long Description must be between 1 and 5000 characters'),
        body('industry').isInt().withMessage('Industry must be a valid integer'),
    ],
    servicesProtectedController.updateServiceInfo
);

router.patch('/:service_id(\\d+)/update-service-plans',
    authenticateToken,
    [
        param('service_id')
        .isInt()
        .withMessage('Service ID must be a valid integer')
        .toInt(),

        body('plans')
            .customSanitizer((value) => {
                try {
                    return JSON.parse(value);
                } catch (error) {
                    return null
                }
            })
            .isArray({ min: 1, max: 3 }).withMessage('Plans must be 1-3 array'),

        body('plans.*')
            .isObject().withMessage('Al Plan must be an object'),

        body('plans.*.plan_id')
            .isInt().withMessage('Plan ID must be a number'),

        body('plans.*.plan_name')
            .isString().withMessage('Plan name must be a string')
            .isLength({ max: 20 }).withMessage('Plan name cannot exceed 20 characters'),

        body('plans.*.plan_description')
            .isString().withMessage('Plan description must be a string')
            .isLength({ max: 500 }).withMessage('Plan description cannot exceed 500 characters'),

        body('plans.*.plan_price')
            .isFloat().withMessage('Plan price must be a number'),

        body('plans.*.price_unit')
            .isIn(['INR', 'USD']).withMessage('Plan currency must be either INR or USD'),

        body('plans.*.plan_delivery_time')
            .isInt().withMessage('Plan delivery time must be a number'),

        body('plans.*.duration_unit')
            .isIn(['HR', 'D', 'W', 'M']).withMessage("Plan duration unit must be 'HR', 'D', 'W', or 'M'"),

        body('plans.*.plan_features')
            .isArray({ min: 1, max: 10 }).withMessage('Plan features must be a non-empty array with max 10 features'),

        body('plans.*.plan_features.*.feature_name')
            .isString().withMessage('Feature name must be a string')
            .isLength({ max: 40 }).withMessage('Feature name must have a maximum length of 40'),

        body('plans.*.plan_features.*.feature_value')
            .isString().withMessage('Feature value must be a string')
            .isLength({ max: 10 }).withMessage('Feature value must have a maximum length of 10')
    ],
    servicesProtectedController.updateServicePlans
);

router.patch('/:service_id(\\d+)/update-service-location',
    authenticateToken,
    [
        param('service_id')
        .isInt()
        .withMessage('Service ID must be a valid integer')
        .toInt(),

        body('latitude')
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be a valid float between -90 and 90'),

        body('longitude')
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be a valid float between -180 and 180'),

        body('geo')
            .isString()
            .withMessage('Geo must be a valid string')
            .notEmpty()
            .withMessage('Geo cannot be empty'),

        body('location_type')
            .isString()
            .withMessage('Location type must be a valid string')
            .notEmpty()
            .withMessage('Location type cannot be empty')
    ],
    servicesProtectedController.updateServiceLocation
);

router.delete('/:service_id(\\d+)/delete-service-image',
    authenticateToken,
    [
        param('service_id').isInt().withMessage('Service ID must be a valid integer').toInt(),
        query('image_id').isInt().withMessage('Image ID must be a valid integer').toInt()
    ],
    servicesProtectedController.deleteServiceImage
);

router.post('/:service_id(\\d+)/upload-service-image',
    authenticateToken,
    uploadSingle('image'),
    [
        param('service_id').isInt().withMessage('Service ID must be a valid integer').toInt(),
        body('image_id').isInt().withMessage('Image ID must be a valid integer'),
        body('image')
            .custom((value, { req }) => {
                if (!req.file || req.file.length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),
    ],
    servicesProtectedController.uploadServiceImage
);

router.post('/:service_id(\\d+)/update-service-image',
    authenticateToken,
    uploadSingle('image'),
    [
        param('service_id').isInt().withMessage('Service ID must be a valid integer').toInt(),
        body('image_id').isInt().withMessage('Image ID must be a valid integer').toInt(),
        body('image')
            .custom((value, { req }) => {
                if (!req.file || req.file.length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),
    ],
    servicesProtectedController.updateServiceImage
);

router.post('/create-service',
    authenticateToken,
    uploadFields([
        { name: 'thumbnail', maxCount: 1 },
        { name: 'images[]', maxCount: 10 }
    ]),
    [
        body('title')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 })
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 })
            .withMessage('Long Description must be between 1 and 5000 characters'),

        body('industry').isInt().withMessage('Industry must be a valid integer'),

        body('country')
            .isString()
            .withMessage('Country must be a valid string')
            .custom((value) => {
                const allowedCountries = ['IN'];
                if (!allowedCountries.includes(value)) {
                    throw new Error('Country must be a valid country (IN, USA)');
                }
                return true;
            }),

        body('state')
            .isString()
            .withMessage('State must be a valid string')
            .custom((value, { req }) => {
                const country = req.body.country;
                if (country === 'IN') {
                    if (![
                        "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
                        "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
                        "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
                        "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
                        "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
                        "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
                    ].includes(value)) {
                        throw new Error('State must be a valid state of India');
                    }
                }
                return true;
            }),

        body('images[]')
            .custom((value, { req }) => {
                if (!req.files['images[]'] || req.files['images[]'].length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),

        body('thumbnail')
            .custom((value, { req }) => {
                if (!req.files['thumbnail'] || req.files['thumbnail'].length === 0) {
                    throw new Error('Thumbnail image is required');
                }
                return true;
            }),

        body('plans')
            .customSanitizer((value) => {
                try {
                    return JSON.parse(value);
                } catch (error) {
                    return null
                }
            })
            .isArray({ min: 1, max: 3 }).withMessage('Plans must be 1-3 array'),

        body('plans.*')
            .isObject().withMessage('Al Plan must be an object'),

        body('plans.*.plan_id')
            .isInt().withMessage('Plan ID must be a number'),

        body('plans.*.plan_name')
            .isString().withMessage('Plan name must be a string')
            .isLength({ max: 20 }).withMessage('Plan name cannot exceed 20 characters'),

        body('plans.*.plan_description')
            .isString().withMessage('Plan description must be a string')
            .isLength({ max: 500 }).withMessage('Plan description cannot exceed 500 characters'),

        body('plans.*.plan_price')
            .isFloat().withMessage('Plan price must be a number'),

        body('plans.*.price_unit')
            .isIn(['INR', 'USD']).withMessage('Plan currency must be either INR or USD'),

        body('plans.*.plan_delivery_time')
            .isInt().withMessage('Plan delivery time must be a number'),

        body('plans.*.duration_unit')
            .isIn(['HR', 'D', 'W', 'M']).withMessage("Plan duration unit must be 'HR', 'D', 'W', or 'M'"),

        body('plans.*.plan_features')
            .isArray({ min: 1, max: 10 }).withMessage('Plan features must be a non-empty array with max 10 features'),

        body('plans.*.plan_features.*.feature_name')
            .isString().withMessage('Feature name must be a string')
            .isLength({ max: 40 }).withMessage('Feature name must have a maximum length of 40'),

        body('plans.*.plan_features.*.feature_value')
            .isString().withMessage('Feature value must be a string')
            .isLength({ max: 10 }).withMessage('Feature value must have a maximum length of 10'),

        body('location')
            .customSanitizer((value) => {
                try {
                    return JSON.parse(value)
                } catch (err) {
                    return null
                }
            }).isObject().withMessage('Location must be an object'),

        body('location.latitude')
            .exists().withMessage('Latitude is required')
            .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be a number between -90 and 90'),

        body('location.longitude')
            .exists().withMessage('Longitude is required')
            .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be a number between -180 and 180')
    ],
    servicesProtectedController.createService
);

router.post('/:service_id(\\d+)/update-service-thumbnail',
    authenticateToken,
    uploadSingle('image'),
    [
        param('service_id').isInt().withMessage('Service ID must be a valid integer').toInt(),
        body('image_id').isInt().withMessage('Image ID must be a valid integer').toInt(),
        body('thumbnail')
            .custom((value, { req }) => {
                if (!req.file || req.file.length === 0) {
                    throw new Error('Thumbnail image is required');
                }
                return true;
            }),
    ],
    servicesProtectedController.updateServiceTumbnail
);

router.post(
    '/bookmark-service',
    authenticateToken,
    [
        body('service_id').isInt().withMessage('Invalid service id format').toInt()
    ],
    servicesProtectedController.bookmarkService
);

router.post(
    '/remove-bookmark-service',
    authenticateToken,
    [
        body('service_id')
            .isInt().withMessage('Invalid service id format')
            .toInt()
    ],
    servicesProtectedController.removeBookmarkService
);

router.get('/search-services-suggestions',
    authenticateToken,
    [
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    servicesProtectedController.searchSuggestions
);

router.get('/guest-services-search-suggestions',
    [
        query('query')
            .isString()
            .withMessage('Invalid user query format')
            .notEmpty()
            .withMessage('Query cannot be empty')
            .toInt()
    ],
    servicesProtectedController.searchSuggestions
);

router.delete('/:service_id(\\d+)/delete-service',
    authenticateToken,
    [
        param('service_id')
        .isInt()
        .withMessage('Invalid service id format')
        .toInt()
    ],
    servicesProtectedController.deleteService
);

module.exports = router;