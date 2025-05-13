const db = require('../config/database')

class Industries {

    static async getIndustries(userId) {

        // Prepare the SQL statement
        const query = `SELECT
        i.industry_id,
        i.industry_name,
        i.description,
        CASE
            WHEN ui.user_id IS NOT NULL THEN 1
            ELSE 0
        END AS is_selected
    FROM industries i
    LEFT JOIN user_industries ui ON i.industry_id = ui.industry_id AND ui.user_id = ?`;

          // Execute the query with userId parameter to avoid SQL injection
          const [rows] = await db.query(query, [userId]);

          // Map the results to the desired format
          const industries = rows.map(row => ({
              industry_id: row.industry_id,
              industry_name: row.industry_name,
              description: row.description,
              is_selected: Boolean(row.is_selected) // Cast to boolean
          }));

          return industries; // Return the array of industries

    }


    static async getGuestIndustries() {

        // Prepare the SQL statement
        const query = `SELECT
        i.industry_id,
        i.industry_name,
        i.description
        FROM industries i`;

          // Execute the query with userId parameter to avoid SQL injection
          const [rows] = await db.query(query);

          // Map the results to the desired format
          const industries = rows.map(row => ({
              industry_id: row.industry_id,
              industry_name: row.industry_name,
              description: row.description,
              is_selected: false
          }));

          return industries; // Return the array of industries

    }


    static async updateIndustries(userId, industries) {

        let connection;

        try {

            // Get a connection from the pool
            connection = await db.getConnection();
            await connection.beginTransaction(); // Start transaction

            for (const industry of industries) {
                const isSelected = industry.is_selected ? 1 : 0; // Convert boolean to integer
                const industryId = industry.industry_id;

                // Check if the record exists
                const [countRows] = await db.query("SELECT COUNT(*) as count FROM user_industries WHERE user_id = ? AND industry_id = ?", [userId, industryId]);
                const count = countRows[0].count;

                if (isSelected) {
                    if (count === 0) {
                        // Insert record if it is selected and does not exist
                        await Industries.insertUserIndustry(userId, industryId);
                    }
                } else {
                    if (count > 0) {
                        // Delete record if it is not selected and exists
                        await Industries.deleteUserIndustry(userId, industryId);
                    }
                }
            }

            await connection.commit(); // Commit transaction

            // Fetch updated industries
            const updatedIndustries = await Industries.getIndustries(userId);

            return updatedIndustries;

        } catch (error) {
            // Rollback the transaction in case of an error
            if (connection) {
                await connection.rollback();
            }

            throw error;
        }
        finally {
            // Release the connection back to the pool
            if (connection) {
                connection.release();
            }
        }
    }


    static async deleteUserIndustry(userId, industryId) {
        const deleteStmt = "DELETE FROM user_industries WHERE user_id = ? AND industry_id = ?";
        await db.query(deleteStmt, [userId, industryId]);
    }

    static async insertUserIndustry(userId, industryId) {
        const insertStmt = "INSERT INTO user_industries (user_id, industry_id) VALUES (?, ?)";
        await db.query(insertStmt, [userId, industryId]);
    }


}



module.exports = Industries;
