const { v4: uuidv4 } = require('uuid'); // CommonJS syntax
const { API_DOC_BASE_URL } = require('../config/config');
// Utility function to send a common JSON response
function sendJsonResponse(res, statusCode,message,data=null,isSuccessful = true) {


    res.status(statusCode).json({
        isSuccessful: isSuccessful,
        status: isSuccessful ? 'success' : 'error',
        message: message,
        data: data != null ? JSON.stringify(data) : "",

    });
}
  
  
  // Error response function
function sendErrorResponse(res, statusCode, message, errorDetails = null,  error_code='ERROR') {
    const errorResponse = {
        status: 'error',
        statusCode: statusCode,
        error: {
            code: error_code, // Customize error code as needed
            message: message,
            details: JSON.stringify(errorDetails), // Additional error details if available
            timestamp: new Date().toISOString(), // Current timestamp in ISO 8601 format
            path: res.req.originalUrl // Current request URI
        },
        requestId: uuidv4(), // Unique ID for tracking the request
        documentation_url: `${API_DOC_BASE_URL}/docs/errors` // Link to API documentation
    };

  
  
    res.status(statusCode).json(
      {
        isSuccessful:false,
        data: errorResponse,
        status : "error",
        message: message, // More specific error message
      }
    );
}

module.exports = {
    sendErrorResponse,
    sendJsonResponse
};