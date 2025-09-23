const db = require('../config/database')

class UserLocation {
    static async updateUserLocation(userId, latitude, longitude, locationType, geo) {
        const query = `
            INSERT INTO user_locations (user_id, latitude, longitude, location_type, geo)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                location_type = VALUES(location_type),
                geo = VALUES(geo)`;
        const [result] = await db.query(query, [userId, latitude, longitude, locationType, geo]);
        if (result.affectedRows === 0) {
            return null;
        }
        const [rows] = await db.query(
            'SELECT * FROM user_locations WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0] : null;
    }
}

module.exports = UserLocation;
