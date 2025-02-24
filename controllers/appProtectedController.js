const { validationResult } = require('express-validator');
const {sendJsonResponse,sendErrorResponse} =require('../helpers/responseHelper');
const User = require('../models/User'); // Assuming this is the user model
const App = require('../models/App'); // Assuming this is the user model

const he = require('he');

// Update FCM token
exports.updateFCMToken = async (req, res) => {
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return sendErrorResponse(res, 400, "FCM token is required", errors);
    }

    const { fcm_token } = req.body; // Extract FCM token from the request body
    const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user



    try {
        // Check if the user exists
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }

        // Update the FCM token in the database
        const result= await App.updateUserFCMToken(userId, fcm_token);
        if(!result){
            return sendErrorResponse(res, 400, "Failed to update fcm token");
        }

        return sendJsonResponse(res, 200, "FCM token updated successfully");

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};


exports.updateE2EEPublicKey = async (req, res) => {
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return sendErrorResponse(res, 400, "FCM token is required", errors);
    }

    const { e2ee_public_key, key_version } = req.body; // Extract FCM token from the request body
    const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

    

    try {
        // Check if the user exists
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }

        // Update the FCM token in the database
        const result= await App.updateUserE2EEPublicKey(userId, he.decode(e2ee_public_key), he.decode(key_version));
        if(!result){
            return sendErrorResponse(res, 400, "Failed to update e2ee public key");
        }

        return sendJsonResponse(res, 200, "E2EE public key updated successfully");

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};


exports.getBookmarks = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }
        const user_id = req.user.user_id; // This will contain the uploaded images


        const result = await App.getUserBookmarks(user_id)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Bookmarks fetched successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }

};








