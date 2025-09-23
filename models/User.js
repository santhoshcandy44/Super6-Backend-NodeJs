const db = require('../config/database')
const { generateSalt, hashPassword, generatePepper } = require('../utils/authUtils');

class User {
    constructor(firstName, lastName, email, profilePicUrl, accountType, password, signUpMethod) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.profilePicUrl = profilePicUrl;
        this.password = password;
        this.signUpMethod = signUpMethod;
        this.accountType = accountType;
    }

    async registerUserLegacyEmail() {
        const salt = await generateSalt();
        const pepper = await generatePepper();
        const hashedPassword = await hashPassword(pepper + this.password, salt);
        const [insertResult] = await db.query(
            'INSERT INTO users (first_name, last_name, email, is_email_verified, account_type, sign_up_method, hashed_password, pepper, salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [this.firstName, this.lastName, this.email, true, this.accountType, this.signUpMethod, hashedPassword, pepper, salt]
        );
        if (insertResult.affectedRows === 0) {
            console.error("Error inserting user. No rows affected.");
            return null;
        }
        const [userResult] = await db.query(
            'SELECT user_id, first_name, last_name, about, email, is_email_verified, phone_country_code, phone_number, is_phone_verified, profile_pic_url, account_type, created_at, updated_at FROM users WHERE email = ?',
            [this.email]
        );
        if (!userResult || userResult.length === 0) {
            console.error("User not exist after insert.");
            return null;
        }
        return userResult[0];
    }

    async saveGoogleSignUp() {
        const [insertResult] = await db.query(
            'INSERT INTO users (first_name, last_name, email,is_email_verified,profile_pic_url,account_type,sign_up_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [this.firstName, this.lastName, this.email, true, this.profilePicUrl, this.accountType, this.signUpMethod]
        );
        if (insertResult.affectedRows === 0) {
            console.error("Error inserting user. No rows affected.");
            return null;
        }

        const [userResult] = await db.query(
            'SELECT user_id, first_name, last_name, about, email, is_email_verified, phone_country_code, phone_number, is_phone_verified, profile_pic_url, account_type, created_at, updated_at FROM users WHERE email = ?',
            [this.email]
        );

        if (!userResult || userResult.length === 0) {
            console.error("User not exist after insert.");
            return null;
        }

        return userResult[0];
    }

    static async updatePasswordCredentials(userId, pepper, salt, hashed_password) {
        const query = `
        UPDATE users 
        SET hashed_password = ?, pepper = ?, salt = ? 
        WHERE user_id = ?`;

        const [result] = await db.query(query, [hashed_password, pepper, salt, userId]);

        if (result.affectedRows === 0) {
            return null;
        } else {
            return { success: true, message: 'Password credentials updated' };
        }
    }


    static async findUserByEmail(email) {
        const query = `
        SELECT * FROM users 
        WHERE email = ?`;
        const [rows] = await db.query(query, [email]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async updateUserProfileFirstName(userId, firstName) {
        const query = `
        UPDATE users
        SET first_name = ?  
        WHERE user_id = ?`;
        const [result] = await db.query(query, [firstName, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );

        return rows.length > 0 ? rows[0] : null;
    }

    static async updateUserProfileLastName(userId, lastName) {
        const query = `
            UPDATE users
            SET last_name = ?
            WHERE user_id = ?`;

        const [result] = await db.query(query, [lastName, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        return rows.length > 0 ? rows[0] : null;
    }

    static async updateUserProfileAbout(userId, about) {
        const query = `
        UPDATE users
        SET about = ?  
        WHERE user_id = ?`; 

        const [result] = await db.query(query, [about, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        return rows.length > 0 ? rows[0] : null;
    }

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
        SET account_type = ?  
        WHERE user_id = ?`; 

        const [result] = await db.query(query, [accountType, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [userId]);

        return { success: true, message: "ok", data: rows.length > 0 ? rows[0] : null };
    }

    static async getUserMedia(userId) {
        const query = `
        SELECT media_id FROM users 
        WHERE user_id = ?`; 
        const [rows] = await db.query(query, [userId]);
        return rows.length > 0 ? rows[0] : null;
    }


    static async updateProfilePic(userId, profilePicUrl, profilePicUrl96by96) {
        const query = `
        UPDATE users
        SET 
            profile_pic_url = ?, 
            profile_pic_url_96x96 = ?, 
            updated_at = NOW() 
        WHERE user_id = ?`;

        const [result] = await db.query(query, [profilePicUrl, profilePicUrl96by96, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        // Fetch the updated user details
        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async updateUserProfileEmail(userId, email) {
        const query = `
        UPDATE users
        SET email = ?  
        WHERE user_id = ?`;  

        const [result] = await db.query(query, [email, userId]);

        if (result.affectedRows === 0) {
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );

        return rows.length > 0 ? rows[0] : null;
    }

    static async findUserById(user_id) {
        const query = `
                SELECT * FROM users 
                WHERE user_id = ?`;
        const [rows] = await db.query(query, [user_id]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async userAsDeactivated(user_id) {
        const query = `
        UPDATE users 
        SET account_status = 'deactivated' 
        WHERE user_id = ?`; 

        try {
            const [result] = await db.query(query, [user_id]);
            return result;
        } catch (error) {
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
        WHERE u.user_id = ?`;
        const [rows] = await db.query(query, [user_id]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async updateLastSignedIn(user_id) {
        const updateQuery = `UPDATE users SET last_sign_in = NOW(), account_status = 'active' WHERE user_id = ?`;
        const result = await db.query(updateQuery, [user_id]);
        if (result.affectedRows === 0) {
            return null;
        }
        const selectQuery = `SELECT * FROM users WHERE user_id = ?`;
        const [rows] = await db.query(selectQuery, [user_id]);
        if (rows.length > 0) {
            const updatedUser = rows[0];
            return updatedUser;
        }
        return null;
    }
}

module.exports = User;