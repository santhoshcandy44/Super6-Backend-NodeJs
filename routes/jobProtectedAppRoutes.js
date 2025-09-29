const express = require('express');
const authenticateToken = require('../middlewares/authMiddleware');
const { body, param, query } = require('express-validator');
const jobsProtectedController = require('../controllers/jobsProtectedController');
const multer = require('multer');
const path = require('path');

const router = express.Router();

router.get('/job-listings',
  authenticateToken,
  [
    query('user_id')
      .optional()
      .isInt().withMessage('Invalid user id format'),

    query('page')
      .optional()
      .isInt().withMessage('Invalid page format'),

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

        // req.query.last_timestamp = decodedValue; 
        return true;
      })
      .isLength({ min: 19, max: 19 }).withMessage('Last Timestamp must be exactly 19 characters long in the format YYYY-MM-DD HH:MM:SS'),

    query('last_total_relevance')
      .optional()
      .isFloat().withMessage('Last total relevance must be a valid float format'),

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
  jobsProtectedController.getJobListingsForUser
);

router.post(
  '/bookmark-job',
  authenticateToken,
  [
    body('user_id')
      .isInt().withMessage('Invalid user id format'),
    body('local_job_id')
      .isInt().withMessage('Invalid local job id format')
  ],
  jobsProtectedController.bookmarkJob
);

router.post(
  '/remove-bookmark-job',
  authenticateToken,
  [
    body('user_id')
      .isInt().withMessage('Invalid user id format'),

    body('local_job_id')
      .isInt().withMessage('Invalid local job id format')
  ],
  jobsProtectedController.removeBookmarkJob
);

router.get('/job-search-location-suggestions/:user_id(\\d+)',
  authenticateToken,
  [
    param('user_id')
      .isInt().withMessage('Invalid user id format'),

    query('query')
      .isString().withMessage('Invalid user query format')
      .notEmpty().withMessage('Query cannot be empty'),
  ],
  jobsProtectedController.searchLocationSuggestions
);

router.get('/job-search-role-suggestions/:user_id(\\d+)',
  authenticateToken,
  [
    param('user_id')
      .isInt().withMessage('Invalid user id format'),

    query('query')
      .isString().withMessage('Invalid user query format')
      .notEmpty().withMessage('Query cannot be empty'),
  ],
  jobsProtectedController.searchRoleSuggestions
);

router.post(
  '/apply-job',
  authenticateToken,
  [
    body('user_id')
      .isInt().withMessage('Invalid user id format'),
    body('job_id')
      .isInt().withMessage('Invalid job id format')
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
  [
    body('first_name')
      .trim()
      .notEmpty().withMessage('First name is required')
      .isLength({ min: 1 }).withMessage('First name must be at least 2 characters'),

    body('last_name')
      .trim()
      .notEmpty().withMessage('Last name is required')
      .isLength({ min: 1 }).withMessage('Last name must be at least 2 characters'),

    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Must be a valid email'),

    body('gender')
      .notEmpty().withMessage('Gender is required')
      .isIn(['Male', 'Female', 'Other']).withMessage('Gender must be male, female, or other'),

    body('intro')
      .trim()
      .notEmpty().withMessage('Intro is required')
      .isLength({ min: 10, max: 300 }).withMessage('Intro must be min 10 and max 300 characters')
  ],
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

    body('*.currently_studying')
      .isBoolean()
      .withMessage('Currently studying must be a boolean.'),

    body('*.end_year')
      .optional()
      .isInt()
      .withMessage('End year must be a valid year.'),

    body('*.grade')
      .optional()
      .isFloat()
      .withMessage('Grade ust be float'),

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
    body()
      .isArray({ min: 1, max: 5 })
      .withMessage('Expected an array of experiences (min 1 and max 5 allowed).'),

    body('*.experienced')
      .isBoolean()
      .withMessage('experienced must be a boolean.'),

    body('*.job_title')
      .notEmpty()
      .withMessage('job_title is required.'),

    body('*.employment_type')
      .notEmpty()
      .withMessage('employment_type is required.'),

    body('*.company_name')
      .notEmpty()
      .withMessage('company_name is required.'),

    body('*.is_current_job')
      .isBoolean()
      .withMessage('is_current_job must be a boolean.'),

    body('*.start_date')
      .isInt()
      .withMessage('start_date must be an integer.'),

    body('*.end_date')
      .optional()
      .isInt()
      .withMessage('end date must be an integer.'),

    body('*.location')
      .notEmpty()
      .withMessage('location is required.'),


    body().custom((experienceList) => {
      for (let i = 0; i < experienceList.length; i++) {
        const exp = experienceList[i];
        const isCurrent = Boolean(exp.is_current_job);
        const startDate = exp.start_date;
        const endDate = exp.end_date !== undefined && exp.end_date !== null ? exp.end_date : null;

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
  authenticateToken,
  jobsProtectedController.updateNoExperience
);

router.post(
  '/update-applicant-skill',
  authenticateToken,
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
    body()
      .isArray({ min: 1 })
      .withMessage('Languages list cannot be empty.'),

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

const resumeFileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only .pdf, .doc, and .docx files are allowed'));
  }
};

router.post(
  '/update-applicant-resume',
  authenticateToken,
  multer({
    limits: {
      fileSize: 2 * 1024 * 1024,
    },
    fileFilter: resumeFileFilter
  }).single('resume'),

  body('resume')
    .custom((value, { req }) => {
      if (!req.file || req.file.length === 0) {
        throw new Error('Resume file is required');
      }
      return true;
    }),
  jobsProtectedController.updateResume
);


const certificatesFileFilter = (req, file, cb) => {
  const allowedTypes = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only .jpg, .jpeg, and .png files are allowed'));
  }
};

const certificatesUpload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: certificatesFileFilter
});

router.post(
  '/update-applicant-certificate',
  authenticateToken,
  certificatesUpload.any(),

  body('applicantCertificateInfo')
    .customSanitizer((value) => {
      try {
        return JSON.parse(value);
      } catch (err) {
        return null
      }
    }),

  body('applicantCertificateInfo')
    .isArray({ min: 1, max: 5 })
    .withMessage('Certificates must be an array with at least one item and max five items.'),

  body('applicantCertificateInfo.*.id')
    .notEmpty().withMessage('Certificate id is required')
    .isInt().withMessage('Certificate id must be a number'),

  body('applicantCertificateInfo.*.issued_by')
    .notEmpty().withMessage('issued_by is required')
    .isString().withMessage('issued_by must be a string'),

  body('applicantCertificateInfo.*.file_name')
    .notEmpty().withMessage('file_name is required')
    .isString().withMessage('file_name must be a string'),

  body('applicantCertificateInfo.*.file_size')
    .notEmpty().withMessage('file_size is required')
    .isInt({ min: 1 }).withMessage('file_size must be a positive number'),

  body('applicantCertificateInfo.*.type')
    .notEmpty().withMessage('type is required')
    .isString().withMessage('type must be a string'),

  body('applicantCertificateInfo.*.image')
    .optional(),
  (req, res, next) => {
    req.files = req.files.filter(file =>
      /^certificates-new-\d+$/.test(file.fieldname)
    );
    next();
  },
  jobsProtectedController.updateCertificate
);

module.exports = router;