const jwt = require('jsonwebtoken');
const { ACCESS_TOKEN_SECRET } = require('../config/config');
const User = require('../models/User'); // Import the User model
const { sendErrorResponse } = require('../helpers/responseHelper');

const authenticateToken = async (req, res, next) => {
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return sendErrorResponse(res, 401, "No valid token forbidden"); // Token is invalid, forbidden 
    }


    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, user) => {
        
        if (err) return sendErrorResponse(res, 401, "Invalid token forbidden"); // Token is invalid, forbidden

        try {

            // Check if the user exists in the database
            const existingUser = await User.findUserById(user.userId); // Assuming userId is stored in the token

            if (!existingUser) {
                return sendErrorResponse(res, 401, "User not exist forbidden"); // User not exist, forbidden
            }



            const sessionLastSignedIn = Date.parse(user.lastSignIn);
            const dbLastSignedIn = Date.parse(existingUser.last_sign_in);


            if (sessionLastSignedIn != dbLastSignedIn) {
                //Revoke login for the old session
                return sendErrorResponse(res, 498, "Invalid session"); // User not exist, forbidden
            }


            // Attach the verified user information to the request object
            req.user = existingUser;



            next(); // Proceed to the next middleware or route handler
        } catch (error) {

            return sendErrorResponse(res, 500, "Internal server error", error.toString()); // User not exist, forbidden
        }

    });

};

module.exports = authenticateToken;
