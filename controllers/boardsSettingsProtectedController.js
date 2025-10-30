const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User');
const BoardsModel = require('../models/Boards'); 

exports.getBoards = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const boards = await BoardsModel.getBoards(userId);
        return sendJsonResponse(res, 200, "Boards retrived successfully", boards);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};

exports.getGuestBoards = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const boards = await BoardsModel.getGuestBoards();
        return sendJsonResponse(res, 200, "Boards retrived successfully", boards);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};

exports.updateBoards = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }
        const userId = req.user.user_id;
        const boardsArray = JSON.parse(req.body.boards);
        const userExists = await User.findUserById(userId);        
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const boards = await BoardsModel.updateBoards(userId, boardsArray);
        return sendJsonResponse(res, 200, "Boards updated successfully", boards);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};