// app.get("/display-reviews/:serviceId", async (req, res) => {
//     try {
//         const serviceId = req.params.serviceId;
//         const [comments] = await db.query(`
//             SELECT 
//                 sr.id AS comment_id,
//                 sr.text AS comment_text,
//                 sr.timestamp AS comment_timestamp,
//                 CONCAT(u.first_name, ' ', u.last_name) AS full_name,
//                 u.profile_pic_url AS profile_pic_url,
//                 u.user_id AS comment_user_id  -- Added user_id for the comment author
//             FROM 
//                 service_reviews sr
//             JOIN 
//                 users u ON sr.user_id = u.user_id
//             WHERE 
//                 sr.service_id = ?;  -- Replace with the specific comment ID
//         `, [serviceId]);

//         const result = comments.map((row) => ({
//             id: row.comment_id,
//             text: row.comment_text,
//             timestamp: row.comment_timestamp,
//             user: {
//                 full_name: row.full_name,
//                 profile_pic_url: MEDIA_BASE_URL + "/" + row.profile_pic_url,
//                 user_id: row.comment_user_id  // Added comment author user_id
//             },
//         }));
//         return sendJsonResponse(res, 200, "Service reviews fetched successfully.", result);
//     } catch (error) {
//         res.status(500).send({ error: "An error occurred while fetching comments." });
//     }
// });

// app.get("/display-replies/:commentId", async (req, res) => {
//     const commentId = req.params.commentId;
//     try {
//         const [replies] = await db.query(`
//             SELECT 
//                 r.id AS reply_id,
//                 r.text AS reply_text,
//                 r.timestamp AS reply_timestamp,
//                 CONCAT(u_reply.first_name, ' ', u_reply.last_name) AS reply_full_name,
//                 u_reply.profile_pic_url AS reply_user_profile_pic_url,
//                 u_reply.user_id AS reply_user_id,  -- Added reply author user_id
//                 r.reply_to_user_id,
//                 CONCAT(reply_to_user.first_name, ' ', reply_to_user.last_name) AS reply_to_full_name
//             FROM 
//                 service_reviews_replies r
//             LEFT JOIN 
//                 users u_reply ON r.user_id = u_reply.user_id
//             LEFT JOIN 
//                 users reply_to_user ON r.reply_to_user_id = reply_to_user.user_id
//             WHERE 
//                 r.service_review_id = ?;  -- Replace with the specific comment ID
//         `, [commentId]);

//         // Initialize replies structure
//         const repliesResult = replies.map((row) => ({
//             id: row.reply_id,
//             text: row.reply_text,
//             timestamp: row.reply_timestamp,
//             user: {
//                 full_name: row.reply_full_name,
//                 profile_pic_url: MEDIA_BASE_URL + "/" + row.reply_user_profile_pic_url,
//                 user_id: row.reply_user_id  // Added reply author user_id
//             },
//             reply_to_full_name: row.reply_to_full_name || null
//         }));

//         // Send the response as JSON
//         return sendJsonResponse(res, 200, "Service reviews fetched successfully.", repliesResult);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send({ error: "An error occurred while fetching replies." });
//     }
// });

// app.post("/insert-review", async (req, res) => {
//     try {
//         const { serviceId, userId, text } = req.body;

//         if (!serviceId || !userId || !text) {
//             return res.status(400).send({ error: "Service ID, User ID, and Comment Text are required." });
//         }

//         const timestamp = new Date().getTime(); // Get current timestamp

//         // Insert comment into service_reviews table
//         const [result] = await db.query(`
//             INSERT INTO service_reviews (service_id, user_id, text, timestamp)
//             VALUES (?, ?, ?, ?);
//         `, [serviceId, userId, text, timestamp]);




//         const insertedId = result.insertId;

//         const [rows] = await db.query(`
//             SELECT sr.id AS comment_id, sr.text AS comment_text, sr.timestamp AS comment_timestamp,
//                    CONCAT(u.first_name, ' ', u.last_name) AS full_name, 
//                    u.profile_pic_url, u.user_id AS comment_user_id
//             FROM service_reviews sr
//             JOIN users u ON sr.user_id = u.user_id
//             WHERE sr.id = ?;
//         `, [insertedId]);


//         if (rows.length > 0) {
//             const row = rows[0];

//             const formattedResult = {
//                 id: row.comment_id,
//                 text: row.comment_text,
//                 timestamp: row.comment_timestamp,
//                 user: {
//                     full_name: row.full_name,
//                     profile_pic_url: `${MEDIA_BASE_URL}/${row.profile_pic_url}`,
//                     user_id: row.comment_user_id
//                 },
//             };

//             return sendJsonResponse(res, 200, "Comment inserted successfully.", formattedResult);
//         } else {
//             return res.status(404).send({ error: "Inserted comment not found." });
//         }



//     } catch (error) {
//         console.error(error);
//         res.status(500).send({ error: "An error occurred while inserting the comment." });
//     }
// });

// app.post("/insert-review-reply", async (req, res) => {
//     try {
//         const { commentId, userId, text, replyToUserId } = req.body;

//         if (!commentId || !userId || !text) {
//             return res.status(400).send({ error: "Comment ID, User ID, and Reply Text are required." });
//         }

//         const timestamp = new Date().getTime(); // Get current timestamp

//         // Insert the reply into the service_reviews_replies table
//         const [result] = await db.query(`
//             INSERT INTO service_reviews_replies (service_review_id, user_id, text, timestamp, reply_to_user_id)
//             VALUES (?, ?, ?, ?, ?);
//         `, [commentId, userId, text, timestamp, replyToUserId || null]);

//         const insertedId = result.insertId;

//         // Fetch the inserted reply with user details
//         const [reply] = await db.query(`
//             SELECT srr.id AS reply_id, srr.text AS reply_text, srr.timestamp AS reply_timestamp,
//                    CONCAT(u.first_name, ' ', u.last_name) AS full_name, u.profile_pic_url, u.user_id AS reply_user_id,
//                    (SELECT CONCAT(u2.first_name, ' ', u2.last_name) 
//                     FROM users u2 WHERE u2.user_id = srr.reply_to_user_id) AS reply_to_user_name
//             FROM service_reviews_replies srr
//             JOIN users u ON srr.user_id = u.user_id
//             WHERE srr.id = ?;
//         `, [insertedId]);

//         if (reply.length > 0) {
//             const replyData = reply[0]; // Assuming the result returns a single object

//             // Return the response in the structure of the ServiceReviewReply data class
//             const response = {
//                 id: replyData.reply_id,
//                 text: replyData.reply_text,
//                 timestamp: replyData.reply_timestamp,
//                 user: {
//                     full_name: replyData.full_name,
//                     profile_pic_url: `${MEDIA_BASE_URL}/${replyData.profile_pic_url}`,
//                     user_id: replyData.reply_user_id
//                 },
//                 reply_to_full_name: replyData.reply_to_user_name || null
//             };

//             return sendJsonResponse(res, 200, "Review reply inserted successfully.", response);
//         } else {
//             return res.status(404).send({ error: "Review reply not found." });
//         }

//     } catch (error) {
//         console.error(error);
//         res.status(500).send({ error: "An error occurred while inserting the reply." });
//     }
// });