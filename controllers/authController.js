// controllers/authController.js
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const User = require('../models/User'); // Import the User model
const { generateTokens, generateSalt, sendOtpEmail, verifyIdToken, hashPassword, generateForgotPasswordToken, decodeForgotPasswordToken, generatePepper } = require('../utils/authUtils'); // Import your utility function to generate tokens

const { sendErrorResponse, sendJsonResponse } = require('../helpers/responseHelper')

const { REFRESH_TOKEN_SECRET, PROFILE_BASE_URL } = require('../config/config');
const App = require('../models/App');
const Boards = require('../models/Boards');


// Register a new user
exports.register = async (req, res) => {

  try {
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.message, errors.array());
    }

    const { email } = req.body;

    // Check if user already exists
    const existingUser = await User.findUserByEmail(email);

    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email in use with another account'); // 409 Conflict
    }


    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // Generates a number between 100000 and 999999
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration

    // Store the OTP and its expiration in the session
    req.session.storedOtp = otp.toString(); // Store OTP as string if necessary
    req.session.storedOtpExpires = otpExpires; // Store expiration time
    // Send OTP email
    const emailResponse = await sendOtpEmail(email, otp);


    if (!emailResponse.success) {
      return sendErrorResponse(res, 500, 'Failed to send OTP', emailResponse.message);
    }

    // Respond to the client with common response format
    sendJsonResponse(res, 200, 'Email OTP has been sent'); // 200 OK
  } catch (error) {
    return sendErrorResponse(res, 500, 'Internal Server Error', emailResponse.message);
  }
};

exports.verifyOTP = async (req, res) => {

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

    const { storedOtp, storedOtpExpires } = req.session;

    if (!storedOtp || !storedOtpExpires) {
      return sendErrorResponse(res, 400, 'OTP not found or expired');
    }

    // Check if the OTP has expired
    const isExpired = new Date() > new Date(storedOtpExpires);

    if (isExpired) {
      // Optionally, you can delete the OTP from the session here
      delete req.session.storedOtp;
      delete req.session.storedOtpExpires;
      return sendErrorResponse(res, 400, 'OTP expired');
    }

    // Check if the OTP is correct
    if (storedOtp !== otp) {
      return sendErrorResponse(res, 400, 'Invalid OTP');
    }


    const bodyEmail = req.body.email;

    const { first_name, last_name, account_type, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findUserByEmail(bodyEmail);

    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email in use with another account'); // 409 Conflict
    }

    const user = new User(first_name, last_name, bodyEmail, null, account_type, password, 'legacy_email');
    const result = await user.registerUserLegacyEmail();

    if (!result) {
      return sendErrorResponse(res, 400, "Failed to register user");
    }

    const { user_id, email } = result;



    const updateResult = await User.updateLastSignedIn(user_id);

    if (!updateResult) {
      return sendErrorResponse(res, 400, "Failed to login");
    }


    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'email', updateResult.last_sign_in);


    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 201, 'User registered successfully',
      {
        user_id: user_id, // Unique identifier for the user
        access_token: accessToken, // Token for accessing secured resources
        refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: result.is_phone_verified,
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        boards: boards

      });

    // Optionally clear the OTP from the session once it’s successfully verified
    delete req.session.storedOtp;
    delete req.session.StoredOtpExpires;

  } catch (error) {
    console.log(error);
    return sendErrorResponse(res, 500, "Internal server error", error.message)
  }

};


// Register a new user
exports.googleSignUp = async (req, res) => {


  try {
    // Validate the request body

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }

    const { id_token, account_type } = req.body;

    const payload = await verifyIdToken(id_token);

    // Extract the required fields
    const payloadEmail = payload.email;
    const firstName = payload.given_name; // First name
    const lastName = payload.family_name; // Last name
    const profilePicUrl = payload.picture; // Profile picture URL

    // Check if user already exists
    const existingUser = await User.findUserByEmail(payloadEmail);

    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email is in use with another account'); // 409 Conflict
    }

    const user = new User(firstName, lastName, payloadEmail, profilePicUrl, account_type, null, "google");
    const result = await user.saveGoogleSignUp();

    if (!result) {
      return sendErrorResponse(res, 400, "Failed to register user");
    }

    const { user_id, email } = result;



    const updateResult = await User.updateLastSignedIn(user_id);

    if (!updateResult) {
      return sendErrorResponse(res, 400, "Failed to login");
    }



    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);


    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 201, 'User registered successfully',
      {
        user_id: user_id, // Unique identifier for the user
        access_token: accessToken, // Token for accessing secured resources
        refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: result.is_phone_verified,
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        boards: boards
      }
    );

  } catch (error) {
    console.log(error);
    return sendErrorResponse(res, 500, "Internal server error")
  }

};

// Login a user
exports.legacyEmailLogIn = async (req, res) => {

  try {

    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, JSON.stringify(errors.array()))
    }

    const bodyEmail = req.body.email;
    const { password } = req.body;

    // Find the user by email
    const existingUser = await User.findUserByEmail(bodyEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, "Invalid user account")
    }

    // Combine the stored pepper with the input password and hash it
    const hashedPasswordAttempt = await hashPassword(existingUser.pepper + password, existingUser.salt);

    // Compare the hashed password with the stored hashed password
    const isPasswordValid = hashedPasswordAttempt === existingUser.hashed_password;

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const { user_id, email } = existingUser;

    const result = await User.getUserProfile(user_id);

    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }


    const updateResult = await User.updateLastSignedIn(user_id);

    if (!updateResult) {
      return sendErrorResponse(res, 400, "Failed to login");
    }



    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'legacy_email', updateResult.last_sign_in);

    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 201, 'User login successfully',

      {
        user_id: user_id, // Unique identifier for the user
        access_token: accessToken, // Token for accessing secured resources
        refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: result.email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: result.is_phone_verified,
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          location: (
            result.latitude != null &&
            result.longitude != null &&
            result.geo != null &&
            result.location_type != null &&
            result.updated_at != null
          ) ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geo: result.geo,
            location_type: result.location_type,
            updated_at: result.updated_at,
          } : null,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        boards: boards
      }

    );
  } catch (error) {

    console.log(error);
    return sendErrorResponse(res, 500, "Internal Server Error", error.message)
  }
};


exports.partnerLegacyEmailLogIn = async (req, res) => {

  try {

    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, JSON.stringify(errors.array()))
    }

    const bodyEmail = req.body.email;
    const { password } = req.body;

    // Find the user by email
    const existingUser = await User.findUserByEmail(bodyEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, "Invalid user account")
    }

    // Combine the stored pepper with the input password and hash it
    const hashedPasswordAttempt = await hashPassword(existingUser.pepper + password, existingUser.salt);

    // Compare the hashed password with the stored hashed password
    const isPasswordValid = hashedPasswordAttempt === existingUser.hashed_password;

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const { user_id, email } = existingUser;

    const result = await User.getUserProfile(user_id);

    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }


    // Generate access and refresh tokens
    // const { accessToken, refreshToken } = generateTokens(user_id, email, 'legacy_email', updateResult.last_sign_in);

    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    // const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 201, 'User login successfully',

      {
        user_id: user_id, // Unique identifier for the user
        // access_token: accessToken, // Token for accessing secured resources
        // refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: result.email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),

          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          location: (
            result.latitude != null &&
            result.longitude != null &&
            result.geo != null &&
            result.location_type != null &&
            result.updated_at != null
          ) ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geo: result.geo,
            location_type: result.location_type,
            updated_at: result.updated_at,
          } : null,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        // boards: boards
      }

    );
  } catch (error) {
    console.log(error);
    return sendErrorResponse(res, 500, "Internal Server Error", error.message)
  }
};

// Register a new user
exports.googleSignin = async (req, res) => {


  try {
    // Validate the request body

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, errors.array())

    }
    const { id_token } = req.body;


    const payload = await verifyIdToken(id_token);

    // Extract the required fields
    const payloadEmail = payload.email;

    if (!payloadEmail) {
      return sendErrorResponse(res, 503, 'Something went wrong'); // 404 not found
    }

    // const firstName = payload.given_name; // First name
    // const lastName = payload.family_name; // Last name
    // const profilePicUrl = payload.picture; // Profile picture URL

    // Check if user already exists
    const existingUser = await User.findUserByEmail(payloadEmail);

    if (!existingUser) {
      return sendErrorResponse(res, 404, 'No account found'); // 404 not found
    }

    const { user_id, email, sign_up_method } = existingUser;

    if (sign_up_method !== "google") {
      return sendErrorResponse(res, 400, 'This email is signed up with a different method'); // 400 Bad Request
    }



    const result = await User.getUserProfile(user_id);

    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }




    const updateResult = await User.updateLastSignedIn(user_id);

    if (!updateResult) {
      return sendErrorResponse(res, 400, "Failed to login");
    }



    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);


    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 200, 'User sign in successfully',

      {
        user_id: user_id, // Unique identifier for the user
        access_token: accessToken, // Token for accessing secured resources
        refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: result.email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: result.is_phone_verified,
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          location: (
            result.latitude != null &&
            result.longitude != null &&
            result.geo != null &&
            result.location_type != null &&
            result.updated_at != null
          ) ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geo: result.geo,
            location_type: result.location_type,
            updated_at: result.updated_at,
          } : null,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        boards: boards
      }

    );


  } catch (error) {
    console.error(error);
    return sendErrorResponse(res, 500, "Internal server error")
  }

};


// Register a new user
exports.partnerGoogleSignin = async (req, res) => {


  try {
    // Validate the request body

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, errors.array())

    }
    const { id_token } = req.body;


    const payload = await verifyIdToken(id_token);

    // Extract the required fields
    const payloadEmail = payload.email;

    if (!payloadEmail) {
      return sendErrorResponse(res, 503, 'Something went wrong'); // 404 not found
    }

    // const firstName = payload.given_name; // First name
    // const lastName = payload.family_name; // Last name
    // const profilePicUrl = payload.picture; // Profile picture URL

    // Check if user already exists
    const existingUser = await User.findUserByEmail(payloadEmail);

    if (!existingUser) {
      return sendErrorResponse(res, 404, 'No account found'); // 404 not found
    }

    const { user_id, email, sign_up_method } = existingUser;

    if (sign_up_method !== "google") {
      return sendErrorResponse(res, 400, 'This email is signed up with a different method'); // 400 Bad Request
    }



    const result = await User.getUserProfile(user_id);

    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }



    // Generate access and refresh tokens
    // const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);


    // Extract the year
    const createdAtYear = new Date(result.created_at).getFullYear().toString();

    // const boards = await Boards.getBoards(user_id)

    sendJsonResponse(res, 200, 'User sign in successfully',

      {
        user_id: user_id, // Unique identifier for the user
        // access_token: accessToken, // Token for accessing secured resources
        // refresh_token: refreshToken, // Token for refreshing the access token
        user_details: {
          user_id: user_id,
          first_name: result.first_name, // User's first name
          last_name: result.last_name, // User's last name (corrected to access from the first result)
          about: result.about,
          email: result.email, // User's email address
          is_email_verified: Boolean(result.is_email_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, // URL to the user's profile picture (if applicable)
          account_type: result.account_type,
          location: (
            result.latitude != null &&
            result.longitude != null &&
            result.geo != null &&
            result.location_type != null &&
            result.updated_at != null
          ) ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geo: result.geo,
            location_type: result.location_type,
            updated_at: result.updated_at,
          } : null,
          created_at: createdAtYear, // Date when the user was created
          updated_at: result.updated_at, // Date when the user details were last updated
          // Add any other relevant fields here
        },
        // boards:boards
      }

    );


  } catch (error) {
    console.error(error);
    return sendErrorResponse(res, 500, "Internal server error")
  }

};


// Register a new user
exports.forgotPassword = async (req, res) => {

  try {
    // Validate the request body

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Return the first error
      const firstError = errors.array()[0]; // Get the first error
      return sendErrorResponse(res, 400, firstError.msg, errors.array())

    }

    const { email } = req.body;

    // Check if user already exists
    const existingUser = await User.findUserByEmail(email);
    if (!existingUser) {
      return sendErrorResponse(res, 409, 'Invalid user email'); // 409 Conflict
    }

    if (existingUser.sign_up_method !== 'legacy_email') {
      return sendErrorResponse(res, 409, 'Email is associated with different sign in method'); // 409 Conflict
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
    return sendErrorResponse(res, 400, 'Internal Server Error')
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
      return sendErrorResponse(res, 403, 'OTP not found or expired');
    }

    // Check if the OTP has expired
    const isExpired = new Date() > new Date(storedOtpExpires);

    if (isExpired) {
      // Optionally, you can delete the OTP from the session here
      delete req.session.storedOtp;
      delete req.session.storedOtpExpires;
      return sendErrorResponse(res, 403, 'OTP has expired');
    }

    // Check if the OTP is correct
    if (storedOtp !== otp) {
      return sendErrorResponse(res, 400, 'Invalid OTP');
    }

    // Assuming you have a function to find users by email
    const user = await User.findUserByEmail(storedEmail);

    if (!user) {
      return sendErrorResponse(res, 403, 'User not exist');
    }

    const userId = user.user_id;
    const email = user.email;

    // Generate a temporary token for password reset (valid for 15 minutes)
    const temporaryAccessToken = generateForgotPasswordToken(userId, email)


    // Respond with success and provide the temporary access token
    sendJsonResponse(res, 201, 'OTP verified successfully', {
      email: email,
      access_token: temporaryAccessToken,
    });

    // Optionally clear the OTP from the session once it’s successfully verified
    delete req.session.storedOtp;
    delete req.session.storedOtpExpires;
    delete req.session.storedEmail;
  } catch (error) {
    console.log(error);
    return sendErrorResponse(res, 400, 'Internal Server Error')

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
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return sendErrorResponse(res, 401, "Access denied");
    }
    // Extract the token
    const token = authHeader.split(' ')[1]; // Split the header and get the token part

    if (!token) {
      return sendErrorResponse(res, 401, 'Access denied');
    }


    // Verify the JWT token
    const decodedToken = decodeForgotPasswordToken(token);

    // Extract userId and email from the decoded token
    const { userId, email } = decodedToken;

    const { password } = req.body;

    // Hash the new password before storing it
    const salt = await generateSalt();

    const pepper = await generatePepper();

    const hashedPassword = await hashPassword(pepper + password, salt); // Hash the password with a salt of 10 rounds

    // Assuming you have a function to update the password in your database
    const user = await User.findUserById(userId);

    if (!user) {
      return sendErrorResponse(res, 403, 'User not exist');
    }
    const result = await User.updatePasswordCredentials(userId, pepper, salt, hashedPassword)

    if (!result) {
      return sendErrorResponse(res, 400, 'Failed to update password');
    }

    // Respond with success
    sendJsonResponse(res, 200, 'Password reset successfully');


  }
  catch (error) {
    console.log(error);
    return sendErrorResponse(res, 400, 'Internal Server Error')

  }

};


exports.refreshToken = async (req, res) => {

  try {

    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return sendErrorResponse(res, 401, "Access denied");
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return sendErrorResponse(res, 401, "Access denied");
    }

    // Verify the refresh token
    jwt.verify(token, REFRESH_TOKEN_SECRET, async (err, user) => {


      // Here you might want to verify if the user exists in the database
      try {

        if (err) {
          if (err.name === 'TokenExpiredError') {
            // Decode the expired token payload without verification
            const decoded = jwt.decode(token);


            if (decoded) {

              const userId = decoded.userId

              // Check if the user exists
              const userExists = await User.findUserById(userId);
              if (userExists) {
                await User.userAsDeactivated(userId);
                await App.invalidateUserFCMToken(userId, null);
              }

            }

            // Handle expired token scenario (e.g., force logout or request refresh)
            return sendErrorResponse(res, 403, "Unauthorized"); // Token is invalid, forbidden

          } else {
            return sendErrorResponse(res, 403, "Unauthorized"); // Token is invalid, forbidden
          }

        }

        const existingUser = await User.findUserById(user.userId); // Implement this method in User model

        if (!existingUser) return sendErrorResponse(res, 403, "User not exist"); // User not found, forbidden

        // Generate access and refresh tokens
        const { accessToken, refreshToken } = generateTokens(user.userId, user.email, user.signUpMethod, user.lastSignIn);

        sendJsonResponse(res, 201, 'Authorized',
          {
            user_id: existingUser.userId,
            access_token: accessToken,
            refresh_token: refreshToken
          });

      } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error.toString());
      }


    });
  } catch (error) {

    return sendErrorResponse(res, 500, "Internal server error", error.toString());
  }

};



