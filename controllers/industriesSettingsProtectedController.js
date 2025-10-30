const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User'); 
const IndustriesModel = require('../models/Industries');

exports.getIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userIdProtected = req.user.user_id;
        const userExists = await User.findUserById(userIdProtected);
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const industries = await IndustriesModel.getIndustries(userIdProtected);
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};

exports.getGuestIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, "User id is required", errors.array());
        }
        const industries = await IndustriesModel.getGuestIndustries();
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};

exports.updateIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }
        const user_id = req.user.user_id;
        const industriesArray = JSON.parse(req.body.industries); 
        const userExists = await User.findUserById(user_id);
                if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const industries = await IndustriesModel.updateIndustries(user_id, industriesArray);
        return sendJsonResponse(res, 200, "Industries updated successfully", industries);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error);
    }
};