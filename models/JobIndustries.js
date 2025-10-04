const db = require('../config/lts360JobsDatabase')

class JobIndustries {
    static async getIndustries(userId) {
        const query = `SELECT
        i.industry_id,
        i.industry_name,
        i.description,
        CASE
            WHEN ui.external_user_id IS NOT NULL THEN 1
            ELSE 0
        END AS is_selected
    FROM job_industries i
    LEFT JOIN user_job_industries ui ON i.industry_id = ui.industry_id AND ui.external_user_id = ?`;

        const [rows] = await db.query(query, [userId]);
        const industries = rows.map(row => ({
            industry_id: row.industry_id,
            industry_name: row.industry_name,
            description: row.description,
            is_selected: Boolean(row.is_selected)
        }));
        return industries;
    }

    static async getGuestIndustries() {
        const query = `SELECT
        i.industry_id,
        i.industry_name,
        i.description
        FROM industries i`;

        const [rows] = await db.query(query);
        const industries = rows.map(row => ({
            industry_id: row.industry_id,
            industry_name: row.industry_name,
            description: row.description,
            is_selected: false
        }));
        return industries;
    }

    static async updateIndustries(userId, industries) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            for (const industry of industries) {
                const isSelected = industry.is_selected ? 1 : 0;
                const industryId = industry.industry_id;
                const [countRows] = await db.query("SELECT COUNT(*) as count FROM user_job_industries WHERE external_user_id = ? AND industry_id = ?", [userId, industryId]);
                const count = countRows[0].count;
                if (isSelected) {
                    if (count === 0) {
                        await JobIndustries.insertUserIndustry(userId, industryId);
                    }
                } else {
                    if (count > 0) {
                        await JobIndustries.deleteUserIndustry(userId, industryId);
                    }
                }
            }
            await connection.commit();
            const updatedIndustries = await JobIndustries.getIndustries(userId);
            return updatedIndustries;
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
        finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async deleteUserIndustry(userId, industryId) {
        const deleteStmt = "DELETE FROM user_job_industries WHERE external_user_id = ? AND industry_id = ?";
        await db.query(deleteStmt, [userId, industryId]);
    }
    
    static async insertUserIndustry(userId, industryId) {
        const insertStmt = "INSERT INTO user_job_industries (external_user_id, industry_id, created_at) VALUES (?, ?, NOW())";
        await db.query(insertStmt, [userId, industryId]);
    }
}

module.exports = JobIndustries;