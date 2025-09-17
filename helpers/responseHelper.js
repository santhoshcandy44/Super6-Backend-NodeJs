const { v4: uuidv4 } = require('uuid');
const { API_DOC_BASE_URL } = require('../config/config');

function sendJsonResponse(res, statusCode,message,data=null,isSuccessful = true) {
    res.status(statusCode).json({
        isSuccessful: isSuccessful,
        status: isSuccessful ? 'success' : 'error',
        message: message,
        data: data != null ? data : ''
    });
}
  
function sendErrorResponse(res, statusCode, message, errorDetails = null,  error_code='ERROR') {
    const errorResponse = {
        status: 'error',
        statusCode: statusCode,
        error: {
            code: error_code, 
            message: message,
            details: JSON.stringify(errorDetails),
            timestamp: new Date().toISOString(), 
            path: res.req.originalUrl 
        },
        requestId: uuidv4(), 
        documentation_url: `${API_DOC_BASE_URL}/docs/errors`
    };
    res.status(statusCode).json(
      {
        isSuccessful:false,
        status : "error",
        message: message,
        data: errorResponse,
      }
    );
}

module.exports = {
    sendErrorResponse,
    sendJsonResponse
};