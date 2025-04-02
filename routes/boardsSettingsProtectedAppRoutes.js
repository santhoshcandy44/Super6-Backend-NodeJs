const express = require('express');
const router = express.Router();

const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
const { body, query } = require('express-validator');


const boardsSettingsProtectedController = require('../controllers/boardsSettingsProtectedController')

// Get boards section route
router.get('/get-boards',
    authenticateToken, // Ensure the user is authenticated
    [
        query('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    boardsSettingsProtectedController.getBoards
);


// Get industries section route
router.get('/get-guest-boards',
    [
        query('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),
    ],
    boardsSettingsProtectedController.getGuestBoards
);



// Get industries section route
router.put('/update-boards',
    authenticateToken, // Ensure the user is authenticated
    [
        body('user_id') // Validate `user_id` from the query parameters
            .isInt().withMessage('User id must be a valid integer')
            .trim().escape(),

        body('boards')
            .isString().withMessage('Boards must be a valid JSON string')
            .custom((value) => {
                try {
                    
                    const boardsArray = JSON.parse(value); // Parse JSON string
                    if (!Array.isArray(boardsArray)) {
                        throw new Error('Boards must be an array');
                    }

                    // Ensure at least one industry is selected
                    const isAnySelected = boardsArray.some(board => board.is_selected === true);
                    if (!isAnySelected) {
                        throw new Error('At least one board must be selected');
                    }

                    // Validate each industry object
                    boardsArray.forEach(board => {
                        if (typeof board.board_id !== 'number' || typeof board.is_selected !== 'boolean') {
                            throw new Error('Each board must have a valid board_id and is_selected field');
                        }
                        // Validate other optional fields
                        if (board.industry_name && typeof board.industry_name !== 'string') {
                            throw new Error('Each board must have a valid board_name (if present)');
                        }
                        if (board.industry_name && typeof board.industry_label !== 'string') {
                            throw new Error('Each board must have a valid board_label (if present)');
                        }
                       
                    });
                    return true;
                } catch (error) {
                    throw new Error(error.message);
                }
            })

    ],
    boardsSettingsProtectedController.updateBoards
);

module.exports = router;