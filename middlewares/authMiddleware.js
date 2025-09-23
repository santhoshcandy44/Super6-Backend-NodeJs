const jwt = require('jsonwebtoken');
const { ACCESS_TOKEN_SECRET } = require('../config/config');
const { sendErrorResponse } = require('../helpers/responseHelper');
const User = require('../models/User'); 

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return sendErrorResponse(res, 401, "No valid token forbidden"); 
    }
    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, user) => {
        if (err) return sendErrorResponse(res, 401, "Invalid token forbidden"); 
        try {
            const existingUser = await User.findUserById(user.userId);
            if (!existingUser) {
                return sendErrorResponse(res, 401, "User not exist forbidden");
            }
            const sessionLastSignedIn = Date.parse(user.lastSignIn);
            const dbLastSignedIn = Date.parse(existingUser.last_sign_in);
            if (sessionLastSignedIn != dbLastSignedIn) {
                return sendErrorResponse(res, 498, "Invalid session");
            }
            req.user = existingUser;
            next(); 
        } catch (error) {
            return sendErrorResponse(res, 500, "Internal server error", error.message);
        }
    });
};

module.exports = authenticateToken;