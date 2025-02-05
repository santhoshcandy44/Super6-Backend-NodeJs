
const db = require('../config/database');
const { encrypt } = require('../utils/authUtils');


class App{



    static async updateUserFCMToken(userId, fcmToken) {
       
        let connection;

        try {
            connection = await db.getConnection();
            // Start a transaction
            await connection.beginTransaction();



            // Encrypt the FCM token using the secret
            const encryptedToken = await encrypt(fcmToken);

            // Prepare the SQL statement
            const sql = `
                INSERT INTO fcm_tokens (user_id, fcm_token)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE fcm_token = ?, updated_at = CURRENT_TIMESTAMP
            `;

            // Execute the statement
            const [result] = await connection.execute(sql, [userId, encryptedToken, encryptedToken]);

            //    Check the affected rows 
               if (result.affectedRows ==0) { throw Error("Error on updating fcm token"); }

            // Commit the transaction
            await connection.commit();

            return {
                success: true,
                message: 'FCM token updated successfully.',
                result: result
            };
        } catch (error) {
            console.log(error);
            // Rollback transaction in case of an error
            await connection.rollback();
            throw error;
        } finally {
            // Close the connection
            await connection.release();
        }
    }


    static async invalidateUserFCMToken(userId, fcmToken) {
       
        let connection;

        try {
            connection = await db.getConnection();
            // Start a transaction
            await connection.beginTransaction();




            // Prepare the SQL statement
            const sql = `
                INSERT INTO fcm_tokens (user_id, fcm_token)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE fcm_token = ?, updated_at = CURRENT_TIMESTAMP
            `;

            // Execute the statement
            const [result] = await connection.execute(sql, [userId, fcmToken, fcmToken]);

            //    Check the affected rows 
               if (result.affectedRows ==0) { throw Error("Error on updating fcm token"); }

            // Commit the transaction
            await connection.commit();

            return {
                success: true,
                message: 'FCM token updated successfully.',
                result: result
            };
        } catch (error) {
            console.log(error);
            // Rollback transaction in case of an error
            await connection.rollback();
            throw error;
        } finally {
            // Close the connection
            await connection.release();
        }
    }

    
    static async updateUserE2EEPublicKey(userId, publicKey, keyVersion) {
       
        let connection;

        try {
            connection = await db.getConnection();
            // Start a transaction
            await connection.beginTransaction();



            console.log(publicKey);

            // Prepare the SQL statement
            const sql = `
                INSERT INTO e2ee_public_keys (user_id, encrypted_public_key, key_version)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE encrypted_public_key = ?, key_version = ?, updated_at = CURRENT_TIMESTAMP
            `;

            // Execute the statement
            const [result] = await connection.execute(sql, [userId, publicKey, keyVersion, publicKey, keyVersion]);

            //    Check the affected rows 
               if (result.affectedRows ==0) { throw Error("Error on updating e2ee public key"); }

            // Commit the transaction
            await connection.commit();

            return {
                success: true,
                message: 'E2EE public key updated successfully.',
                result: result
            };
        } catch (error) {
            console.log(error);
            // Rollback transaction in case of an error
            await connection.rollback();
            throw error;
        } finally {
            // Close the connection
            await connection.release();
        }
    }
}


module.exports =App;