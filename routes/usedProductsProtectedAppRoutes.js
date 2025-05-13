const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
const he = require('he'); // For decoding the HTML entities in the string (if needed)


// Import the controller
const usedProductsProtectedController = require('../controllers/usedProductsProtectedController');

const { body, param, query } = require('express-validator');
const multer = require('multer');


// Multer setup for handling multipart form data
const upload = multer();



router.get('/get-used-product-listings', // This ensures that user_id is a number
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
    usedProductsProtectedController.getUsedProductListingsForUser // Controller function to load user profile
);


router.get('/guest-get-used-product-listings', // This ensures that user_id is a number
 
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

    usedProductsProtectedController.guestGetUsedProductListings // Controller function to load user profile
);


// // Update Service Route
// router.get('/get-published-services-feed-guest/:user_id(\\d+)', // This ensures that user_id is a number

//     [
//         // Validate and sanitize the user_id parameter
//         param('user_id')
//             .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

//     ],
//     servicesProtectedController.getUserPublishedServicesFeedGuest // Controller function to load user profile
// );


// // Update Service Route
// router.get('/get-published-services-feed-user/:user_id(\\d+)', // This ensures that user_id is a number
//     authenticateToken, // Ensure the user is authenticated
//     [
//         // Validate and sanitize the user_id parameter
//         param('user_id')
//             .optional()
//             .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

//     ],
//     servicesProtectedController.getPublishedServicesFeedUser // Controller function to load user profile
// );



// Update Service Route
router.get('/get-published-used-product-listings/:user_id(\\d+)', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        query('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    usedProductsProtectedController.getPublishedUsedProductListings // Controller function to load user profile
);


// Update Service Route
router.post('/create-or-update-used-product-listing',
    authenticateToken, // Ensure the user is authenticated
    upload.fields([
        { name: 'images[]', maxCount: 10 }  // Multiple images upload
    ]),

    [
        body('product_id').isInt().withMessage('Product ID must be a valid integer'),

        body('name')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 }) // Adjust max length as needed
            .withMessage('Title must be between 1 and 100 characters'),


        body('description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 }) // Adjust max length as needed
            .withMessage('Long Description must be between 1 and 5000 characters'),



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
                if ((!req.files['images[]'] || req.files['images[]'].length === 0) && (!req.body.keep_image_ids || req.body.keep_image_ids.length === 0)) {
                    throw new Error('Atleast 1 image is required');
                }
                return true;
            }),

            body('keep_image_ids')
            .optional()
            .custom((value, { req }) => {
                if (!Array.isArray(value)) {
                    throw new Error('Keep Image IDs must be an array');
                }

                // Convert each value to a number
                const asNumbers = value.map(id => Number(id));

                // Check if any value is NaN
                if (asNumbers.includes(NaN)) {
                    throw new Error('All values in Keep Image IDs must be integers');
                }

                // Ensure that all values are valid integers
                if (!asNumbers.every(Number.isInteger)) {
                    throw new Error('All values in Keep Image IDs must be integers');
                }

                // Ensure either images or IDs are present
                if (asNumbers.length === 0 && (!req.files['images[]'] || req.files['images[]'].length === 0)) {
                    throw new Error('Either Keep Image IDs or Images must be provided');
                }

                req.body.keep_image_ids = asNumbers;  // Store the parsed numbers

                return true;
            }),



        body('price')
            .custom((value, { req }) => {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    throw new Error('Price must be a valid number');
                }
                return true;
            })
            .isFloat({ min: 0 }) // Ensures price is a float >= 0
            .withMessage('Price must be a valid number greater than or equal to 0')
            .notEmpty()
            .withMessage('Price cannot be empty'),

        body('price_unit')
            .isIn(['INR', 'USD']) // Ensures only "INR" or "USD" are accepted
            .withMessage('Price unit must be either INR or USD'),

        // First validate the "location" field as a string
        body('location')
            .isString()
            .withMessage('Location must be a valid string')
            .notEmpty()
            .withMessage('Location cannot be empty')
            .trim()
            .escape()
            .custom((value) => {
                // Decode the location JSON string if it's valid
                const decodedLocation = he.decode(value); // Decode the HTML entities (if any)
                // Parse the decoded location JSON string
                const location = JSON.parse(decodedLocation);

                // Check if the parsed object has latitude, longitude, and type
                if (
                    typeof location.latitude !== 'number' ||
                    typeof location.longitude !== 'number'
                ) {
                    throw new Error('Location must contain valid latitude and longitude');
                }

                // Validate latitude range (-90 to 90)
                if (location.latitude < -90 || location.latitude > 90) {
                    throw new Error('Latitude must be a number between -90 and 90');
                }

                // Validate longitude range (-180 to 180)
                if (location.longitude < -180 || location.longitude > 180) {
                    throw new Error('Longitude must be a number between -180 and 180');
                }


                // Validate the location type (must be 'approximate' or 'precise')
                const validTypes = ['approximate', 'precise'];
                if (!validTypes.includes(location.location_type)) {
                    throw new Error('Location type must be either "approximate" or "precise"');
                }

                // If all checks pass, return true
                return true;
            }),
    ],

    usedProductsProtectedController.createOrUpdateUsedProductListing // Controller to handle the request
);




router.post(
    '/bookmark-used-product-listing', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        body('user_id')
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        body('product_id')
            .isInt().withMessage('Invalid product id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    usedProductsProtectedController.bookmarkUsedProductListing // Controller function to load user profile
);


router.post(
    '/remove-bookmark-used-product-listing', // This ensures that user_id is a number
    authenticateToken, // Ensure the user is authenticated
    [
        // Validate and sanitize the user_id parameter
        body('user_id')
            .isInt().withMessage('Invalid user id format'), // Checks if user_id is a valid MongoDB ObjectId

        body('product_id')
            .isInt().withMessage('Invalid product id format'), // Checks if user_id is a valid MongoDB ObjectId

    ],
    usedProductsProtectedController.removeBookmarkUsedProductListing // Controller function to load user profile
);


router.get('/search-used-product-listing-suggestions/:user_id(\\d+)', // This ensures that user_id is a number
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
    usedProductsProtectedController.usedProductListingsSearchQueries // Controller function to load user profile
);



// Update Service Route
router.get('/guest-used-product-listing-search-suggestions/:user_id(\\d+)', // This ensures that user_id is a number
    [
        // Validate and sanitize the user_id parameter
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        // Validate and sanitize the query parameter
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    usedProductsProtectedController.usedProductListingsSearchQueries // Controller function to load user profile
);



router.delete('/:product_id(\\d+)/delete-used-product-listing',
    authenticateToken, // Ensure the user is authenticated
    [
        param('product_id').isInt().withMessage('Invalid product id format').trim().escape(),
        query('user_id').isInt().withMessage('Invalid user id format').trim().escape(),
    ],
    usedProductsProtectedController.deleteUsedProductListing // Controller function to load user profile
);

module.exports = router;