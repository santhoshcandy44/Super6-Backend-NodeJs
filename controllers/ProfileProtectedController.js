const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const sharp = require('sharp');
const User = require('../models/User');
const UserLocation = require('../models/UserLocation');
const { uploadToS3 } = require("../config/awsS3.js")
const { PROFILE_BASE_URL } = require('../config/config');
const { sendOtpEmail, generateTokens, generateShortEncryptedUrl } = require('../utils/authUtils');
const App = require('../models/App');

exports.getUserProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.params.user_id;
        const result = await User.getUserProfile(userId);
        if (!result) {
            return sendErrorResponse(res, 400, "User not exist");
        }
        const date = new Date(result.created_at);
        const createdAtYear = date.getFullYear().toString();
        return sendJsonResponse(res, 200, "OK", {
            user_id: userId,
            first_name: result.first_name,
            last_name: result.last_name,
            about: result.about,
            email: result.email,
            is_email_verified: Boolean(result.is_email_verified),
            phone_country_code: result.phone_country_code,
            phone_number: result.phone_number,
            is_phone_verified: !!result.is_phone_verified,
            profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
            profile_pic_url_96x96: PROFILE_BASE_URL + "/" + result.profile_pic_url_96x96,
            account_type: result.account_type,
            location: result.latitude == null || result.longitude == null ? null : {
                latitude: result.latitude,
                longitude: result.longitude,
                geo: result.geo,
                location_type: result.location_type,
                updated_at: result.updated_at,
            },
            created_at: createdAtYear,
            updated_at: result.profile_updated_at,
        })
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.updateFirstName = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { first_name } = req.body;
        const userId = req.user.user_id;
        const result = await User.updateUserProfileFirstName(userId, first_name);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update first name");
        }
        return sendJsonResponse(res, 200, "First name updated successfully", {
            first_name: result.first_name,
            updated_at: result.updated_at
        })
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.updateLastName = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { last_name } = req.body;
        const userId = req.user.user_id; 
        const result = await User.updateUserProfileLastName(userId, last_name);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update last name");
        }
        return sendJsonResponse(res, 200, "Last name updated successfully", {
            last_name: result.last_name,
            updated_at: result.updated_at
        })
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }
};

exports.updateAbout = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { about } = req.body;
        const userId = req.user.user_id; 
        const result = await User.updateUserProfileAbout(userId, about);
        if (!result) {
            return sendErrorResponse(res, 400, 'Error on updating about');
        }
        return sendJsonResponse(res, 200, 'About updated successfully', {
            about: result.about,
            updated_at: result.updated_at
        });
    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal server error', error);
    }
};

exports.updateProfilePic = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        if (!req.file) {
            return sendErrorResponse(res, 400, 'No image file has been uploaded');
        }
        const compressedImageBuffer = await sharp(req.file.buffer)
            .resize(512, 512)
            .jpeg({ quality: 80 })
            .toBuffer();
        const image96by96 = await sharp(req.file.buffer)
            .resize(96, 96)
            .toBuffer();
        const userId = req.user.user_id;
        const result = await User.getUserMedia(userId);
        if (!result) {
            return sendErrorResponse(res, 404, 'User not exist');
        }
        const mediaId = result.media_id;
        const filenameOriginal = `profile-pic-${userId}.jpeg`;
        const filename96by96 = `profile-pic-${userId}-96x96.jpeg`;
        const filenameOriginalS3Key = `media/${mediaId}/profile-pic/${filenameOriginal}`;
        const filename96by96S3Key = `media/${mediaId}/profile-pic/${filename96by96}`;
        await uploadToS3(compressedImageBuffer, filenameOriginalS3Key, 'image/jpeg');
        await uploadToS3(image96by96, filename96by96S3Key, 'image/jpeg');
        const profilePicUrl = generateShortEncryptedUrl(filenameOriginalS3Key);
        const profilePicUrl96by96 = generateShortEncryptedUrl(filename96by96S3Key);
        const updatedProfilePicResult = await User.updateProfilePic(userId, profilePicUrl, profilePicUrl96by96);
        if (!updatedProfilePicResult) {
            return sendErrorResponse(res, 400, 'Failed to update profile pic');
        }
        return sendJsonResponse(res, 200, 'Profile pic uploaded successfully', {
            profile_pic_url: PROFILE_BASE_URL + "/" + updatedProfilePicResult.profile_pic_url,
            profile_pic_url_96by96: PROFILE_BASE_URL + "/" + profilePicUrl96by96,
            updated_at: updatedProfilePicResult.updated_at
        });
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }
};

exports.updateEmail = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }
        const userId = req.user.user_id
        const { email } = req.body;
        const existingUser = await User.findUserByEmail(email);
        if (existingUser) {
            return sendErrorResponse(res, 409, 'Email already in use');
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
        req.session.storedOtp = otp.toString();
        req.session.storedOtpExpires = otpExpires;
        req.session.storedEmail = email;
        const emailResponse = await sendOtpEmail(email, otp);
        if (!emailResponse.success) {
            return sendErrorResponse(res, 500, 'Failed to send email');
        }
        sendJsonResponse(res, 200, 'Email OTP has been sent');
    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }
};

exports.updateEmailVerifyOTP = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, 'OTP field is required', errors.array());
        }
        const userId = req.user.user_id;
        const user = User.findUserById(userId);
        if (!user) {
            return sendErrorResponse(res, 403, 'User not found');
        }
        const { otp, email } = req.body; // Extract OTP from the request body
        const { storedOtp, storedOtpExpires, storedEmail } = req.session;
        if (!storedOtp || !storedOtpExpires) {
            return sendErrorResponse(res, 400, 'OTP not found or expired');
        }
        const isExpired = new Date() > new Date(storedOtpExpires);
        if (isExpired) {
            delete req.session.storedOtp;
            delete req.session.storedOtpExpires;
            delete req.session.storedEmail;
            return sendErrorResponse(res, 400, 'OTP has expired');
        }
        if (storedOtp !== otp) {
            return sendErrorResponse(res, 400, 'Invalid OTP');
        }
        const userResult = await User.updateUserProfileEmail(userId, storedEmail);
        if (!userResult) {
            return sendErrorResponse(res, 400, 'Failed to update email');
        }
        const { accessToken, refreshToken } = generateTokens(user.userId);
        sendJsonResponse(res, 200, 'Email is updated successfully', {
            user_id: userResult.user_id,
            email: userResult.email,
            access_token: accessToken,
            refresh_token: refreshToken,
            updated_at: userResult.updated_at
        });
        delete req.session.storedOtp;
        delete req.session.otpExpires;
        delete req.session.storedEmail;
    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }
};

exports.updateLocation = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;
        const locationType = req.body.location_type;
        const geo = req.body.geo;
        const userId = req.user.user_id;
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not found");
        }
        const locationResult = await UserLocation.updateUserLocation(userId, latitude, longitude, locationType, geo);
        if (!locationResult) {
            return sendErrorResponse(res, 400, "Faield to update location");
        }
        return sendJsonResponse(res, 200, "Location updated successfully", {
            location_type: locationResult.location_type,
            latitude: locationResult.latitude,
            longitude: locationResult.longitude,
            geo: locationResult.geo,
            updated_at: locationResult.updated_at
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};

exports.logOut = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }
        const deactivatedResult = await User.userAsDeactivated(userId);
        if (!deactivatedResult) {
            return sendErrorResponse(res, 404, "Fauied to deactivate account");
        }
        const result = await App.invalidateUserFCMToken(userId, null);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update fcm token");
        }
        return sendJsonResponse(res, 200, "Logged out successfully");
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
    }
};