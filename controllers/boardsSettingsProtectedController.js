const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User'); // Assuming this is the user model
const BoardsModel = require('../models/Boards'); // Assuming this is the user model

// Update user industries
exports.getBoards = async (req, res) => {

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
        const boards = await BoardsModel.getBoards(userIdProtected);
        return sendJsonResponse(res, 200, "Boards retrived successfully", boards);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error);

    }

};


exports.getGuestBoards = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, "User id is required", errors.array());
        }

        const { user_id } = req.query; // Extract user_id from query parameters
        
        // Update user industries
        const boards = await BoardsModel.getGuestBoards();
        return sendJsonResponse(res, 200, "Boards retrived successfully", boards);

    } catch (error) {

        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error);

    }

};


// Update user industries
exports.updateBoards = async (req, res) => {

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


        const boardsArray = JSON.parse(req.body.boards); // Parse JSON string


        // Check if the user exists
        const userExists = await User.findUserById(userIdProtected);
        
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        // Update user industries
        const boards = await BoardsModel.updateBoards(user_id, boardsArray);


        return sendJsonResponse(res, 200, "Boards updated successfully", boards);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error);
    }


};
