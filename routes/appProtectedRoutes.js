const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const router = express.Router();
const appProtectedController = require('../controllers/appProtectedController');
const { body, param, query} = require('express-validator');

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

router.get('/user-bookmarks/:user_id(\\d+)',
  authenticateToken,
  [
    param('user_id').isInt().withMessage('User ID must be a valid integer'),

    query('page')
      .optional()
      .isInt().withMessage('Invalid page format')
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
  appProtectedController.getBookmarks
);

module.exports = router;