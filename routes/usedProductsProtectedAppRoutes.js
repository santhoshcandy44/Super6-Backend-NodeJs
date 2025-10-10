const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const usedProductsProtectedController = require('../controllers/usedProductsProtectedController');
const he = require('he');
const { body, param, query } = require('express-validator');
const multer = require('multer');
const router = express.Router();
const upload = multer();

router.get('/used-product-listings',
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
    usedProductsProtectedController.getUsedProductListings
);

router.get('/guest-used-product-listings',
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
    usedProductsProtectedController.getGuestUsedProductListings
);

router.get('/feed-user-published-used-product-listings/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'),

        query('after_id')
            .optional()
            .isInt().withMessage('Invalid after id format')
            .toInt(),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('last_timestamp')
            .optional()
            .isString().withMessage('Last Timestamp must be a valid string format')
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
    usedProductsProtectedController.getUserFeedPublishedUsedProductListings
);

router.get('/guest-feed-user-published-used-product-listings/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .optional()
            .isInt().withMessage('Invalid user id format'),

        query('after_id')
            .optional()
            .isInt().withMessage('Invalid after id format')
            .toInt(),

        query('page_size')
            .optional()
            .isInt().withMessage('Invalid page size format')
            .toInt(),

        query('last_timestamp')
            .optional()
            .isString().withMessage('Last Timestamp must be a valid string format')
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
    usedProductsProtectedController.getGuestFeedPublishedUsedProductListings
);

router.get('/published-used-product-listings/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
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
    usedProductsProtectedController.getPublishedUsedProductListings
);

router.post('/create-or-update-used-product-listing',
    authenticateToken,
    upload.fields([
        { name: 'images[]', maxCount: 10 }
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
            .isLength({ min: 1, max: 100 })
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
                if (!Array.isArray(value)) {
                    throw new Error('Keep Image IDs must be an array');
                }

                const asNumbers = value.map(id => Number(id));

                if (asNumbers.includes(NaN)) {
                    throw new Error('All values in Keep Image IDs must be integers');
                }

                if (!asNumbers.every(Number.isInteger)) {
                    throw new Error('All values in Keep Image IDs must be integers');
                }

                if (asNumbers.length === 0 && (!req.files['images[]'] || req.files['images[]'].length === 0)) {
                    throw new Error('Either Keep Image IDs or Images must be provided');
                }

                req.body.keep_image_ids = asNumbers;
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
            .isFloat({ min: 0 })
            .withMessage('Price must be a valid number greater than or equal to 0')
            .notEmpty()
            .withMessage('Price cannot be empty'),

        body('price_unit')
            .isIn(['INR', 'USD'])
            .withMessage('Price unit must be either INR or USD'),

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

    usedProductsProtectedController.createOrUpdateUsedProductListing
);

router.post(
    '/bookmark-used-product-listing',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),

        body('product_id')
            .isInt().withMessage('Invalid product id format')
    ],
    usedProductsProtectedController.bookmarkUsedProductListing
);

router.post(
    '/remove-bookmark-used-product-listing',
    authenticateToken,
    [
        body('user_id')
            .isInt().withMessage('Invalid user id format'),

        body('product_id')
            .isInt().withMessage('Invalid product id format')
    ],
    usedProductsProtectedController.removeBookmarkUsedProductListing
);

router.get('/used-product-listing-search-suggestions/:user_id(\\d+)',
    authenticateToken,
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    usedProductsProtectedController.usedProductListingsSearchQueries
);

router.get('/guest-used-product-listing-search-suggestions/:user_id(\\d+)',
    [
        param('user_id')
            .isInt().withMessage('Invalid user id format'),

        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    usedProductsProtectedController.usedProductListingsSearchQueries
);

router.delete('/:product_id(\\d+)/delete-used-product-listing',
    authenticateToken,
    [
        param('product_id').isInt().withMessage('Invalid product id format').trim().escape(),
        query('user_id').isInt().withMessage('Invalid user id format').trim().escape(),
    ],
    usedProductsProtectedController.deleteUsedProductListing
);

module.exports = router;