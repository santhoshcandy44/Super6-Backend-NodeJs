const db = require('../config/database')

class Boards {

    static async getBoards(userId) {

        const query = `SELECT
        b.board_id,
        b.board_name,
        b.board_label,
        COALESCE(ub.display_order, -1) AS display_order,  -- Return -1 if display_order is NULL
        CASE
            WHEN ub.user_id IS NOT NULL THEN 1
            ELSE 0
        END AS is_selected
    FROM boards b
    LEFT JOIN user_boards ub ON b.board_id = ub.board_id AND ub.user_id = ?`;

    
        // Execute the query with userId parameter to avoid SQL injection
        const [rows] = await db.query(query, [userId]);
    
        // Map the results to the desired format
        const boards = rows.map(row => ({
            board_id: row.board_id,
            board_name: row.board_name,
            board_label: row.board_label,
            display_order: row.display_order,
            is_selected: Boolean(row.is_selected) // Cast to boolean
        }));
    
        return boards; // Return the array of boards
    }
    

    static async getGuestBoards() {
        // Prepare the SQL statement (fetch only available columns)
        const query = `
            SELECT
                i.board_id,
                i.board_name,
                i.board_label
            FROM boards i`;
    
        try {
            // Execute the query
            const [rows] = await db.query(query);
    
            // Map the results with default values
            const boards = rows.map(row => ({
                board_id: row.board_id,
                board_name: row.board_name,
                board_label: row.board_label,
                display_order: 
                    row.board_label === "services" ? 0 :
                    row.board_label === "second_hands" ? 1 : -1, 
                is_selected: 
                    (row.board_label=== "services" || row.board_label === "second_hands")
            }));

    
            return boards; // Return the formatted array
        } catch (error) {
            console.error("Error fetching guest boards:", error);
            throw error;
        }
    }
    

    static async updateBoards(userId, boards) {
        let connection;
    
        try {
            // Get a connection from the pool
            connection = await db.getConnection();
            await connection.beginTransaction(); // Start transaction
    

            for (const board of boards) {
                const isSelected = board.is_selected ? 1 : 0; // Convert boolean to integer
                const boardId = board.board_id;
                const displayOrder = board.display_order;

                // Check if the board is already linked with the user
                const [countRows] = await connection.query(
                    "SELECT COUNT(*) as count FROM user_boards WHERE user_id = ? AND board_id = ?", 
                    [userId, boardId]
                );
                const count = countRows[0].count;
    
                if (isSelected) {
                    // Insert the record if the board is selected and not already linked
                       await Boards.insertUserBoard(userId, boardId, displayOrder);

                } else {
                    if (count > 0) {
                        // Delete the record if the board is not selected and exists
                        await Boards.deleteUserBoard(userId, boardId );
                    }
                }
            }
    
            await connection.commit(); // Commit transaction
    
            // Fetch and return updated boards for the user
            const updatedBoards = await Boards.getBoards(userId);
    
            return updatedBoards;
    
        } catch (error) {
            // Rollback the transaction in case of an error
            if (connection) {
                await connection.rollback();
            }
    
            throw error; // Rethrow the error after rolling back
        } finally {
            // Release the connection back to the pool
            if (connection) {
                connection.release();
            }
        }
    }

    static async deleteUserBoard(userId, boardId) {
        const deleteStmt = "DELETE FROM user_boards WHERE user_id = ? AND board_id = ?";
        await db.query(deleteStmt, [userId, boardId]);
    }

    static async insertUserBoard(userId, boardId, displayOrder) {

        const insertStmt = `
        INSERT INTO user_boards (user_id, board_id, display_order)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            display_order = VALUES(display_order)
    `;
        await db.query(insertStmt, [userId, boardId, displayOrder]);
    }

}



module.exports = Boards;
