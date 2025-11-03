const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const { body } = require('express-validator');
const router = express.Router();
const boardsSettingsProtectedController = require('../controllers/boardsSettingsProtectedController')

router.get('/boards',
    authenticateToken,
    [
    ],
    boardsSettingsProtectedController.getBoards
);

router.get('/guest-boards',
    [
    ],
    boardsSettingsProtectedController.getGuestBoards
);

router.put('/update-boards',
    authenticateToken,
    [
        body('boards')
            .isString().withMessage('Boards must be a valid JSON string')
            .custom((value) => {
                try {
                    const boardsArray = JSON.parse(value);
                    if (!Array.isArray(boardsArray)) {
                        throw new Error('Boards must be an array');
                    }
                    const isAnySelected = boardsArray.some(board => board.is_selected === true);
                    if (!isAnySelected) {
                        throw new Error('At least one board must be selected');
                    }
                    boardsArray.forEach(board => {
                        if (typeof board.board_id !== 'number' || typeof board.is_selected !== 'boolean') {
                            throw new Error('Each board must have a valid board_id and is_selected field');
                        }
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