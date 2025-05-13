const express = require('express');
const router = express.Router();

const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
const { body, query } = require('express-validator');


const industriesSettingsProtectedController = require('../controllers/IndustriesSettingsProtectedController')

// Get industries section route
router.get('/get-industries',
    authenticateToken, // Ensure the user is authenticated
    [
        query('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    industriesSettingsProtectedController.getIndustries
);


// Get industries section route
router.get('/get-industries',
    authenticateToken, // Ensure the user is authenticated
    [
        query('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    industriesSettingsProtectedController.getIndustries
);


// Get industries section route
router.get('/get-guest-industries',
    [
        query('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    industriesSettingsProtectedController.getGuestIndustries
);



// Get industries section route
router.put('/update-industries',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),

        body('industries')
            .isString().withMessage('Industries must be a valid JSON string')
            .custom((value) => {
                try {
                    const industriesArray = JSON.parse(value); // Parse JSON string
                    if (!Array.isArray(industriesArray)) {
                        throw new Error('Industries must be an array');
                    }

                    // Ensure at least one industry is selected
                    const isAnySelected = industriesArray.some(industry => industry.is_selected === true);
                    if (!isAnySelected) {
                        throw new Error('At least one industry must be selected');
                    }

                    // Validate each industry object
                    industriesArray.forEach(industry => {
                        if (typeof industry.industry_id !== 'number' || typeof industry.is_selected !== 'boolean') {
                            throw new Error('Each industry must have a valid industry_id and is_selected field');
                        }
                        // Validate other optional fields
                        if (industry.industry_name && typeof industry.industry_name !== 'string') {
                            throw new Error('Each industry must have a valid industry_name (if present)');
                        }
                        if (industry.description && typeof industry.description !== 'string') {
                            throw new Error('Each industry must have a valid description (if present)');
                        }
                    });
                    return true;
                } catch (error) {
                    throw new Error('Invalid JSON structure for industries');
                }
            })

    ],
    industriesSettingsProtectedController.updateIndustries
);

module.exports = router;