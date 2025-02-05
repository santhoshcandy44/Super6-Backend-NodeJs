const db = require('../config/database')

class UserLocations {
    // Method to update or insert user location
    static async updateUserLocation(userId, latitude, longitude, locationType, geo) {
        const query = `
            INSERT INTO user_locations (user_id, latitude, longitude, location_type, geo)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                location_type = VALUES(location_type),
                geo = VALUES(geo)`;

        // Execute the query and pass the 'firstName' and 'userId' parameters to avoid SQL injection
        const [result] = await db.query(query, [userId, latitude, longitude, locationType, geo]);


        // Check if any rows were affected (i.e., a user was updated)
        if (result.affectedRows === 0) {
            // No user was updated, return null or a custom message
            return null;
        }

        const [rows] = await db.query(
            'SELECT * FROM user_locations WHERE user_id = ?',
            [userId]
        );


        return rows.length > 0 ? rows[0] : null;

    }
    // Additional methods can be added here (e.g., retrieving user locations, deleting, etc.)
}

module.exports = UserLocations;
