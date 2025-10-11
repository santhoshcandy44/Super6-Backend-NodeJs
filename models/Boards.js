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

        const [rows] = await db.query(query, [userId]);
        const boards = rows.map(row => ({
            board_id: row.board_id,
            board_name: row.board_name,
            board_label: row.board_label,
            display_order: row.display_order,
            is_selected: Boolean(row.is_selected)
        }));
        return boards; s
    }

    static async getGuestBoards() {
        const query = `
            SELECT
                i.board_id,
                i.board_name,
                i.board_label
            FROM boards i`;

        const [rows] = await db.query(query);

        const boards = rows.map(row => ({
            board_id: row.board_id,
            board_name: row.board_name,
            board_label: row.board_label,
            display_order:
                row.board_label === "services" ? 0 :
                    row.board_label === "second_hands" ? 1 : -1,
            is_selected:(row.board_label === "services" || row.board_label === "second_hands")
        }));
        return boards;
    }

    static async updateBoards(userId, boards) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            for (const board of boards) {
                const isSelected = board.is_selected ? 1 : 0;
                const boardId = board.board_id;
                const displayOrder = board.display_order;
                const [countRows] = await connection.query(
                    "SELECT COUNT(*) as count FROM user_boards WHERE user_id = ? AND board_id = ?",
                    [userId, boardId]
                );
                const count = countRows[0].count;
                if (isSelected) {
                    await Boards.insertUserBoard(userId, boardId, displayOrder);
                } else {
                    if (count > 0) {
                        await Boards.deleteUserBoard(userId, boardId);
                    }
                }
            }
            await connection.commit();
            const updatedBoards = await Boards.getBoards(userId);
            return updatedBoards;
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        } finally {
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
            display_order = VALUES(display_order)`;
        await db.query(insertStmt, [userId, boardId, displayOrder]);
    }
}

module.exports = Boards;