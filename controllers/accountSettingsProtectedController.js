const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const { hashPassword, generatePepper, generateSalt } = require('../utils/authUtils');
const { sendOtpEmail } = require('../utils/authUtils');
const { ACCESS_TOKEN_SECRET } = require('../config/config');
const User = require('../models/User');

exports.changePassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id; 
        const { current_password, new_password } = req.body;
        const user = await User.findUserById(userId);
        if (!user) {
            return sendErrorResponse(res, 404, "User not exist");
        }
        const hashedPasswordAttempt = await hashPassword(user.pepper + current_password, user.salt);
        const isPasswordValid = hashedPasswordAttempt === user.hashed_password;
        if (!isPasswordValid) {
            return sendErrorResponse(res, 400, "Current password is incorrect");
        }
        const pepper = await generatePepper(); 
        const salt = await generateSalt(); 
        const hashedNewPassword = await hashPassword(pepper + new_password, salt);
        const result = await User.updatePasswordCredentials(userId, pepper, salt, hashedNewPassword);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to change password");
        }
        return sendJsonResponse(res, 200, 'Password is changed successfully');
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { email } = req.body;
        const existingUser = await User.findUserByEmail(email);
        if (!existingUser) {
            return sendErrorResponse(res, 409, 'Invalid user email'); 
        }
        const otp = Math.floor(100000 + Math.random() * 900000); 
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
        req.session.storedOtp = otp.toString(); 
        req.session.storedOtpExpires = otpExpires;
        req.session.storedEmail = email;
        const response = await sendOtpEmail(email, otp);
        if (!response.success) {
            return sendErrorResponse(res, 500, 'Failed to send OTP');
        }
        sendJsonResponse(res, 200, 'Email OTP has been sent');
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error" );
    }
};

exports.forgotPasswordVerifyOTP = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }
        const { otp } = req.body;
        const { storedOtp, storedOtpExpires, storedEmail } = req.session;
        if (!storedOtp || !storedOtpExpires) {
            return sendErrorResponse(res, 400, 'OTP not found or expired');
        }
        const isExpired = new Date() > new Date(storedOtpExpires);
        if (isExpired) {
            delete req.session.storedOtp;
            delete req.session.storedOtpExpires;
            return sendErrorResponse(res, 400, 'OTP has expired');
        }
        if (storedOtp !== otp) {
            return sendErrorResponse(res, 400, 'Invalid OTP');
        }
        const user = await User.findUserByEmail(storedEmail);
        if (!user) {
            return sendErrorResponse(res, 404, 'User not exist');
        }
        const userId = req.user.user_id;
        const email = user.email;
        const temporaryAccessToken = jwt.sign(
            { userId, email },
            ACCESS_TOKEN_SECRET,
            { expiresIn: '15m' } 
        );
        sendJsonResponse(res, 201, 'OTP verified successfully', {
            email: email,
            access_token: temporaryAccessToken,
        });
        delete req.session.storedOtp;
        delete req.session.otpExpires;
        delete req.session.storedEmail;
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array())

        }
        const {auth_token} = req.body;
        const token = auth_token && auth_token.split(' ')[1];
        if (!token) {
            return sendErrorResponse(res,401,"No valid token forbidden");
        }
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET);
        } catch (error) {
            return sendErrorResponse(res, 401, 'Invalid or expired/Timeout');
        }
        const { user_id, email } = req.user;
        const salt = await generateSalt();
        const pepper = await generatePepper();
        const hashedPassword = await hashPassword(pepper + req.body.password, salt);
        const user = await User.findUserById(user_id);
        if (!user) {
            return sendErrorResponse(res, 404, 'User not exist');
        }
        const result = await User.updatePasswordCredentials(user_id, pepper, salt, hashedPassword)
        if (!result) {
            return sendErrorResponse(res, 404, 'Error on updating password');
        }
        sendJsonResponse(res, 200, 'Password reset successfully');
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.updateAccountType = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { account_type } = req.body;
        const userId = req.user.user_id; 
        const result = await User.updateUserProfileAccountType(userId, account_type);
        if (!result) {
            return sendErrorResponse(res, 400, 'Error on switching account type');
        }   
        if(!result.success && !result.data){
            return sendErrorResponse(res, 400, result.message);
        }
        return sendJsonResponse(res, 200, 'Switched to ' + result.data.account_type + " acccount", {
            account_type: result.data.account_type,
            updated_at: result.data.updated_at
        });
    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }
};