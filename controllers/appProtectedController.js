const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User');
const App = require('../models/App');
const he = require('he');

exports.updateFCMToken = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors);
        }
        const { fcm_token } = req.body;
        const userId = req.user.user_id;
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }
        const result = await App.updateUserFCMToken(userId, fcm_token);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update fcm token");
        }
        return sendJsonResponse(res, 200, "FCM token updated successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};

exports.updateE2EEPublicKey = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors);
        }
        const { e2ee_public_key, key_version } = req.body;
        const userId = req.user.user_id;
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }
        const result = await App.updateUserE2EEPublicKey(userId, he.decode(e2ee_public_key), he.decode(key_version));
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update e2ee public key");
        }
        return sendJsonResponse(res, 200, "E2EE public key updated successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};

exports.getBookmarks = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { user_id: userId } = req.params;
        if (userId != user_id) return sendErrorResponse(res, 400, "Access forbidden to bookmarks");
        const { page_size, next_token } = req.query;
        const queryNextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await App.getUserBookmarks(user_id, PAGE_SIZE, queryNextToken)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Bookmarks fetched successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};