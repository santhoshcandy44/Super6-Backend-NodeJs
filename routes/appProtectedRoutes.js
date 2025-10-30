const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const router = express.Router();
const appProtectedController = require('../controllers/appProtectedController');
const { body, param, query } = require('express-validator');

router.post('/update-fcm',
  authenticateToken,
  [
    body('fcm_token').not().isEmpty().withMessage('FCM token is required').trim().escape(),
  ],
  appProtectedController.updateFCMToken);

router.post('/update-ee2ee-public-key',
  authenticateToken,
  [
    body('e2ee_public_key').not().isEmpty().withMessage('Pyblic key is required').trim().escape(),

    body('key_version')
      .not().isEmpty().withMessage('Key version is required')
      .isNumeric().withMessage('Key version must be a number')
      .custom(value => {
        if (parseInt(value) < 0 || parseInt(value) === -1) {
          throw new Error('Key version cannot be negative or -1');
        }
        return true;
      })
      .trim()
      .escape()
  ],
  appProtectedController.updateE2EEPublicKey);

router.get('/user-bookmarks',
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
  appProtectedController.getBookmarks
);

module.exports = router;