const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const usedProductsProtectedController = require('../controllers/usedProductsProtectedController');
const { body, param, query } = require('express-validator');
const { uploadMultiple } = require('./utils/multerUpload');
const router = express.Router();

router.get('/used-product-listings',
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
    usedProductsProtectedController.getUsedProductListings
);

router.get('/guest-used-product-listings',
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
    usedProductsProtectedController.getFeedUserPublishedUsedProductListings
);

router.get('/guest-feed-user-published-used-product-listings/:user_id(\\d+)',
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
    usedProductsProtectedController.getGuestFeedUserPublishedUsedProductListings
);

router.get('/published-used-product-listings',
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
    usedProductsProtectedController.getPublishedUsedProductListings
);

router.post('/create-or-update-used-product-listing',
    authenticateToken,
    uploadMultiple("images", 10),
    [
        body('product_id').isInt().withMessage('Product ID must be a valid integer'),

        body('name')
            .isString()
            .withMessage('Title must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Title cannot be empty')
            .isLength({ min: 1, max: 100 })
            .withMessage('Title must be between 1 and 100 characters'),

        body('description')
            .isString()
            .withMessage('Long Description must be a valid string')
            .trim()
            .notEmpty()
            .withMessage('Long Description cannot be empty')
            .isLength({ min: 1, max: 5000 })
            .withMessage('Long Description must be between 1 and 5000 characters'),

        body('country')
            .isString()
            .withMessage('Country must be a valid string')
            .isIn(['IN', 'USA'])
            .withMessage('Country must be a valid country (IN, USA)'),

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
                if ((!req.files || req.files.length === 0) && (!req.body.keep_image_ids || req.body.keep_image_ids.length === 0)) {
                    throw new Error('Atleast 1 image is required');
                }
                return true;
            }),

        body('keep_image_ids')
            .optional()
            .customSanitizer(value => {
                try {
                    return JSON.parse(value);
                } catch {
                    return null;
                }
            })
            .isArray()
            .withMessage('Keep Image IDs must be an array')
            .custom(value => {
                const asNumbers = value.map(Number);
                if (!asNumbers.every(Number.isInteger)) {
                    throw new Error('All values in Keep Image IDs must be integers');
                }
                return asNumbers;
            })
            .custom((asNumbers, { req }) => {
                if (asNumbers.length === 0 && (!req.files || req.files.length === 0)) {
                    throw new Error('Either Keep Image IDs or Images must be provided');
                }
                req.body.keep_image_ids = asNumbers;
                return true;
            }),

        body('price')
            .customSanitizer(value => {
                const numValue = parseFloat(value);
                return isNaN(numValue) ? null : numValue;
            })
            .isFloat({ min: 0 })
            .withMessage('Price must be a valid number greater than or equal to 0'),

        body('price_unit')
            .isIn(['INR', 'USD'])
            .withMessage('Price unit must be either INR or USD'),

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
    usedProductsProtectedController.createOrUpdateUsedProductListing
);

router.post(
    '/bookmark-used-product-listing',
    authenticateToken,
    [
        body('product_id')
            .isInt().withMessage('Invalid product id format')
            .toInt()
    ],
    usedProductsProtectedController.bookmarkUsedProductListing
);

router.post(
    '/remove-bookmark-used-product-listing',
    authenticateToken,
    [
        body('product_id')
            .isInt().withMessage('Invalid product id format')
            .toInt()
    ],
    usedProductsProtectedController.removeBookmarkUsedProductListing
);

router.get('/used-product-listing-search-suggestions',
    authenticateToken,
    [
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    usedProductsProtectedController.usedProductListingsSearchQueries
);

router.get('/guest-used-product-listing-search-suggestions',
    [
        query('query')
            .isString().withMessage('Invalid user query format')
            .notEmpty().withMessage('Query cannot be empty'),
    ],
    usedProductsProtectedController.usedProductListingsSearchQueries
);

router.delete('/:product_id(\\d+)/delete-used-product-listing',
    authenticateToken,
    [
        param('product_id').isInt().withMessage('Invalid product id format')
            .toInt()
    ],
    usedProductsProtectedController.deleteUsedProductListing
);

module.exports = router;