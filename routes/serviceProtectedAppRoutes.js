const express = require('express');
const { body, param, query } = require('express-validator');
const authenticateToken = require('../middlewares/authMiddleware');
const servicesProtectedController = require('../controllers/servicesProtectedController');
const multer = require('multer');
const he = require('he');

const router = express.Router();
const upload = multer();

router.get('/services',
    authenticateToken,
    [
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'),

        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format')
            .trim()
            .escape()
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
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'),

        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format')
            .trim()
            .escape()
            .isLength({ min: 0, max: 100 })
            .withMessage('Query string must be between 1 and 100 characters long'),

        query('latitude')
            .optional()
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be a valid float between -90 and 90')
            .trim()
            .escape(),

        query('longitude')
            .optional()
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be a valid float between -180 and 180')
            .trim()
            .escape(),

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
            .withMessage('Industries must be an array of integers')
            .custom(value => {
                if (value.some(item => !Number.isInteger(item) || item <= 0)) {
                    throw new Error('Each industry ID must be a positive integer');
                }
                return true;
            }),

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
            .isInt().withMessage('Invalid user id format'),

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

router.get('/published-services/:user_id(\\d+)',
    authenticateToken,
    [
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'),

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
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        param('service_id').isInt().withMessage('Service ID must be a valid integer'),

        body('title')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 })
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 })
            .withMessage('Long Description must be between 1 and 5000 characters'),
        body('industry').isInt().withMessage('Industry must be a valid integer'),
    ],
    (req, res, next) => {
        req.body.user_id = he.decode(req.body.user_id);
        req.body.title = he.decode(req.body.title);
        req.body.short_description = he.decode(req.body.short_description);
        req.body.long_description = he.decode(req.body.long_description);
        req.body.industry = he.decode(req.body.industry);
        next();
    },
    servicesProtectedController.updateServiceInfo
);

router.patch('/:service_id(\\d+)/update-service-plans',
    authenticateToken,
    (req, res, next) => {
        if (req.body.plans) {
            try {
                const decodedPlans = decodeURIComponent(req.body.plans);
                req.body.plans = JSON.parse(decodedPlans);
                next();
            } catch (error) {
                return res.status(400).json({ message: 'Invalid plans format' });
            }
        } else {
            next();
        }
    },
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        param('service_id').isInt().withMessage('Service ID must be a valid integer'),

        body('plans')
            .isArray({ min: 1 }).withMessage('Plans must be a non-empty array')
            .bail()
            .custom((plans) => {
                if (plans.length > 3) {
                    throw new Error(`Maximum 3 plans can be created`);
                }

                plans.forEach((plan, index) => {
                    if (typeof plan.plan_id !== 'number') {
                        throw new Error(`Plan ID must be a number in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_name !== 'string') {
                        throw new Error(`Plan name must be a string ${index + 1}`);
                    }

                    if (plan.plan_name.length > 20) {
                        throw new Error(`Plan name cannot exceed 20 characters in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_description !== 'string') {
                        throw new Error(`Plan description must be a string and cannot exceed 500 characters in plan ${index + 1}`);
                    }

                    if (plan.plan_description.length > 200) {
                        throw new Error(`Plan description cannot exceed 500 characters in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_price !== 'number') {
                        throw new Error(`Plan price must be a number in plan ${index + 1}`);
                    }

                    const validCurrencies = ['INR', 'USD'];
                    if (!validCurrencies.includes(plan.price_unit)) {
                        throw new Error(`Plan currency must be either INR or USD in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_delivery_time !== 'number') {
                        throw new Error(`Plan delivery time must be a number in plan ${index + 1}`);
                    }

                    const validDurationUnits = ['HR', 'D', 'W', 'M'];
                    if (!validDurationUnits.includes(plan.duration_unit)) {
                        throw new Error(`Plan duration unit must be 'D', 'W', or 'M' in plan ${index + 1}`);
                    }

                    if (!Array.isArray(plan.plan_features) || plan.plan_features.length < 1 || plan.plan_features.length > 10) {
                        throw new Error(`Plan features must be a non-empty array with a maximum of 10 features in plan ${index + 1}`);
                    }

                    plan.plan_features.forEach((feature, featureIndex) => {
                        if (!feature.feature_name || feature.feature_name.length > 40) {
                            throw new Error(`Feature name must have a maximum length of 40 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }

                        if (!feature.feature_value || feature.feature_value.length > 10) {
                            throw new Error(`Feature value must have a maximum length of 10 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }
                    });
                });
                return true;
            })
    ],
    servicesProtectedController.updateServicePlans
);

router.patch('/:service_id(\\d+)/update-service-location',
    authenticateToken,
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),

        param('service_id').isInt().withMessage('Service ID must be a valid integer'),

        body('latitude')
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be a valid float between -90 and 90')
            .trim()
            .escape(),

        body('longitude')
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be a valid float between -180 and 180')
            .trim()
            .escape(),

        body('geo')
            .isString()
            .withMessage('Geo must be a valid string')
            .notEmpty()
            .withMessage('Geo cannot be empty')
            .trim()
            .escape(),

        body('location_type')
            .isString()
            .withMessage('Location type must be a valid string')
            .notEmpty()
            .withMessage('Location type cannot be empty')
            .trim()
            .escape()
    ],
    servicesProtectedController.updateServiceLocation
);

router.delete('/:service_id(\\d+)/delete-service-image',
    authenticateToken,
    [
        query('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        query('image_id').isInt().withMessage('Image ID must be a valid integer')
    ],
    servicesProtectedController.deleteServiceImage
);

router.post('/:service_id(\\d+)/upload-service-image',
    authenticateToken,
    upload.single('image'),
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'),
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
    upload.single('image'),
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'),
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
    upload.fields([
        { name: 'thumbnail', maxCount: 1 },
        { name: 'images[]', maxCount: 10 }
    ]),
    (req, res, next) => {
        if (req.body.plans) {
            try {
                const decodedPlans = decodeURIComponent(req.body.plans);
                req.body.plans = JSON.parse(decodedPlans);
                next();
            } catch (error) {
                return res.status(400).json({ message: 'Invalid plans format' });
            }
        } else {
            next();
        }
    },
    [
        body('title')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 })
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
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
            .isArray({ min: 1 }).withMessage('Plans must be a non-empty array')
            .bail()
            .custom((plans) => {
                if (plans.length > 3) {
                    throw new Error(`Maximum 3 plans can be created`);
                }
                plans.forEach((plan, index) => {
                    if (typeof plan.plan_id !== 'number') {
                        throw new Error(`Plan ID must be a number in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_name !== 'string') {
                        throw new Error(`Plan name must be a string ${index + 1}`);
                    }

                    if (plan.plan_name.length > 20) {
                        throw new Error(`Plan name cannot exceed 20 characters in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_description !== 'string') {
                        throw new Error(`Plan description must be a string and cannot exceed 500 characters in plan ${index + 1}`);
                    }

                    if (plan.plan_description.length > 200) {
                        throw new Error(`Plan description cannot exceed 500 characters in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_price !== 'number') {
                        throw new Error(`Plan price must be a number in plan ${index + 1}`);
                    }

                    const validCurrencies = ['INR', 'USD'];
                    if (!validCurrencies.includes(plan.price_unit)) {
                        throw new Error(`Plan currency must be either INR or USD in plan ${index + 1}`);
                    }

                    if (typeof plan.plan_delivery_time !== 'number') {
                        throw new Error(`Plan delivery time must be a number in plan ${index + 1}`);
                    }

                    const validDurationUnits = ['HR', 'D', 'W', 'M'];
                    if (!validDurationUnits.includes(plan.duration_unit)) {
                        throw new Error(`Plan duration unit must be 'D', 'W', or 'M' in plan ${index + 1}`);
                    }

                    if (!Array.isArray(plan.plan_features) || plan.plan_features.length < 1 || plan.plan_features.length > 10) {
                        throw new Error(`Plan features must be a non-empty array with a maximum of 10 features in plan ${index + 1}`);
                    }

                    plan.plan_features.forEach((feature, featureIndex) => {
                        if (!feature.feature_name || feature.feature_name.length > 40) {
                            throw new Error(`Feature name must have a maximum length of 40 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }

                        if (!feature.feature_value || feature.feature_value.length > 10) {
                            throw new Error(`Feature value must have a maximum length of 10 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }
                    });
                });
                return true;
            }),
        body('location')
            .isString()
            .withMessage('Location must be a valid string')
            .notEmpty()
            .withMessage('Location cannot be empty')
            .trim()
            .escape()
    ],
    servicesProtectedController.createService
);

router.post('/:service_id(\\d+)/update-service-thumbnail',
    authenticateToken,
    upload.single('thumbnail'),
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'),
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
        body('user_id')
            .isInt().withMessage('Invalid user id format'),

        body('service_id')
            .isInt().withMessage('Invalid service id format'),
    ],
    servicesProtectedController.bookmarkService
);

router.post(
    '/remove-bookmark-service',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),

        body('service_id')
            .isInt().withMessage('Invalid service id format')
    ],
    servicesProtectedController.removeBookmarkService
);

router.get('/search-services-suggestions/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    servicesProtectedController.searchSuggestions
);

router.get('/guest-services-search-suggestions/:user_id(\\d+)',
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    servicesProtectedController.searchSuggestions
);

router.delete('/:service_id(\\d+)/delete-service',
    authenticateToken,
    [
        param('service_id').isInt().withMessage('Invalid service id format').trim().escape(),
        query('user_id').isInt().withMessage('Invalid user id format').trim().escape(),
    ],
    servicesProtectedController.deleteService
);

module.exports = router;