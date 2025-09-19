const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
// Import the controller
const servicesProtectedController = require('../controllers/servicesProtectedController');

const { body, param, query } = require('express-validator');
const multer = require('multer');

const he = require('he');

// Multer setup for handling multipart form data
const upload = multer();

// Multer setup for handling multipart form data
const thumbnailUpload = multer();


router.get('/user-bookmark-services/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        param('user_id').isInt().withMessage('User ID must be a valid integer'),
    ],
    servicesProtectedController.getBookmarkedServices
);



// Update Service Route
router.get('/get-services', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        // Validate and sanitize the user_id parameter
        query('page')
            .optional()
            .isInt().withMessage('Invalid page format'), // Checks if user_id is a valid MongoDB ObjectId

        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format') // Ensures it's a string
            .trim()
            .escape()
            .isLength({ min: 0, max: 100 }) // Adjust the length limit as needed
            .withMessage('Query string must be between 1 and 100 characters long'), // Example length validation

        query('last_timestamp')
            .optional()
            .isString().withMessage('Last Timestamp must be a valid string format') // Ensures it's a string
            .trim()
            .escape()
            .custom((value, { req }) => {


                // Decode URL-encoded timestamp
                const decodedValue = decodeURIComponent(value);

                // Regular expression for validating YYYY-MM-DD HH:MM:SS format
                const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

                // Check if the timestamp matches the format
                if (!timestampRegex.test(decodedValue)) {
                    throw new Error('Last Timestamp must be in the format YYYY-MM-DD HH:MM:SS');
                }

                // If valid, store the decoded value back in req.query
                // req.query.last_timestamp = decodedValue;  // Store the valid timestamp

                return true; // Indicate successful validation
            })
            .isLength({ min: 19, max: 19 }).withMessage('Last Timestamp must be exactly 19 characters long in the format YYYY-MM-DD HH:MM:SS'), // Check length after conversion



        query('last_total_relevance')
            .optional()
            .isFloat().withMessage('Last total relevance must be a valid float format') // Ensures it's a string

    ],
    servicesProtectedController.getServices // Controller function to load user profile
);

//Get Services by Guest

router.get('/guest-get-services', // This ensures that user_id is a number
    (req, res, next) => {
        let originalValue = req.query.industries;

        if (originalValue) {
            // Step 1: If it's present but not an array, wrap it in an array
            if (originalValue && !Array.isArray(originalValue)) {
                originalValue = [originalValue]; // Wrap single value into an array
            }

            // Step 2: Ensure it's an array
            if (originalValue && !Array.isArray(originalValue)) {
                return res.status(400).json({ error: 'Industries must be an array' });
            }

            // Step 3: Validate each item in the array
            const validIndustries = originalValue.map(item => {
                const numItem = parseInt(item, 10); // Parse each item to an integer
                if (!Number.isInteger(numItem) || numItem <= 0) {
                    throw new Error(`Industry ID ${item} is not a valid positive integer`);
                }
                return numItem; // Return the valid integer
            });

            // Step 4: Normalize the industries and store them in req.query
            req.query.industries = validIndustries;
        }


        // Move to the next middleware or route handler
        next();
    },

    [
        // Validate and sanitize the user_id parameter
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        // Validate and sanitize the user_id parameter
        query('page')
            .optional()
            .isInt().withMessage('Invalid page format'), // Checks if user_id is a valid MongoDB ObjectId

        query('s')
            .optional()
            .isString().withMessage('Query string must be a valid string format') // Ensures it's a string
            .trim()
            .escape()
            .isLength({ min: 0, max: 100 }) // Adjust the length limit as needed
            .withMessage('Query string must be between 1 and 100 characters long'), // Example length validation


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
            .optional()  // Make it optional, but if present, it must pass the following checks
            .isArray()
            .withMessage('Industries must be an array of integers')
            .custom(value => {
                // Step 2.1: Ensure all items in the industries array are positive integers
                if (value.some(item => !Number.isInteger(item) || item <= 0)) {
                    throw new Error('Each industry ID must be a positive integer');
                }
                return true; // If the validation passes
            }),


        query('last_timestamp')
            .optional()
            .isString().withMessage('Last Timestamp must be a valid string format') // Ensures it's a string
            .trim()
            .escape()
            .custom((value, { req }) => {


                // Decode URL-encoded timestamp
                const decodedValue = decodeURIComponent(value);

                // Regular expression for validating YYYY-MM-DD HH:MM:SS format
                const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

                // Check if the timestamp matches the format
                if (!timestampRegex.test(decodedValue)) {
                    throw new Error('Last Timestamp must be in the format YYYY-MM-DD HH:MM:SS');
                }

                // If valid, store the decoded value back in req.query
                // req.query.last_timestamp = decodedValue;  // Store the valid timestamp

                return true; // Indicate successful validation
            })
            .isLength({ min: 19, max: 19 }).withMessage('Last Timestamp must be exactly 19 characters long in the format YYYY-MM-DD HH:MM:SS'), // Check length after conversion



        query('last_total_relevance')
            .optional()
            .isFloat().withMessage('Last total relevance must be a valid float format') // Ensures it's a string

    ],

    servicesProtectedController.guestGetServices // Controller function to load user profile
);


// Update Service Route
router.get('/get-published-services-feed-guest/:user_id(\\d+)', // This ensures that user_id is a number

    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    servicesProtectedController.getUserPublishedServicesFeedGuest // Controller function to load user profile
);



// Update Service Route
router.get('/get-published-services-feed-user/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    servicesProtectedController.getPublishedServicesFeedUser // Controller function to load user profile
);



// Update Service Route
router.get('/get-published-services/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    servicesProtectedController.getPublishedServices // Controller function to load user profile
);


router.patch('/:service_id(\\d+)/update-service-info',
    authenticateToken, // Ensure the user is authenticated
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
            .isLength({ min: 1, max: 100 }) // Adjust max length as needed
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 }) // Adjust max length as needed
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 }) // Adjust max length as needed
            .withMessage('Long Description must be between 1 and 5000 characters'),
        body('industry').isInt().withMessage('Industry must be a valid integer'),
    ],

    (req, res, next) => {

        // Manually decode URL-encoded fields
        req.body.user_id = he.decode(req.body.user_id);
        req.body.title = he.decode(req.body.title);
        req.body.short_description = he.decode(req.body.short_description);
        req.body.long_description = he.decode(req.body.long_description);
        req.body.industry = he.decode(req.body.industry); // If it's a string
        // Continue to validation and controller
        next();
    },

    servicesProtectedController.updateServiceInfo // Controller function to load user profile
);

// Update about section route
router.patch('/:service_id(\\d+)/update-service-plans',
    authenticateToken, // Ensure the user is authenticated
    (req, res, next) => {
        if (req.body.plans) {
            try {
                // Decode the URL-encoded string and parse it as JSON
                const decodedPlans = decodeURIComponent(req.body.plans);
                req.body.plans = JSON.parse(decodedPlans);  // Parse the decoded string into an object
                next();  // Proceed to the validation middleware
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
        // Plans validation
        body('plans')
            .isArray({ min: 1 }).withMessage('Plans must be a non-empty array')  // Ensure 'plans' is a non-empty array
            .bail()  // Stop if the array validation fails
            .custom((plans) => {


                if (plans.length > 3) {
                    throw new Error(`Maximum 3 plans can be created`); // Custom error for plan_id
                }

                // Custom validation logic for each plan in the plans array
                plans.forEach((plan, index) => {


                    // Validate plan_id to be a number
                    if (typeof plan.plan_id !== 'number') {
                        throw new Error(`Plan ID must be a number in plan ${index + 1}`); // Custom error for plan_id
                    }


                    // Validate plan_name inside the plan to be a string and within length limit
                    if (typeof plan.plan_name !== 'string') {
                        throw new Error(`Plan name must be a string ${index + 1}`); // Custom error for plan_name
                    }

                    if (plan.plan_name.length > 20) {
                        throw new Error(`Plan name cannot exceed 20 characters in plan ${index + 1}`); // Custom error for plan_name
                    }


                    // Validate plan_description to be a string and within length
                    if (typeof plan.plan_description !== 'string') {
                        throw new Error(`Plan description must be a string and cannot exceed 500 characters in plan ${index + 1}`); // Custom error for description
                    }

                    if (plan.plan_description.length > 200) {
                        throw new Error(`Plan description cannot exceed 500 characters in plan ${index + 1}`); // Custom error for description   
                    }

                    // Validate plan_price to be a number
                    if (typeof plan.plan_price !== 'number') {
                        throw new Error(`Plan price must be a number in plan ${index + 1}`); // Custom error for plan_price
                    }

                    const validCurrencies = ['INR', 'USD'];
                    if (!validCurrencies.includes(plan.price_unit)) {
                        throw new Error(`Plan currency must be either INR or USD in plan ${index + 1}`);
                    }

                    // Validate plan_delivery_time to be a number
                    if (typeof plan.plan_delivery_time !== 'number') {
                        throw new Error(`Plan delivery time must be a number in plan ${index + 1}`); // Custom error for delivery time
                    }

                    // Check if the duration_unit is one of the allowed values: 'd', 'w', or 'm'
                    const validDurationUnits = ['HR', 'D', 'W', 'M'];
                    if (!validDurationUnits.includes(plan.duration_unit)) {  // Assuming 'duration_type' holds the unit ('d', 'w', 'm')
                        throw new Error(`Plan duration unit must be 'D', 'W', or 'M' in plan ${index + 1}`);
                    }

                    // Validate plan_features to be a non-empty array
                    if (!Array.isArray(plan.plan_features) || plan.plan_features.length < 1 || plan.plan_features.length > 10) {
                        throw new Error(`Plan features must be a non-empty array with a maximum of 10 features in plan ${index + 1}`); // Custom error for plan_features

                    }

                    // Validate each feature in the plan_features array
                    plan.plan_features.forEach((feature, featureIndex) => {
                        // Ensure feature_name and feature_value exist and have a minimum length of 1

                        if (!feature.feature_name || feature.feature_name.length > 40) {
                            throw new Error(`Feature name must have a maximum length of 40 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }

                        if (!feature.feature_value || feature.feature_value.length > 10) {
                            throw new Error(`Feature value must have a maximum length of 10 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }
                    });

                });

                return true; // Return true if no errors were thrown
            })
    ],

    servicesProtectedController.updateServicePlans // Controller function to load user profile
);

// Update about section route
router.patch('/:service_id(\\d+)/update-service-location',
    authenticateToken, // Ensure the user is authenticated
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
            .escape(),
    ],

    servicesProtectedController.updateServiceLocation // Controller function to load user profile
);

// Update about section route
router.delete('/:service_id(\\d+)/delete-service-image',
    authenticateToken, // Ensure the user is authenticated
    [
        query('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        query('image_id').isInt().withMessage('Image ID must be a valid integer'),

    ],
    servicesProtectedController.deleteServiceImage // Controller function to load user profile
);


// Update about section route
router.post('/:service_id(\\d+)/upload-service-image',
    authenticateToken, // Ensure the user is authenticated
    upload.single('image'), // Limit the number of images to 10
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'), // Ensure it's an integer
        // Validate images if provided


        body('image')
            .custom((value, { req }) => {


                if (!req.file || req.file.length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),
    ],

    servicesProtectedController.uploadServiceImage // Controller function to load user profile
);



// Update about section route
router.post('/:service_id(\\d+)/update-service-image',
    authenticateToken, // Ensure the user is authenticated
    upload.single('image'), // Limit the number of images to 10
    [
        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'), // Ensure it's an integer
        // Validate images if provided
        body('image')
            .custom((value, { req }) => {



                if (!req.file || req.file.length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),
    ],

    servicesProtectedController.updateServiceImage // Controller function to load user profile
);




// Update Service Route
router.post('/create-service',
    authenticateToken, // Ensure the user is authenticated
    upload.fields([
        { name: 'thumbnail', maxCount: 1 }, // Single file upload for 'thumbnail'
        { name: 'images[]', maxCount: 10 }  // Multiple images upload
    ]),

    // Custom decoding middleware for 'plans'
    (req, res, next) => {
        if (req.body.plans) {
            try {
                // Decode the URL-encoded string and parse it as JSON
                const decodedPlans = decodeURIComponent(req.body.plans);
                req.body.plans = JSON.parse(decodedPlans);  // Parse the decoded string into an object
                next();  // Proceed to the validation middleware
            } catch (error) {
                return res.status(400).json({ message: 'Invalid plans format' });
            }
        } else {
            next();  // If no plans field, just move to validation
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
            .isLength({ min: 1, max: 100 }) // Adjust max length as needed
            .withMessage('Title must be between 1 and 100 characters'),

        body('short_description')
            .isString()
            .withMessage('Short Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Short Description cannot be empty')
            .isLength({ min: 1, max: 250 }) // Adjust max length as needed
            .withMessage('Short Description must be between 1 and 250 characters'),

        body('long_description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 }) // Adjust max length as needed
            .withMessage('Long Description must be between 1 and 5000 characters'),

        body('industry').isInt().withMessage('Industry must be a valid integer'),


        body('country')
            .isString()
            .withMessage('Country must be a valid string')
            // Check if the 'country' is in the allowed countries array using 'is' method
            .custom((value) => {
                const allowedCountries = ['IN']; // List of allowed countries
                if (!allowedCountries.includes(value)) {
                    throw new Error('Country must be a valid country (IN, USA)');
                }
                return true;
            }),

        // Validate state based on selected country
        body('state')
            .isString()
            .withMessage('State must be a valid string')
            .custom((value, { req }) => {
                const country = req.body.country; // Get the selected country

                // If the country is India (IN), validate against Indian states
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


        // Validate images if provided
        body('images[]')
            .custom((value, { req }) => {
                if (!req.files['images[]'] || req.files['images[]'].length === 0) {
                    throw new Error('At least one image is required');
                }
                return true;
            }),

        // Validate thumbnail if provided
        body('thumbnail')
            .custom((value, { req }) => {
                if (!req.files['thumbnail'] || req.files['thumbnail'].length === 0) {
                    throw new Error('Thumbnail image is required');
                }
                return true;
            }),


        body('plans')
            .isArray({ min: 1 }).withMessage('Plans must be a non-empty array')  // Ensure 'plans' is a non-empty array
            .bail()  // Stop if the array validation fails
            .custom((plans) => {


                if (plans.length > 3) {
                    throw new Error(`Maximum 3 plans can be created`); // Custom error for plan_id
                }

                // Custom validation logic for each plan in the plans array
                plans.forEach((plan, index) => {


                    // Validate plan_id to be a number
                    if (typeof plan.plan_id !== 'number') {
                        throw new Error(`Plan ID must be a number in plan ${index + 1}`); // Custom error for plan_id
                    }


                    // Validate plan_name inside the plan to be a string and within length limit
                    if (typeof plan.plan_name !== 'string') {
                        throw new Error(`Plan name must be a string ${index + 1}`); // Custom error for plan_name
                    }

                    if (plan.plan_name.length > 20) {
                        throw new Error(`Plan name cannot exceed 20 characters in plan ${index + 1}`); // Custom error for plan_name
                    }


                    // Validate plan_description to be a string and within length
                    if (typeof plan.plan_description !== 'string') {
                        throw new Error(`Plan description must be a string and cannot exceed 500 characters in plan ${index + 1}`); // Custom error for description
                    }

                    if (plan.plan_description.length > 200) {
                        throw new Error(`Plan description cannot exceed 500 characters in plan ${index + 1}`); // Custom error for description   
                    }

                    // Validate plan_price to be a number
                    if (typeof plan.plan_price !== 'number') {
                        throw new Error(`Plan price must be a number in plan ${index + 1}`); // Custom error for plan_price
                    }

                    const validCurrencies = ['INR', 'USD'];
                    if (!validCurrencies.includes(plan.price_unit)) {
                        throw new Error(`Plan currency must be either INR or USD in plan ${index + 1}`);
                    }

                    // Validate plan_delivery_time to be a number
                    if (typeof plan.plan_delivery_time !== 'number') {
                        throw new Error(`Plan delivery time must be a number in plan ${index + 1}`); // Custom error for delivery time
                    }

                    // Check if the duration_unit is one of the allowed values: 'd', 'w', or 'm'
                    const validDurationUnits = ['HR', 'D', 'W', 'M'];
                    if (!validDurationUnits.includes(plan.duration_unit)) {  // Assuming 'duration_type' holds the unit ('d', 'w', 'm')
                        throw new Error(`Plan duration unit must be 'D', 'W', or 'M' in plan ${index + 1}`);
                    }

                    // Validate plan_features to be a non-empty array
                    if (!Array.isArray(plan.plan_features) || plan.plan_features.length < 1 || plan.plan_features.length > 10) {
                        throw new Error(`Plan features must be a non-empty array with a maximum of 10 features in plan ${index + 1}`); // Custom error for plan_features

                    }

                    // Validate each feature in the plan_features array
                    plan.plan_features.forEach((feature, featureIndex) => {
                        // Ensure feature_name and feature_value exist and have a minimum length of 1

                        if (!feature.feature_name || feature.feature_name.length > 40) {
                            throw new Error(`Feature name must have a maximum length of 40 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }

                        if (!feature.feature_value || feature.feature_value.length > 10) {
                            throw new Error(`Feature value must have a maximum length of 10 in feature ${featureIndex + 1} of plan ${index + 1}`);
                        }
                    });

                });

                return true; // Return true if no errors were thrown
            }),

        body('location')
            .isString()
            .withMessage('Location must be a valid string')
            .notEmpty()
            .withMessage('Location cannot be empty')
            .trim()
            .escape()
    ],

    servicesProtectedController.createService // Controller to handle the request
);




// Update Service Route
router.post('/:service_id(\\d+)/update-service-thumbnail',
    authenticateToken, // Ensure the user is authenticated
    upload.single('thumbnail'), // Limit the number of images to 10

    [



        body('user_id').isInt().withMessage('User ID must be a valid integer'),
        param('service_id').isInt().withMessage('Service ID must be a valid integer'),
        body('image_id')
            .isInt().withMessage('Image ID must be a valid integer'), // Ensure it's an integer
        // Validate images if provided

        // Validate thumbnail if provided
        body('thumbnail')
            .custom((value, { req }) => {
                if (!req.file || req.file.length === 0) {
                    throw new Error('Thumbnail image is required');
                }
                return true;
            }),
    ],

    servicesProtectedController.updateServiceTumbnail // Controller to handle the request
);




// Update Service Route
router.post(
    '/bookmark-service', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        body('user_id')
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        body('service_id')
            .isInt().withMessage('Invalid service id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    servicesProtectedController.bookmarkService // Controller function to load user profile
);


// Update Service Route
router.post(
    '/remove-bookmark-service', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        body('user_id')
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        body('service_id')
            .isInt().withMessage('Invalid service id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    servicesProtectedController.removeBookmarkService // Controller function to load user profile
);


// Update Service Route
router.get('/search-services-suggestions/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        // Validate and sanitize the query parameter
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    servicesProtectedController.searchSuggestions // Controller function to load user profile
);

 
// Update Service Route
router.get('/guest-services-search-suggestions/:user_id(\\d+)', // This ensures that user_id is a number
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        // Validate and sanitize the query parameter
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    servicesProtectedController.searchSuggestions // Controller function to load user profile
);



// Update about section route
router.delete('/:service_id(\\d+)/delete-service',
    authenticateToken, // Ensure the user is authenticated
    [
        param('service_id').isInt().withMessage('Invalid service id format').trim().escape(),
        query('user_id').isInt().withMessage('Invalid user id format').trim().escape(),
    ],
    servicesProtectedController.deleteService // Controller function to load user profile
);

module.exports = router;