const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { sendErrorResponse, sendJsonResponse } = require('../helpers/responseHelper')
const { generateTokens, generateSalt, sendOtpEmail, verifyIdToken, hashPassword, generateForgotPasswordToken, decodeForgotPasswordToken, generatePepper } = require('../utils/authUtils');
const User = require('../models/User');
const { REFRESH_TOKEN_SECRET, PROFILE_BASE_URL } = require('../config/config');
const App = require('../models/App');
const Boards = require('../models/Boards');

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return sendErrorResponse(res, 400, firstError.msg, errors.array());
    }
    const { email } = req.body;
    const existingUser = await User.findUserByEmail(email);
    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email in use with another account');
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    req.session.storedOtp = otp.toString();
    req.session.storedOtpExpires = otpExpires;
    const response = await sendOtpEmail(email, otp);
    if (!response.success) {
      return sendErrorResponse(res, 500, 'Failed to send OTP', response.message);
    }
    return sendJsonResponse(res, 200, 'Email OTP has been sent');
  } catch (error) {
    return sendErrorResponse(res, 500, 'Internal Server Error', error.message);
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }
    const { otp } = req.body;
    const { storedOtp, storedOtpExpires } = req.session;
    if (!storedOtp || !storedOtpExpires) {
      return sendErrorResponse(res, 400, 'OTP not found or expired');
    }
    const isExpired = new Date() > new Date(storedOtpExpires);
    if (isExpired) {
      delete req.session.storedOtp;
      delete req.session.storedOtpExpires;
      return sendErrorResponse(res, 400, 'OTP expired');
    }
    if (storedOtp !== otp) {
      return sendErrorResponse(res, 400, 'Invalid OTP');
    }
    const bodyEmail = req.body.email;
    const { first_name, last_name, account_type, password } = req.body;
    const existingUser = await User.findUserByEmail(bodyEmail);
    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email in use with another account');
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
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'email', updateResult.last_sign_in);
    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    const boards = await Boards.getBoards(user_id)
    sendJsonResponse(res, 201, 'User registered successfully',
      {
        user_id: user_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        user_details: {
          user_id: user_id,
          first_name: result.first_name,
          last_name: result.last_name,
          about: result.about,
          email: email,
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: Boolean(result.is_phone_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
          account_type: result.account_type,
          created_at: createdAtYear,
          updated_at: result.updated_at
        },
        boards: boards
      });

    delete req.session.storedOtp;
    delete req.session.StoredOtpExpires;
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal server error", error.message)
  }
};

exports.googleSignUp = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }
    const { id_token, account_type } = req.body;
    const payload = await verifyIdToken(id_token);

    const payloadEmail = payload.email;
    const firstName = payload.given_name;
    const lastName = payload.family_name;
    const profilePicUrl = payload.picture;

    const existingUser = await User.findUserByEmail(payloadEmail);
    if (existingUser) {
      return sendErrorResponse(res, 409, 'Email is in use with another account');
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
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);
    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    const boards = await Boards.getBoards(user_id)
    sendJsonResponse(res, 201, 'User registered successfully',
      {
        user_id: user_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        user_details: {
          user_id: user_id,
          first_name: result.first_name,
          last_name: result.last_name,
          about: result.about,
          email: email,
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: Boolean(result.is_phone_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
          account_type: result.account_type,
          created_at: createdAtYear,
          updated_at: result.updated_at
        },
        boards: boards
      }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal server error")
  }
};

exports.legacyEmailLogIn = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return sendErrorResponse(res, 400, firstError.msg, JSON.stringify(errors.array()))
    }
    const bodyEmail = req.body.email;
    const { password } = req.body;
    const existingUser = await User.findUserByEmail(bodyEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, "Invalid user account")
    }
    const hashedPasswordAttempt = await hashPassword(existingUser.pepper + password, existingUser.salt);
    const isPasswordValid = hashedPasswordAttempt === existingUser.hashed_password;
    if (!isPasswordValid) {
      return sendErrorResponse(res, 400, "Invalid password");
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
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'legacy_email', updateResult.last_sign_in);
    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    const boards = await Boards.getBoards(user_id)
    sendJsonResponse(res, 201, 'User login successfully',
      {
        user_id: user_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        user_details: {
          user_id: user_id,
          first_name: result.first_name,
          last_name: result.last_name,
          about: result.about,
          email: result.email,
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: Boolean(result.is_phone_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
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
          created_at: createdAtYear,
          updated_at: result.updated_at,
        },
        boards: boards
      }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal Server Error", error.message)
  }
};

exports.partnerLegacyEmailLogIn = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }

    const bodyEmail = req.body.email;
    const { password } = req.body;
    const existingUser = await User.findUserByEmail(bodyEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, "Invalid user account")
    }
    const hashedPasswordAttempt = await hashPassword(existingUser.pepper + password, existingUser.salt);
    const isPasswordValid = hashedPasswordAttempt === existingUser.hashed_password;
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }
    const { user_id, email } = existingUser;
    const result = await User.getUserProfile(user_id);
    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }
    // const { accessToken, refreshToken } = generateTokens(user_id, email, 'legacy_email', updateResult.last_sign_in);
    // const boards = await Boards.getBoards(user_id)

    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    sendJsonResponse(res, 201, 'User login successfully',

      {
        user_id: user_id,
        // access_token: accessToken, 
        // refresh_token: refreshToken, 
        user_details: {
          user_id: user_id,
          first_name: result.first_name,
          last_name: result.last_name,
          about: result.about,
          email: result.email,
          is_email_verified: Boolean(result.is_email_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
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
          created_at: createdAtYear,
          updated_at: result.updated_at
        },
        // boards: boards
      }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal Server Error", error.message)
  }
};

exports.googleSignin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0]; 
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }
    const { id_token } = req.body;
    const payload = await verifyIdToken(id_token);
    const payloadEmail = payload.email;
    if (!payloadEmail) {
      return sendErrorResponse(res, 503, 'Something went wrong');
    }
    // const firstName = payload.given_name; 
    // const lastName = payload.family_name; 
    // const profilePicUrl = payload.picture; 
    const existingUser = await User.findUserByEmail(payloadEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, 'No account found'); 
    }
    const { user_id, email, sign_up_method } = existingUser;
    if (sign_up_method !== "google") {
      return sendErrorResponse(res, 400, 'This email is signed up with a different method'); 
    }
    const result = await User.getUserProfile(user_id);
    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }
    const updateResult = await User.updateLastSignedIn(user_id);
    if (!updateResult) {
      return sendErrorResponse(res, 400, "Failed to login");
    }
    const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);
    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    const boards = await Boards.getBoards(user_id)
    sendJsonResponse(res, 200, 'User sign in successfully',
      {
        user_id: user_id, 
        access_token: accessToken,
        refresh_token: refreshToken,
        user_details: {
          user_id: user_id,
          first_name: result.first_name, 
          last_name: result.last_name,
          about: result.about,
          email: result.email, 
          is_email_verified: Boolean(result.is_email_verified),
          phone_country_code: result.phone_country_code,
          phone_number: result.phone_number,
          is_phone_verified: Boolean(result.is_phone_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
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
          created_at: createdAtYear, 
          updated_at: result.updated_at,
        },
        boards: boards
      }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal server error")
  }
};

exports.partnerGoogleSignin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0]; 
      return sendErrorResponse(res, 400, firstError.msg, errors.array())

    }
    const { id_token } = req.body;
    const payload = await verifyIdToken(id_token);
    const payloadEmail = payload.email;
    if (!payloadEmail) {
      return sendErrorResponse(res, 503, 'Something went wrong');
    }
    // const firstName = payload.given_name; 
    // const lastName = payload.family_name; 
    // const profilePicUrl = payload.picture;

    const existingUser = await User.findUserByEmail(payloadEmail);
    if (!existingUser) {
      return sendErrorResponse(res, 404, 'No account found');
    }
    const { user_id, email, sign_up_method } = existingUser;
    if (sign_up_method !== "google") {
      return sendErrorResponse(res, 400, 'This email is signed up with a different method');
    }
    const result = await User.getUserProfile(user_id);
    if (!result) {
      return sendErrorResponse(res, 400, "User not exist");
    }
    // const { accessToken, refreshToken } = generateTokens(user_id, email, 'google', updateResult.last_sign_in);
    const createdAtYear = new Date(result.created_at).getFullYear().toString();
    // const boards = await Boards.getBoards(user_id)
    sendJsonResponse(res, 200, 'User sign in successfully',
      {
        user_id: user_id, 
        // access_token: accessToken, 
        // refresh_token: refreshToken, 
        user_details: {
          user_id: user_id,
          first_name: result.first_name, 
          last_name: result.last_name,
          about: result.about,
          email: result.email,
          is_email_verified: Boolean(result.is_email_verified),
          profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url, 
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
          created_at: createdAtYear, 
          updated_at: result.updated_at, 
        },
        // boards:boards
      }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal server error")
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0]; 
      return sendErrorResponse(res, 400, firstError.msg, errors.array())

    }
    const { email } = req.body;
    const existingUser = await User.findUserByEmail(email);
    if (!existingUser) {
      return sendErrorResponse(res, 409, 'Invalid user email'); 
    }
    if (existingUser.sign_up_method !== 'legacy_email') {
      return sendErrorResponse(res, 409, 'Email is associated with different sign in method'); 
    }
    const otp = Math.floor(100000 + Math.random() * 900000); 
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); 
    req.session.storedOtp = otp.toString();
    req.session.storedOtpExpires = otpExpires;
    req.session.storedEmail = email;
    const emailResponse = await sendOtpEmail(email, otp);
    if (!emailResponse.success) {
      return sendErrorResponse(res, 500, 'Failed to send OTP');
    }
    sendJsonResponse(res, 200, 'Email OTP has been sent'); 
  } catch (error) {
    return sendErrorResponse(res, 400, 'Internal Server Error')
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
      return sendErrorResponse(res, 403, 'OTP not found or expired');
    }
    const isExpired = new Date() > new Date(storedOtpExpires);
    if (isExpired) {
      delete req.session.storedOtp;
      delete req.session.storedOtpExpires;
      return sendErrorResponse(res, 403, 'OTP has expired');
    }
    if (storedOtp !== otp) {
      return sendErrorResponse(res, 400, 'Invalid OTP');
    }
    const user = await User.findUserByEmail(storedEmail);
    if (!user) {
      return sendErrorResponse(res, 403, 'User not exist');
    }
    const userId = user.user_id;
    const email = user.email;
    const temporaryAccessToken = generateForgotPasswordToken(userId, email)
    sendJsonResponse(res, 201, 'OTP verified successfully', {
      email: email,
      access_token: temporaryAccessToken,
    });
    delete req.session.storedOtp;
    delete req.session.storedOtpExpires;
    delete req.session.storedEmail;
  } catch (error) {
    return sendErrorResponse(res, 400, 'Internal Server Error')
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0]; 
      return sendErrorResponse(res, 400, firstError.msg, errors.array())
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return sendErrorResponse(res, 401, "Access denied");
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendErrorResponse(res, 401, 'Access denied');
    }
    const decodedToken = decodeForgotPasswordToken(token);
    const { userId, email } = decodedToken;
    const { password } = req.body;
    const salt = await generateSalt();
    const pepper = await generatePepper();
    const hashedPassword = await hashPassword(pepper + password, salt); 
    const user = await User.findUserById(userId);
    if (!user) {
      return sendErrorResponse(res, 403, 'User not exist');
    }
    const result = await User.updatePasswordCredentials(userId, pepper, salt, hashedPassword)
    if (!result) {
      return sendErrorResponse(res, 400, 'Failed to update password');
    }
    sendJsonResponse(res, 200, 'Password reset successfully');
  }
  catch (error) {
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
    jwt.verify(token, REFRESH_TOKEN_SECRET, async (err, user) => {
      try {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            const decoded = jwt.decode(token);
            if (decoded) {
              const userId = decoded.userId
              const userExists = await User.findUserById(userId);
              if (userExists) {
                await User.userAsDeactivated(userId);
                await App.invalidateUserFCMToken(userId, null);
              }
            }
            return sendErrorResponse(res, 403, "Unauthorized");
          } else {
            return sendErrorResponse(res, 403, "Unauthorized");
          }
        }
        const existingUser = await User.findUserById(user.userId);
        if (!existingUser) return sendErrorResponse(res, 403, "User not exist");
        const { accessToken, refreshToken } = generateTokens(user.userId, user.email, user.signUpMethod, user.lastSignIn);
        sendJsonResponse(res, 201, 'Authorized',
          {
            user_id: existingUser.user_id,
            access_token: accessToken,
            refresh_token: refreshToken
          });
      } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.message);
      }
    });
  } catch (error) {
    return sendErrorResponse(res, 500, "Internal server error", error.message);
  }
};