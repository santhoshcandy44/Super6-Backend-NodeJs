// User.js
const db = require('../config/database')
const { generateSalt, hashPassword, generatePepper } = require('../utils/authUtils'); // Assuming you have utility functions for hashing

const crypto = require('crypto');


class User {

    constructor(firstName, lastName, email, profilePicUrl, accountType, password, signUpMethod) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.profilePicUrl = profilePicUrl;
        this.password = password; // Add password to constructor
        this.signUpMethod = signUpMethod;
        this.accountType = accountType;
    }
    // Method to save user to the database
    async registerUserLegacyEmail() {

        // Generate salt and hash the password
        const salt = await generateSalt();
        // Generate a random salt
        const pepper = await generatePepper();
        const hashedPassword = await hashPassword(pepper + this.password, salt);
        // Step 1: Insert the user data into the database
        const [insertResult] = await db.query(
            'INSERT INTO users (first_name, last_name, email, is_email_verified, account_type, sign_up_method, hashed_password, pepper, salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [this.firstName, this.lastName, this.email, true, this.accountType, this.signUpMethod, hashedPassword, pepper, salt]
        );

        // Step 2: Validate if the insert was successful
        if (insertResult.affectedRows === 0) {
            console.error("Error inserting user. No rows affected.");
            return null;
        }

        // Step 3: Retrieve the `user_id` using the email address

        const [userResult] = await db.query(
            'SELECT user_id, first_name, last_name, about, email, is_email_verified, profile_pic_url, account_type, created_at, updated_at FROM users WHERE email = ?',
            [this.email]
        );

        // Step 4: Check if the user was found
        if (!userResult || userResult.length === 0) {
            console.error("User not found after insert.");
            return null;
        }

        // Step 5: Return the user's details
        return userResult[0];
    }

    async saveGoogleSignUp() {

        const [insertResult] = await db.query(
            'INSERT INTO users (first_name, last_name, email,is_email_verified,profile_pic_url,account_type,sign_up_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [this.firstName, this.lastName, this.email, true, this.profilePicUrl, this.accountType, this.signUpMethod]
        );


        // Step 2: Validate if the insert was successful
        if (insertResult.affectedRows === 0) {
            console.error("Error inserting user. No rows affected.");
            return null;
        }

        // Step 3: Retrieve the `user_id` using the email address

        const [userResult] = await db.query(
            'SELECT user_id, first_name, last_name, about, email, is_email_verified, profile_pic_url, account_type, created_at, updated_at FROM users WHERE email = ?',
            [this.email]
        );

        // Step 4: Check if the user was found
        if (!userResult || userResult.length === 0) {
            console.error("User not found after insert.");
            return null;
        }

        // Step 5: Return the user's details
        return userResult[0];
    }

    static async updatePasswordCredentials(userId, pepper, salt, hashed_password) {

        const query = `
        UPDATE users 
        SET hashed_password = ?, pepper = ?, salt = ? 
        WHERE user_id = ?`;

        const [result] = await db.query(query, [hashed_password, pepper, salt, userId]);


        // Validate the result
        if (result.affectedRows === 0) {
            // No rows were updated, which means the user ID might not exist
            return null;
        } else {
            return { success: true, message: 'Password credentials updated' };
        }

    }


    // Function to find a user by email
    static async findUserByEmail(email) {
        const query = `
        SELECT * FROM users 
        WHERE email = ?`;  // SQL Query
        // Execute the query and pass the email parameter to avoid SQL injection
        const [rows] = await db.query(query, [email]);

        // Return the first row if a user is found, or null if no user is found
        return rows.length > 0 ? rows[0] : null;
    }

    // Function to update a user's 'firstName' by user ID
    static async updateUserProfileFirstName(userId, firstName) {
        const query = `
        UPDATE users
        SET first_name = ?  -- Update the 'firstName' field
        WHERE user_id = ?`;  // Condition to match the user by their ID

        // Execute the query and pass the 'firstName' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [firstName, userId]);


        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );

        return rows.length > 0 ? rows[0] : null;
    }


    // Function to update a user's 'firstName' by user ID
    static async updateUserProfileLastName(userId, lastName) {
        const query = `
            UPDATE users
            SET last_name = ?
            WHERE user_id = ?`;  // Condition to match the user by their ID

        // Execute the query and pass the 'firstName' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [lastName, userId]);


        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        // Return a success message or the result
        return rows.length > 0 ? rows[0] : null;

    }


    // Function to update a user's 'about' section by user ID
    static async updateUserProfileAbout(userId, about) {
        const query = `
        UPDATE users
        SET about = ?  -- Update the 'about' field
        WHERE user_id = ?`;  // Condition to match the user by their ID

        // Execute the query and pass the 'about' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [about, userId]);

        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        // Return a success message or the result
        return rows.length > 0 ? rows[0] : null;

    }

    // Function to update a user's 'account type' section by user ID
    static async updateUserProfileAccountType(userId, accountType) {


        const [userProfileAccount] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);


        const userProfileAccountResult = userProfileAccount.length > 0 ? userProfileAccount[0] : null

        if (!userProfileAccountResult) {
            return null;
        }


        if (userProfileAccountResult.account_type == accountType) {
            return { success: false, message: "You are already in " + accountType + " account" }
        }


        const query = `
        UPDATE users
        SET account_type = ?  -- Update the 'account type' field
        WHERE user_id = ?`;  // Condition to match the user by their ID

        // Execute the query and pass the 'about' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [accountType, userId]);

        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        // Return a success message or the result

        return { success: true, message: "ok", data: rows.length > 0 ? rows[0] : null };

    }

    static async getUserMedia(userId) {
        const query = `
        SELECT media_id FROM users 
        WHERE user_id = ?`;  // SQL Query

        // Execute the query and pass the email parameter to avoid SQL injection
        const [rows] = await db.query(query, [userId]);

        // Return the first row if a user is found, or null if no user is found
        return rows.length > 0 ? rows[0] : null;
    }


    // Function to update a user's profile picture URLs by user ID
    static async updateProfilePic(userId, profilePicUrl, profilePicUrl96by96) {
        // Update query to include both original and resized URLs
        const query = `
        UPDATE users
        SET 
            profile_pic_url = ?, 
            profile_pic_url_96x96 = ?, 
            updated_at = NOW() 
        WHERE user_id = ?`;

        // Execute the query with both URLs and the user ID
        const [result] = await db.query(query, [profilePicUrl, profilePicUrl96by96, userId]);

        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        // Fetch the updated user details
        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );

        // Return the updated user details
        return rows.length > 0 ? rows[0] : null;
    }



    // Function to update a user's 'email' section by user ID
    static async updateUserProfileEmail(userId, email) {
        const query = `
        UPDATE users
        SET email = ?  -- Update the 'about' field
        WHERE user_id = ?`;  // Condition to match the user by their ID

        // Execute the query and pass the 'about' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [email, userId]);

        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }


        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );


        // Return a success message or the result
        return rows.length > 0 ? rows[0] : null;

    }





    // Function to find a user by id
    static async findUserById(user_id) {
        const query = `
                SELECT * FROM users 
                WHERE user_id = ?`;  // SQL Query

        // Execute the query and pass the email parameter to avoid SQL injection
        const [rows] = await db.query(query, [user_id]);

        // Return the first row if a user is found, or null if no user is found
        return rows.length > 0 ? rows[0] : null;
    }


    // Function to update a user's account_status to 'deactivated' by user_id
    static async userAsDeactivated(user_id) {
        const query = `
        UPDATE users 
        SET account_status = 'deactivated' 
        WHERE user_id = ?`;  // Correct string 'deactivated'

        try {
            // Execute the query to update the user
            const [result] = await db.query(query, [user_id]);

            // Return the result of the update (e.g., number of affected rows)
            return result;
        } catch (error) {
            // Handle errors
            console.error('Error updating account status:', error.message);
            throw error;
        }
    }





    static async getUserProfile(user_id) {
        const query = `SELECT u.first_name, u.last_name, u.email, u.profile_pic_url,  u.profile_pic_url_96x96, u.created_at, u.updated_at as profile_updated_at, u.about, 
                u.account_type,
                u.phone_country_code,
                u.phone_number,
                u.is_phone_verified,
               ul.latitude, ul.longitude,

                  ul.geo, ul.location_type, ul.updated_at
        FROM users u
        LEFT JOIN user_locations ul ON u.user_id = ul.user_id
        WHERE u.user_id = ?`;  // SQL Query

        // Execute the query and pass the email parameter to avoid SQL injection
        const [rows] = await db.query(query, [user_id]);

        // Return the first row if a user is found, or null if no user is found
        return rows.length > 0 ? rows[0] : null;

    }

    // Function to manually update last_sign_in with a specific timestamp
    static async updateLastSignedIn(user_id) {
        // Update the last_sign_in field with the provided timestamp
        const updateQuery = `UPDATE users SET last_sign_in = NOW(), account_status = 'active' WHERE user_id = ?`;

        // Execute the update query with the lastSignInTimestamp value
        const result = await db.query(updateQuery, [user_id]);

        // If no rows were affected (user not found), return null
        if (result.affectedRows === 0) {
            return null;
        }

        // After updating, retrieve the updated user data (optional)
        const selectQuery = `SELECT * FROM users WHERE user_id = ?`;
        const [rows] = await db.query(selectQuery, [user_id]);

        // If user found, return the updated user data
        if (rows.length > 0) {
            const updatedUser = rows[0];
            return updatedUser; // Return the updated user information
        }

        return null; // If user not found
    }



}


module.exports = User;
