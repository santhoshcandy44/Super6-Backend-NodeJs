
const sharp = require('sharp'); // Import sharp for image processing

const { validationResult } = require('express-validator');
const User = require('../models/User'); // Assuming this is the user model
const UserLocation = require('../models/UserLocation');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const { PROFILE_BASE_URL, S3_BUCKET_NAME } = require('../config/config');
const { sendOtpEmail, generateTokens, generateShortEncryptedUrl } = require('../utils/authUtils');
const App = require('../models/App');

const { awsS3Bucket } = require("../config/awsS3.js")

exports.getUserProfile = async (req, res) => {

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


        return sendJsonResponse(res, 200, "Profile is fetched successfully", {
            user_id: userId,
            first_name: result.first_name, // User's first name
            last_name: result.last_name, // User's last name (corrected to access from the first result)
            about: result.about,
            email: result.email, // User's email address
            is_email_verified: Boolean(result.is_email_verified),
            phone_country_code:result.phone_country_code,
            phone_number:result.phone_number,
            is_phone_verified: !!result.is_phone_verified,
            profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
            profile_pic_url_96x96: PROFILE_BASE_URL + "/" + result.profile_pic_url_96x96,
            account_type: result.account_type,
            location: result.latitude == null || result.longitude == null ? null : {
                latitude: result.latitude,
                longitude: result.longitude,
                geo: result.geo,
                location_type: result.location_type,
                updated_at: result.updated_at,
            },
            created_at: createdAtYear, // Date when the user was created
            updated_at: result.profile_updated_at, // Date when the user details were last updated
            // Add any other relevant fields here
        })
    } catch (error) {

        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error");
    }

};

// Update first name
exports.updateFirstName = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const { first_name } = req.body;
        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        // Update the first name in the database
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

// Update last name
exports.updateLastName = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const { last_name } = req.body;
        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        // Update the first name in the database
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

// Update about field
exports.updateAbout = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const { about } = req.body;
        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        // Update the about field in the database
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



async function uploadToS3(buffer, key, contentType) {
    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: key,  // The S3 path (folder + filename)
        Body: buffer,
        ContentType: contentType, // MIME type of the file
        ACL: 'public-read' // Optional: make the file public (if needed)
    };

    try {
        const data = await awsS3Bucket.upload(params).promise();
        return data.Location; // This is the public URL to the uploaded file
    } catch (error) {
        throw new Error('Error uploading to S3: ' + error.message);
    }
}





exports.updateProfilePic = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return the first error
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        // Check if a file was uploaded
        if (!req.file) {
            return sendErrorResponse(res, 400, 'No image file has been uploaded');
        }

        // Compress and convert image to JPEG format using Sharp
        const compressedImageBuffer = await sharp(req.file.buffer)
            .resize(512, 512)
            .jpeg({ quality: 80 }) // Adjust quality as needed
            .toBuffer();

        // Generate 96x96 version of the image
        const image96by96 = await sharp(req.file.buffer)
            .resize(96, 96) // Resize to 96x96
            .jpeg({ quality: 100 }) // Adjust quality as needed
            .toBuffer();


        // Get user ID from the request
        const userId = req.user.user_id;

        // Ensure user exists
        const result = await User.getUserMedia(userId);
        if (!result) {
            return sendErrorResponse(res, 404, 'User not exist');
        }

        const mediaId = result.media_id;

        // Create unique S3 key (path) for each image
        const filenameOriginal = `profile-pic-${userId}.jpeg`;
        const filename96by96 = `profile-pic-${userId}-96x96.jpeg`;

       const filenameOriginalS3Key = `media/${mediaId}/profile-pic/${filenameOriginal}`;
       const filename96by96S3Key = `media/${mediaId}/profile-pic/${filename96by96}`;

        // Upload images to S3
        await uploadToS3(compressedImageBuffer, filenameOriginalS3Key, 'image/jpeg');
        await uploadToS3(image96by96, filename96by96S3Key, 'image/jpeg');


        // Build the URLs
        const profilePicUrl = generateShortEncryptedUrl(filenameOriginalS3Key);
        const profilePicUrl96by96 = generateShortEncryptedUrl(filename96by96S3Key);

        // Update profile pic URLs in the database
        const updatedProfilePicResult = await User.updateProfilePic(userId, profilePicUrl, profilePicUrl96by96);

      
        if (!updatedProfilePicResult) {
            return sendErrorResponse(res, 400, 'Failed to update profile pic');
        }

        // Respond with success
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






// Update email
exports.updateEmail = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }

        const userId = req.user.user_id

        const { email } = req.body;
        // Check if a different user already has this new email
        const existingUser = await User.findUserByEmail(email);

        if (existingUser) {
            return sendErrorResponse(res, 409, 'Email already in use'); // 409 Conflict
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
            return sendErrorResponse(res, 500, 'Failed to send email');
        }

        // Respond to the client with common response format
        sendJsonResponse(res, 200, 'Email OTP has been sent'); // 200 OK

    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }

};

exports.updateEmailVerifyOTP = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, 'OTP field is required', errors.array());
        }

        const userId = req.user.user_id;

        // Assuming you have a function to find users by email
        const user = User.findUserById(userId);

        if (!user) {
            return sendErrorResponse(res, 403, 'User not found');
        }

        const { otp, email } = req.body; // Extract OTP from the request body

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
            delete req.session.storedEmail;
            return sendErrorResponse(res, 400, 'OTP has expired');
        }

        // Check if the OTP is correct
        if (storedOtp !== otp) {
            return sendErrorResponse(res, 400, 'Invalid OTP');
        }

        const userResult = await User.updateUserProfileEmail(userId, storedEmail);

        if (!userResult) {
            // Respond with success and provide the temporary access token
            return sendErrorResponse(res, 400, 'Failed to update email');
        }

        // Generate access and refresh tokens
        const { accessToken, refreshToken } = generateTokens(user.userId);

        // Respond with success and provide the temporary access token
        sendJsonResponse(res, 200, 'Email is updated successfully', {
            user_id: userResult.user_id,
            email: userResult.email,
            access_token: accessToken,
            refresh_token: refreshToken,
            updated_at: userResult.updated_at

        });

        // Optionally clear the OTP from the session once it’s successfully verified
        delete req.session.storedOtp;
        delete req.session.otpExpires;
        delete req.session.storedEmail;
    } catch (error) {

        return sendErrorResponse(res, 500, 'Internal server error', error.toString());
    }

};


// Update user location
exports.updateLocation = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {

            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        // Retrieve and sanitize POST data
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;
        const locationType = req.body.location_type;
        const geo = req.body.geo;

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user  

        // Check if the user exists
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not found");
        }

        // Update user location
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


// Update user location
exports.logOut = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {

            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }


        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user  

        // Check if the user exists
        const userExists = await User.findUserById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not exist");
        }

        const deactivatedResult = await User.userAsDeactivated(userId);

        if (!deactivatedResult) {
            return sendErrorResponse(res, 404, "Fauied to deactivate account");
        }

        // Update the FCM token in the database
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
