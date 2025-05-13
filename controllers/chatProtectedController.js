const { sendErrorResponse, sendJsonResponse } = require('../helpers/responseHelper')
const { validationResult } = require('express-validator');
const User = require('../models/User'); // Assuming this is the user model
const {PROFILE_BASE_URL} = require('../config/config')


exports.chatUserProfile = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const userId = req.params.user_id;

        const result = await User.getUserProfile(userId);

        if (!result) {
            return sendErrorResponse(res, 400, "User not exist");
        }

        const date = new Date(result.created_at);
        // Extract the year
        const createdAtYear = date.getFullYear().toString();


        console.log(PROFILE_BASE_URL+result.profile_pic_url_96x96);

        return sendJsonResponse(res, 200, "Profile is fetched successfully", {
            user_id: userId,
            first_name: result.first_name, // User's first name
            last_name: result.last_name, // User's last name (corrected to access from the first result)
            about: result.about,
            email: result.email, // User's email address
            is_email_verified: Boolean(result.is_email_verified),
            profile_pic_url: PROFILE_BASE_URL+result.profile_pic_url, // URL to the user's profile picture (if applicable)
            profile_pic_url_96x96: PROFILE_BASE_URL+result.profile_pic_url_96x96,
            account_type: result.account_type,
            location: {
                latitude: result.latitude,
                longitude: result.longitude,
                geo: result.geo,
                location_type: result.location_type,
                updated_at: result.updated_at,
            },
            created_at: createdAtYear, // Date when the user was created
            updated_at: result.updated_at, // Date when the user details were last updated
            // Add any other relevant fields here
        })
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error");
    }

};