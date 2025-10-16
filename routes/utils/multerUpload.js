const multer = require('multer');

function uploadSingle(fieldName, options = {}) {
  const upload = multer({
    limits: { fileSize: options.maxSize || 2 * 1024 * 1024 },
    fileFilter: options.fileFilter,
  }).single(fieldName);

  return function (req, res, next) {
    upload(req, res, (err) => {
      if (err) return next(err); 
      next();
    });
  };
}

function uploadMultiple(fieldName, maxCount = 5, options = {}) {
  const upload = multer({
    limits: { fileSize: options.maxSize || 2 * 1024 * 1024 },
    fileFilter: options.fileFilter,
  }).array(fieldName, maxCount);

  return function (req, res, next) {
    upload(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

function uploadFields(fields, options = {}) {
  const upload = multer({
    limits: { fileSize: options.maxSize || 2 * 1024 * 1024 },
    fileFilter: options.fileFilter,
  }).fields(fields);
  return function (req, res, next) {
    upload(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

module.exports = { uploadSingle, uploadMultiple, uploadFields };
