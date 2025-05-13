const jwt = require('jsonwebtoken');
const { hashPassword, generatePepper, generateSalt, generateTokens } = require('../utils/authUtils');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const { validationResult } = require('express-validator');
const User = require('../models/User'); // Import the User model
const { sendOtpEmail } = require('../utils/authUtils');
const { ACCESS_TOKEN_SECRET } = require('../config/config');

exports.changePassword = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return the first error
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const userId = req.user.user_id;  // Assuming userId is coming from an authenticated JWT token

        // Extract the new and current passwords from the request body
        const { current_password, new_password } = req.body;

        // Find the user by userId
        const user = await User.findUserById(userId);

        if (!user) {
            return sendErrorResponse(res, 404, "User not exist");
        }

        // Combine the stored pepper with the input current password and hash it for comparison
        const hashedPasswordAttempt = await hashPassword(user.pepper + current_password, user.salt);

        // Compare the hashed password with the stored hashed password
        const isPasswordValid = hashedPasswordAttempt === user.hashed_password;

        if (!isPasswordValid) {
            return sendErrorResponse(res, 400, "Current password is incorrect");
        }

        // Generate a new pepper (stored separately in the database) and new salt
        const pepper = await generatePepper();  // New random pepper
        const salt = await generateSalt();  // Bcrypt salt (10 rounds)

        // Hash the new password with the new pepper and salt
        const hashedNewPassword = await hashPassword(pepper + new_password, salt);


        const result = await User.updatePasswordCredentials(userId, pepper, salt, hashedNewPassword);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to change password");
        }
        // Respond with success
        return sendJsonResponse(res, 200, 'Password is changed successfully');
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }

};

exports.forgotPassword = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const { email } = req.body;

        // Check if user already exists
        const existingUser = await User.findUserByEmail(email);

        if (!existingUser) {
            return sendErrorResponse(res, 409, 'Invalid user email'); // 409 Conflict
        }

        // Generate a random 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000); // Generates a number between 100000 and 999999
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration

        // Store the OTP and its expiration in the session
        req.session.storedOtp = otp.toString(); // Store OTP as string if necessary
        req.session.storedOtpExpires = otpExpires; // Store expiration time
        req.session.storedEmail = email;
        // Send OTP email
        const emailResponse = await sendOtpEmail(email, otp);

        if (!emailResponse.success) {
            return sendErrorResponse(res, 500, 'Failed to send OTP');
        }
        // Respond to the client with common response format
        sendJsonResponse(res, 200, 'Email OTP has been sent'); // 200 OK

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error" );
    }

};



exports.forgotPasswordVerifyOTP = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {

            // Return the first error
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array())

        }

        const { otp } = req.body; // Extract OTP from the request body


        // Check if the OTP exists in the session and hasn't expired
        const { storedOtp, storedOtpExpires, storedEmail } = req.session;

        if (!storedOtp || !storedOtpExpires) {
            return sendErrorResponse(res, 400, 'OTP not found or expired');
        }

        // Check if the OTP has expired
        const isExpired = new Date() > new Date(storedOtpExpires);
        if (isExpired) {
            // Optionally, you can delete the OTP from the session here
            delete req.session.storedOtp;
            delete req.session.storedOtpExpires;
            return sendErrorResponse(res, 400, 'OTP has expired');
        }
        // Check if the OTP is correct
        if (storedOtp !== otp) {
            return sendErrorResponse(res, 400, 'Invalid OTP');
        }
        // Assuming you have a function to find users by email
        const user = await User.findUserByEmail(storedEmail);

        if (!user) {
            return sendErrorResponse(res, 404, 'User not exist');
        }
        const userId = req.user.user_id;
        const email = user.email;

        // Generate a temporary token for password reset (valid for 15 minutes)
        const temporaryAccessToken = jwt.sign(
            { userId, email },
            ACCESS_TOKEN_SECRET,
            { expiresIn: '15m' } // 15 minutes expiration
        );


        // Respond with success and provide the temporary access token
        sendJsonResponse(res, 201, 'OTP verified successfully', {
            email: email,
            access_token: temporaryAccessToken,
        });


        // Optionally clear the OTP from the session once it’s successfully verified
        delete req.session.storedOtp;
        delete req.session.otpExpires;
        delete req.session.storedEmail;
    } catch (error) {
        console.log(error);

        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.resetPassword = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return the first error
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array())

        }

        // Read the token from the Authorization header
        const {auth_token} = req.body;


        const token = auth_token && auth_token.split(' ')[1];
    
        if (!token) {
            return sendErrorResponse(res,401,"No valid token forbidden"); // Token is invalid, forbidden 
        }


        //Verify the JWT token
        let decodedToken;

        try {
            decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET); // Decode the token
        } catch (error) {

            return sendErrorResponse(res, 401, 'Invalid or expired/Timeout');
        }

        const { user_id, email } = req.user;

        // Hash the new password before storing it
        const salt = await generateSalt();

        const pepper = await generatePepper(); // Generates a random 16-byte salt

        const hashedPassword = await hashPassword(pepper + req.body.password, salt); // Hash the password with a salt of 10 rounds

        // Assuming you have a function to update the password in your database
        const user = await User.findUserById(user_id);

        if (!user) {
            return sendErrorResponse(res, 404, 'User not exist');
        }

        const result = await User.updatePasswordCredentials(user_id, pepper, salt, hashedPassword)

        if (!result) {
            return sendErrorResponse(res, 404, 'Error on updating password');
        }
        // Respond with success
        sendJsonResponse(res, 200, 'Password reset successfully');
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }

};

exports.updateAccountType = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const { account_type } = req.body;
        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user
        // Update the about field in the database
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

        console.log(error);
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }


};

