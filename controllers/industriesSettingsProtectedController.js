const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User'); // Assuming this is the user model
const IndustriesModel = require('../models/Industries'); // Assuming this is the user model

// Update user industries
exports.getIndustries = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, "User id is required", errors.array());
        }

        const { user_id } = req.query; // Extract user_id from query parameters

        const userIdProtected = req.user.user_id; // Extract user_id from query parameters

        // Check if the user exists
        const userExists = await User.findUserById(userIdProtected);
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        // Update user industries
        const industries = await IndustriesModel.getIndustries(userIdProtected);
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);

    }

};


exports.getGuestIndustries = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, "User id is required", errors.array());
        }

        const { user_id } = req.query; // Extract user_id from query parameters
        
        // Update user industries
        const industries = await IndustriesModel.getGuestIndustries();
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);

    } catch (error) {

        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error);

    }

};


// Update user industries
exports.updateIndustries = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return the first error
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }

        const {user_id} = req.body;

        const userIdProtected = req.user.user_id; // Extract user_id from query parameters

        const industriesArray = JSON.parse(req.body.industries); // Parse JSON string

        // Check if the user exists
        const userExists = await User.findUserById(userIdProtected);
        
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        // Update user industries
        const industries = await IndustriesModel.updateIndustries(user_id, industriesArray);
        return sendJsonResponse(res, 200, "Industries updated successfully", industries);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);

    }


};
