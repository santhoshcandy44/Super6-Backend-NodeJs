const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware'); 
const { body } = require('express-validator');
const industriesSettingsProtectedController = require('../controllers/industriesSettingsProtectedController')
const router = express.Router();

router.get('/get-industries',
    authenticateToken, 
    [
    ],
    industriesSettingsProtectedController.getIndustries
);

router.get('/get-industries',
    authenticateToken, 
    [
    ],
    industriesSettingsProtectedController.getIndustries
);

router.get('/get-guest-industries',
    [
    ],
    industriesSettingsProtectedController.getGuestIndustries
);

router.put('/update-industries',
    authenticateToken,
    [
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
    industriesSettingsProtectedController.updateIndustries
);

module.exports = router;