const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware'); // Import the auth middleware
// Import the controller
const jobsProtectedController = require('../controllers/jobsProtectedController');
const { body, param, query } = require('express-validator');
const multer = require('multer');

const path = require('path');
const { sendErrorResponse } = require('../helpers/responseHelper');


router.get('/job-listings', // This ensures that user_id is a number
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
      .isFloat().withMessage('Last total relevance must be a valid float format'), // Ensures it's a string

    query('work_modes')
      .optional()
      .isString().withMessage('Work modes must be a comma-separated string')
      .customSanitizer(value => value.split(',').map(mode => mode.trim())),

    query('salary_min')
      .optional()
      .isInt({ min: -1 }).withMessage('Salary min must be a number or -1'),

    query('salary_max')
      .optional()
      .isInt({ min: -1 }).withMessage('Salary max must be a number or -1')


  ],
  jobsProtectedController.getJobListingsForUser // Controller function to load user profile
);

router.post(
  '/apply-job',
  authenticateToken,
  [
      body('user_id')
          .isInt().withMessage('Invalid user id format'),
      body('job_id')
          .isInt().withMessage('Invalid job id format'),

  ],
  jobsProtectedController.applyJob
);

router.get(
  '/applicant-profile/:user_id(\\d+)', 
  authenticateToken, 
  [
    param('user_id')
      .isInt().withMessage('User ID must be a valid integer'),
  ],
  jobsProtectedController.getApplicantProfile
);

const profilePicFileFilter = (req, file, cb) => {
  const allowedTypes = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only .jpg, .jpeg, and .png files are allowed'));
  }
};

router.post(
  '/update-applicant-profile',
  authenticateToken,
  multer({
    limits: {
      fileSize: 2 * 1024 * 1024,
    },
    fileFilter: profilePicFileFilter
  }).single('profile_pic'),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      let message = 'Upload error';
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = 'File too large. Max size is 2MB.';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = err.message;
      }
      return sendErrorResponse(res, 400, message)
    }
    next(err);
  },
  jobsProtectedController.updateProfile
);

router.post(
  '/update-applicant-education',
  authenticateToken,
  [
    body()
      .isArray({ min: 1, max: 3 })
      .withMessage('At least one education is required. (Max 3)'),

    body('*.institution')
      .notEmpty()
      .withMessage('Institution is required.'),

    body('*.field_of_study')
      .notEmpty()
      .withMessage('Field of study is required.'),

    body('*.start_year')
      .isInt()
      .withMessage('Start year must be a valid year.'),

    body().custom((educationList) => {
      for (const edu of educationList) {
        const currentlyStudying = Boolean(edu.currently_studying);
        if (currentlyStudying) {
          if (edu.end_year !== null && edu.end_year !== 0) {
            throw new Error('If currently studying, end_year must be null or 0.');
          }
          if (edu.grade !== null && edu.grade !== 0.0) {
            throw new Error('If currently studying, grade must be null or 0.');
          }
        } else {
          if (!edu.end_year || edu.end_year === 0) {
            throw new Error('If not currently studying, end_year must be provided.');
          }
          if (edu.end_year <= edu.start_year) {
            throw new Error('End year must be greater than the start year.');
          }
          if (edu.grade === null || edu.grade === undefined) {
            throw new Error('If not currently studying, grade must be provided.');
          }
        }
      }
      return true;
    })
  ],
  jobsProtectedController.updateEducation
);

router.post(
  '/update-applicant-experience',
  authenticateToken,
  [
    // 1. Validate that body is an array (max 5 entries)
    body()
      .isArray({ min: 1, max: 5 })
      .withMessage('Expected an array of experiences (min 1 and max 5 allowed).'),

    // 2. Required fields per item
    body('*.company_name')
      .notEmpty()
      .withMessage('company_name is required.'),

    body('*.job_title')
      .notEmpty()
      .withMessage('job_title is required.'),

    body('*.employment_type')
      .notEmpty()
      .withMessage('employment_type is required.'),

    body('*.location')
      .notEmpty()
      .withMessage('location is required.'),

    body('*.start_date')
      .isInt()
      .withMessage('start_date must be an integer.'),

    body('*.is_current_job')
      .isBoolean()
      .withMessage('is_current_job must be a boolean.'),

    body('*.experienced')
      .isBoolean()
      .withMessage('experienced must be a boolean.'),

    // 3. Custom cross-field validations
    body().custom((experienceList) => {
      for (let i = 0; i < experienceList.length; i++) {
        const exp = experienceList[i];
        const isCurrent = Boolean(exp.is_current_job);
        const startDate = exp.start_date;
        const endDate = exp.end_date !== undefined && exp.end_date !== null ? exp.end_date : null;

        // Rule: experienced must be true
        if (exp.experienced !== true) {
          throw new Error(`"experienced" must be true at index ${i}.`);
        }

        if (!isCurrent) {
          if (endDate === null) {
            throw new Error(`If not current job, "end_date" is required at index ${i}.`);
          }
          if (endDate <= startDate) {
            throw new Error(`"end_date" must be greater than "start_date" at index ${i}.`);
          }
        }
      }
      return true;
    })
  ],

  jobsProtectedController.updateExperience
);

router.post(
  '/update-applicant-no-experience',
  authenticateToken, // Ensure the user is authenticated
  jobsProtectedController.updateNoExperience // Proceed to the controller
);

router.post(
  '/update-applicant-skill',
  authenticateToken, // Ensure the user is authenticated
  jobsProtectedController.updateSkill
);

const VALID_LANGUAGES = new Map([
  ["en", "English"], ["es", "Spanish"], ["zh", "Mandarin Chinese"], ["hi", "Hindi"],
  ["ar", "Arabic"], ["bn", "Bengali"], ["pt", "Portuguese"], ["ru", "Russian"],
  ["ja", "Japanese"], ["pa", "Punjabi"], ["de", "German"], ["jv", "Javanese"],
  ["ko", "Korean"], ["fr", "French"], ["tr", "Turkish"], ["vi", "Vietnamese"],
  ["it", "Italian"], ["mr", "Marathi"], ["ur", "Urdu"], ["te", "Telugu"],
  ["ta", "Tamil"], ["gu", "Gujarati"], ["pl", "Polish"], ["uk", "Ukrainian"],
  ["ml", "Malayalam"], ["kn", "Kannada"], ["or", "Oriya (Odia)"], ["th", "Thai"],
  ["nl", "Dutch"], ["el", "Greek"], ["sv", "Swedish"], ["ro", "Romanian"],
  ["hu", "Hungarian"], ["cs", "Czech"], ["he", "Hebrew"], ["fa", "Persian (Farsi)"],
  ["ms", "Malay"], ["my", "Burmese"], ["am", "Amharic"], ["sr", "Serbian"],
  ["fi", "Finnish"], ["no", "Norwegian"], ["sk", "Slovak"], ["hr", "Croatian"],
  ["zu", "Zulu"], ["xh", "Xhosa"], ["af", "Afrikaans"], ["sw", "Swahili"],
  ["ne", "Nepali"], ["si", "Sinhala"]
]);

const VALID_PROFICIENCIES = new Map([
  ["fluent", "Fluent"],
  ["basic", "Basic"],
  ["intermediate", "Intermediate"]
]);

router.post(
  '/update-applicant-language',
  authenticateToken,

  [
    // 1. Ensure it's a non-empty array
    body()
      .isArray({ min: 1 })
      .withMessage('Languages list cannot be empty.'),

    // 2. Validate structure of each language item
    body('*.language')
      .isObject()
      .withMessage('Language must be an object.'),

    body('*.language.name')
      .isString()
      .withMessage('Language name must be a string.'),

    body('*.language.code')
      .isString()
      .withMessage('Language code must be a string.'),

    body('*.proficiency')
      .isObject()
      .withMessage('Proficiency must be an object.'),

    body('*.proficiency.name')
      .isString()
      .withMessage('Proficiency name must be a string.'),

    body('*.proficiency.value')
      .isString()
      .withMessage('Proficiency value must be a string.'),

    // 3. Custom validation for value-name matching
    body().custom((langArray) => {
      langArray.forEach((entry, index) => {
        const { language, proficiency } = entry;

        if (!VALID_LANGUAGES.has(language.code) || VALID_LANGUAGES.get(language.code) !== language.name) {
          throw new Error(`Entry ${index + 1}: Invalid language code-name combination.`);
        }

        if (!VALID_PROFICIENCIES.has(proficiency.value) || VALID_PROFICIENCIES.get(proficiency.value) !== proficiency.name) {
          throw new Error(`Entry ${index + 1}: Invalid proficiency value-name combination.`);
        }
      });
      return true;
    })
  ],


  jobsProtectedController.updateLanguage
);

router.post(
  '/update-applicant-language',
  authenticateToken, // Ensure the user is authenticated
  jobsProtectedController.updateLanguage
);

// 🔹 Keep this outside as requested
const resumeFileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only .pdf, .doc, and .docx files are allowed'));
  }
};

// 🔹 Route
router.post(
  '/update-applicant-resume',
  authenticateToken,
  multer({
    limits: {
      fileSize: 2 * 1024 * 1024, // ✅ 2MB limit
    },
    fileFilter: resumeFileFilter
  }).single('resume'),

  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      let message = 'Upload error';
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = 'File too large. Max size is 2MB.';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = err.message;
      }
      return sendErrorResponse(res, 400, message)
    }
    next(err);
  },
  (req, res, next) => {
    if (!req.file) {
      return sendErrorResponse(res, 404, message)
    }
    next();
  },
  jobsProtectedController.updateResume
);


// 🔹 Keep this outside as requested
const certificatesFileFilter = (req, file, cb) => {
  const allowedTypes = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only .jpg, .jpeg, and .png files are allowed'));
  }
};

// 🔹 Multer upload instance
const certificatesUpload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: certificatesFileFilter
});

router.post(
  '/update-applicant-certificate',
  authenticateToken,
  certificatesUpload.any(),
  (req, res, next) => {
    // Filter files to only allow certificates-new, certificates-1, etc.
    req.files = req.files.filter(file =>
      /^certificates-(new|\d+)$/.test(file.fieldname)
    );
    next();
  },
  jobsProtectedController.updateCertificate
);

// 🔹 Global Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'Upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large. Max size is 2MB.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = err.message;
    }
    return sendErrorResponse(res, 400, message);
  }

  next(err);
});


module.exports = router;