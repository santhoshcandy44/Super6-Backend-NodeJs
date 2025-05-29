const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const he = require('he'); // For decoding the HTML entities in the string (if needed)


const localJobsProtectedController = require('../controllers/localJobsProtectedController');

const { body, param, query } = require('express-validator');
const multer = require('multer');


// Multer setup for handling multipart form data
const upload = multer();



router.get('/get-local-jobs', // This ensures that user_id is a number
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
    localJobsProtectedController.getLocalJobsForUser // Controller function to load user profile
);


router.get('/guest-get-local-jobs', // This ensures that user_id is a number

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


                const decodedValue = decodeURIComponent(value);

                const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

                if (!timestampRegex.test(decodedValue)) {
                    throw new Error('Last Timestamp must be in the format YYYY-MM-DD HH:MM:SS');
                }

                // If valid, store the decoded value back in req.query
                // req.query.last_timestamp = decodedValue;  // Store the valid timestamp

                return true;
            })
            .isLength({ min: 19, max: 19 }).withMessage('Last Timestamp must be exactly 19 characters long in the format YYYY-MM-DD HH:MM:SS'),


        query('last_total_relevance')
            .optional()
            .isFloat().withMessage('Last total relevance must be a valid float format')

    ],

    localJobsProtectedController.guestGetLocalJobs
);


router.get('/get-published-local-jobs/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),
    ],
    localJobsProtectedController.getPublishedLocalJobs
);

router.post('/create-or-update-local-job',
    authenticateToken,
    upload.fields([
        { name: 'images[]', maxCount: 10 }
    ]),

    [
        body('local_job_id').isInt().withMessage('Local Job ID must be a valid integer'),

        body('title')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),


        body('description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 })
            .withMessage('Long Description must be between 1 and 5000 characters'),


        body('company')
            .isString()
            .withMessage('Company must be a valid string')
            .trim()
            .escape()
            .notEmpty()
            .withMessage('Company cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Company must be between 1 and 100 characters'),

        body('age_min')
            .isInt({ min: 18, max: 60 })
            .withMessage('Minimum age must be a valid number between 18 and 40'),

        body('age_max')
            .isInt({ min: 18, max: 60 })
            .withMessage('Maximum age must be a valid number between 18 and 40')
            .custom((value, { req }) => {
                if (parseInt(value) < parseInt(req.body.age_min)) {
                    throw new Error('Maximum age must be greater than or equal to minimum age');
                }
                return true;
            }),


        body('salary_min')
            .isInt()
            .withMessage('Minimum salary must be a valid number'),

        body('salary_max')
            .isInt()
            .withMessage('Maximum  must be a valid number')
            .custom((value, { req }) => {
                if (parseInt(value) != -1 && parseInt(value) < parseInt(req.body.salary_min)) {
                    throw new Error('Maximum salary must be greater than or equal to minimum');
                }
                return true;
            }),


        body('salary_unit')
            .isIn(['INR', 'USD'])
            .withMessage('Price unit must be either INR or USD'),

        body('marital_statuses')

            .isArray().withMessage('Marital status must be an array')
            .custom((value) => {
                if (!value.every(status => ['ANY', 'SINGLE', 'MARRIED', 'UNMARRIED', 'WIDOWED'].includes(status))) {
                    throw new Error('Each marital status must be one of: ANY, SINGLE, MARRIED, UNMARRIED, WIDOWED');
                }
                return true;
            }),

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

                if ((!req.files['images[]'] || req.files['images[]'].length === 0) && (!req.body.keep_image_ids || req.body.keep_image_ids.length === 0)) {
                    throw new Error('Atleast 1 image is required');
                }
                return true;
            }),

        body('keep_image_ids')
            .optional()
            .custom((value, { req }) => {
                console.log(value);
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



        body('location')
            .isString()
            .withMessage('Location must be a valid string')
            .notEmpty()
            .withMessage('Location cannot be empty')
            .trim()
            .escape()
            .custom((value) => {
                const decodedLocation = he.decode(value);
                const location = JSON.parse(decodedLocation);

                if (
                    typeof location.latitude !== 'number' ||
                    typeof location.longitude !== 'number'
                ) {
                    throw new Error('Location must contain valid latitude and longitude');
                }

                if (location.latitude < -90 || location.latitude > 90) {
                    throw new Error('Latitude must be a number between -90 and 90');
                }

                if (location.longitude < -180 || location.longitude > 180) {
                    throw new Error('Longitude must be a number between -180 and 180');
                }


                const validTypes = ['approximate', 'precise'];
                if (!validTypes.includes(location.location_type)) {
                    throw new Error('Location type must be either "approximate" or "precise"');
                }

                return true;
            }),
    ],

    localJobsProtectedController.createOrUpdateLocalJob
);


router.post(
    '/apply-local-job',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),
        body('local_job_id')
            .isInt().withMessage('Invalid local job id format'),

    ],
    localJobsProtectedController.applyLocalJob
);


router.get(
    '/get-local-job-applicants/:local_job_id(\\d+)',
    authenticateToken,
    [
        param('local_job_id')
            .isInt().withMessage('Invalid local job id format'),

        query('page')
            .optional()
            .isInt().withMessage('Invalid page format'),


        query('last_timestamp')
            .optional()
            .isString().withMessage('Last Timestamp must be a valid string format') // Ensures it's a string
            .trim()
            .escape()
            .custom((value, { req }) => {

                const decodedValue = decodeURIComponent(value);

                const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

                if (!timestampRegex.test(decodedValue)) {
                    throw new Error('Last Timestamp must be in the format YYYY-MM-DD HH:MM:SS');
                }

                return true;
            })
            .isLength({ min: 19, max: 19 }).withMessage('Last Timestamp must be exactly 19 characters long in the format YYYY-MM-DD HH:MM:SS')
    ],
    localJobsProtectedController.getLocalJobApplicants
);


router.post(
    '/mark-as-reviewed-local-job',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),
        body('local_job_id')
            .isInt().withMessage('Invalid local job id format'),
        body('applicant_id')
            .isInt().withMessage('Invalid applicant id format'),
    ],
    localJobsProtectedController.markAsReviewedLocalJob
);


router.post(
    '/unmark-reviewed-local-job',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),
        body('local_job_id')
            .isInt().withMessage('Invalid local job id format'),
        body('applicant_id')
            .isInt().withMessage('Invalid applicant id format'),

    ],
    localJobsProtectedController.unmarkReviewedLocalJob
);



router.post(
    '/bookmark-local-job',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),
        body('local_job_id')
            .isInt().withMessage('Invalid local job id format'),

    ],
    localJobsProtectedController.bookmarkLocalJob
);


router.post(
    '/remove-bookmark-local-job',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),

        body('local_job_id')
            .isInt().withMessage('Invalid local job id format'),

    ],
    localJobsProtectedController.removeBookmarkLocalJob
);

router.get('/search-local-job-suggestions/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    localJobsProtectedController.localJobsSearchQueries
);

router.get('/guest-search-local-job-suggestions/:user_id(\\d+)',
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    localJobsProtectedController.localJobsSearchQueries
);

router.delete('/:local_job_id(\\d+)/delete-local-job',
    authenticateToken,
    [
        param('local_job_id').isInt().withMessage('Invalid product id format').trim().escape(),
        query('user_id').isInt().withMessage('Invalid user id format').trim().escape(),
    ],
    localJobsProtectedController.deleteLocalJob
);

module.exports = router;