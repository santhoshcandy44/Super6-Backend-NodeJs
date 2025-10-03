const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware'); 
const { body, query } = require('express-validator');
const jobIndustriesSettingsProtectedController = require('../controllers/jobIndustriesSettingsProtectedController')
const router = express.Router();

router.get('/get-industries',
    authenticateToken, 
    [
        query('user_id')
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    jobIndustriesSettingsProtectedController.getIndustries
);

router.get('/get-industries',
    authenticateToken, 
    [
        query('user_id') 
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    jobIndustriesSettingsProtectedController.getIndustries
);

router.get('/get-guest-industries',
    [
        query('user_id') 
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    jobIndustriesSettingsProtectedController.getGuestIndustries
);

router.put('/update-industries',
    authenticateToken,
    [
        body('user_id') 
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),

        body('industries')
            .isString().withMessage('Industries must be a valid JSON string')
            .custom((value) => {
                try {
                    const industriesArray = JSON.parse(value); 
                    if (!Array.isArray(industriesArray)) {
                        throw new Error('Industries must be an array');
                    }

                    const isAnySelected = industriesArray.some(industry => industry.is_selected === true);
                    if (!isAnySelected) {
                        throw new Error('At least one industry must be selected');
                    }

                    industriesArray.forEach(industry => {
                        if (typeof industry.industry_id !== 'number' || typeof industry.is_selected !== 'boolean') {
                            throw new Error('Each industry must have a valid industry_id and is_selected field');
                        }
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
    jobIndustriesSettingsProtectedController.updateIndustries
);

module.exports = router;