
const { PROFILE_BASE_URL, MEDIA_BASE_URL, BASE_URL } = require('../config/config');
const db = require('../config/database');
const { encrypt } = require('../utils/authUtils');
const Service = require('./Service');
const UsedProductListing = require('./UsedProdctListing');
const { decodeCursor, encodeCursor } = require('./utils/pagination/cursor.js');

class App {
    static async updateUserFCMToken(userId, fcmToken) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const encryptedToken = await encrypt(fcmToken);
            const sql = `
                INSERT INTO fcm_tokens (user_id, fcm_token)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE fcm_token = ?, updated_at = CURRENT_TIMESTAMP
            `;

            const [result] = await connection.execute(sql, [userId, encryptedToken, encryptedToken]);

            if (result.affectedRows == 0) {
                throw Error("Error on updating fcm token");
            }

            await connection.commit();

            return {
                success: true,
                message: 'FCM token updated successfully.',
                result: result
            };
        } catch (error) {
            console.log(error);
            await connection.rollback();
            throw error;
        } finally {
            await connection.release();
        }
    }

    static async updateUserE2EEPublicKey(userId, publicKey, keyVersion) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const sql = `
                INSERT INTO e2ee_public_keys (user_id, encrypted_public_key, key_version)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE encrypted_public_key = ?, key_version = ?, updated_at = CURRENT_TIMESTAMP
            `;
            const [result] = await connection.execute(sql, [userId, publicKey, keyVersion, publicKey, keyVersion]);
            if (result.affectedRows == 0) {
                throw Error("Error on updating e2ee public key");
            }
            await connection.commit();
            return {
                success: true,
                message: 'E2EE public key updated successfully.',
                result: result
            };
        } catch (error) {
            console.log(error);
            await connection.rollback();
            throw error;
        } finally {
            await connection.release();
        }
    }

    static async getUserBookmarks(userId, pageSize, nextToken) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );
        if (userCheckResult.length === 0) throw new Error('User is not exist.');

        let query = `SELECT * FROM (
    -- Services
    SELECT
        'service' AS type,
        s.service_id AS item_id,
        s.id AS id,
        0 AS p_type,
        s.service_id AS service_id,
        s.title,
        s.short_description,
        s.long_description,
        i.industry_id AS industry,
        s.status,
        s.short_code,
        s.country,
        s.state,
        COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN si.id IS NOT NULL THEN JSON_OBJECT(
                            'image_id', si.id,
                            'image_url', si.image_url,
                            'width', si.width,
                            'height', si.height,
                            'size', si.size,
                            'format', si.format
                        )
                    END
                    ORDER BY si.created_at DESC
                ), 
            ']'), '[]') AS images,
        COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN sp.id IS NOT NULL THEN JSON_OBJECT(
                            'plan_id', sp.id,
                            'plan_name', sp.name,
                            'plan_description', sp.description,
                            'plan_price', sp.price,
                            'price_unit', sp.price_unit,
                            'plan_features', sp.features,
                            'plan_delivery_time', sp.delivery_time,
                            'duration_unit', sp.duration_unit
                        )
                    END
                    ORDER BY sp.created_at ASC
                ), 
            ']'), '[]') AS plans,
        CASE
            WHEN st.thumbnail_id IS NOT NULL THEN JSON_OBJECT(
                'id', st.thumbnail_id,
                'url', st.image_url,
                'width', st.width,
                'height', st.height,
                'size', st.size,
                'format', st.format
            )
            ELSE NULL
        END AS thumbnail,
        u.user_id AS publisher_id,
        u.first_name AS publisher_first_name,
        u.last_name AS publisher_last_name,
        u.email AS publisher_email,
        u.is_email_verified AS publisher_email_verified,
        u.profile_pic_url AS publisher_profile_pic_url,
        u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
        u.created_at AS publisher_created_at,
        ci.online AS user_online_status,
        CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
        ub.created_at AS bookmarked_at,

        -- Columns for union consistency
        NULL AS product_id,
        NULL AS name,
        NULL AS description,
        NULL AS price,
        NULL AS price_unit,
        NULL AS company,
        NULL AS age_min,
        NULL AS age_max,
        NULL AS marital_statuses,
        NULL AS salary_unit,
        NULL AS salary_min,
        NULL AS salary_max,
        NULL AS local_job_id

    FROM services s
    LEFT JOIN service_images si ON s.service_id = si.service_id
    LEFT JOIN service_plans sp ON s.service_id = sp.service_id
    LEFT JOIN service_thumbnail st ON s.service_id = st.service_id
    INNER JOIN users u ON s.created_by = u.user_id
    INNER JOIN industries i ON s.industry = i.industry_id
    LEFT JOIN user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?
    LEFT JOIN chat_info ci ON u.user_id = ci.user_id
    GROUP BY s.service_id

    UNION ALL

    -- Used product listings
    SELECT
        'used_product_listing' AS type,
        s.product_id AS item_id,
        s.id AS id,
        1 AS p_type,
        NULL AS service_id,
        NULL AS title,
        NULL AS short_description,
        NULL AS long_description,
        NULL AS industry,
        s.status,
        s.short_code,
        s.country,
        s.state,
        COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN si.id IS NOT NULL THEN JSON_OBJECT(
                            'image_id', si.id,
                            'image_url', si.image_url,
                            'width', si.width,
                            'height', si.height,
                            'size', si.size,
                            'format', si.format
                        )
                    END
                    ORDER BY si.created_at DESC
                ), 
            ']'), '[]') AS images,
        NULL AS plans,
        NULL AS thumbnail,
        u.user_id AS publisher_id,
        u.first_name AS publisher_first_name,
        u.last_name AS publisher_last_name,
        u.email AS publisher_email,
        u.is_email_verified AS publisher_email_verified,
        u.profile_pic_url AS publisher_profile_pic_url,
        u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
        u.created_at AS publisher_created_at,
        ci.online AS user_online_status,
        CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
        ub.created_at AS bookmarked_at,

        s.product_id AS product_id,
        s.name,
        s.description,
        s.price,
        s.price_unit,
        NULL AS company,
        NULL AS age_min,
        NULL AS age_max,
        NULL AS marital_statuses,
        NULL AS salary_unit,
        NULL AS salary_min,
        NULL AS salary_max,
        NULL AS local_job_id

    FROM used_product_listings s
    LEFT JOIN used_product_listing_images si ON s.product_id = si.product_id
    INNER JOIN users u ON s.created_by = u.user_id
    LEFT JOIN user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?
    LEFT JOIN chat_info ci ON u.user_id = ci.user_id
    GROUP BY s.product_id

    UNION ALL

    -- Local jobs
    SELECT
        'local_job' AS type,
        l.local_job_id AS item_id,
        l.id AS id,
        2 AS p_type,
        NULL AS service_id,
        l.title,
        NULL AS short_description,
        NULL AS long_description,
        NULL AS industry,
        l.status,
        l.short_code,
        l.country,
        l.state,
        COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN li.id IS NOT NULL THEN JSON_OBJECT(
                            'image_id', li.id,
                            'image_url', li.image_url,
                            'width', li.width,
                            'height', li.height,
                            'size', li.size,
                            'format', li.format
                        )
                    END
                    ORDER BY li.created_at DESC
                ), 
            ']'), '[]') AS images,
        NULL AS plans,
        NULL AS thumbnail,
        u.user_id AS publisher_id,
        u.first_name AS publisher_first_name,
        u.last_name AS publisher_last_name,
        u.email AS publisher_email,
        u.is_email_verified AS publisher_email_verified,
        u.profile_pic_url AS publisher_profile_pic_url,
        u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
        u.created_at AS publisher_created_at,
        ci.online AS user_online_status,
        CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
        ub.created_at AS bookmarked_at,

        NULL AS product_id,
        NULL AS name,
        NULL AS description,
        NULL AS price,
        NULL AS price_unit,
        l.company,
        l.age_min,
        l.age_max,
        l.marital_statuses,
        l.salary_unit,
        l.salary_min,
        l.salary_max,
        l.local_job_id AS local_job_id

    FROM local_jobs l
    LEFT JOIN local_job_images li ON l.local_job_id = li.local_job_id
    INNER JOIN users u ON l.created_by = u.user_id
    LEFT JOIN user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?
    LEFT JOIN chat_info ci ON u.user_id = ci.user_id
    GROUP BY l.local_job_id

) AS all_bookmarks
`;
        const params = [userId, userId, userId];

        const payload = nextToken ? decodeCursor(nextToken) : null;

        if (payload) {
            query += 'WHERE (bookmarked_at < ? OR (bookmarked_at = ? AND p_type > ?) OR (bookmarked_at = ? AND p_type = ? AND id > ?))';
            params.push(
                payload.bookmarked_at,
                payload.bookmarked_at, payload.p_type,
                payload.bookmarked_at, payload.p_type, payload.id
            );
        }

        query += ` ORDER BY all_bookmarks.bookmarked_at DESC, all_bookmarks.p_type ASC, all_bookmarks.id ASC LIMIT ?`;

        params.push(pageSize);

        const [bookmarkRows] = await db.execute(query, params);

        if (bookmarkRows.length === 0) return {
            data: [],
            next_token: null,
            previous_token: null
        };

        const items = [];

        let lastItem = null

        bookmarkRows.forEach(async (row, index) => {
            const itemId = `${row.type}_${row.item_id}`;
            if (!items[itemId]) {
                if(row.type == 'service'){
                    try {
                        const publisher_id = row.publisher_id;
                        const result = await Service.getUserPublishedServicesFeedUser(publisher_id, publisher_id);
                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }
                        items[itemId] = {
                            type:"service",
                            user: {
                                user_id: row.publisher_id,
                                first_name: row.publisher_first_name,
                                last_name: row.publisher_last_name,
                                email: row.publisher_email,
                                is_email_verified: !!row.publisher_email_verified,
                                profile_pic_url: row.publisher_profile_pic_url
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url
                                    : null,

                                profile_pic_url_96x96: row.publisher_profile_pic_url
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url_96x96
                                    : null,
                                online: Boolean(row.user_online_status),
                                created_at: new Date(row.publisher_created_at).getFullYear().toString()
                            },
                            created_services: result,
                            service_id: serviceId,
                            title: row.title,
                            short_description: row.short_description,
                            long_description: row.long_description,
                            industry: row.industry,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            short_code: BASE_URL + "/service/" + row.short_code,
                            thumbnail: row.thumbnail ? {
                                ...JSON.parse(row.thumbnail),
                                url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url // Prepend the base URL to the thumbnail URL
                            } : null,
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url // Prepend the base URL to the image URL
                            })) : [],
                            plans: row.plans
                                ? JSON.parse(row.plans).map(plan => ({
                                    ...plan,
                                    plan_features: plan.plan_features
                                        ? (typeof plan.plan_features === "string" ? JSON.parse(plan.plan_features) : plan.plan_features)
                                        : []
                                }))
                                : [],
                            is_bookmarked: Boolean(row.is_bookmarked),
                            bookmarked_at: row.bookmarked_at,
                            location:
                                row.longitude &&
                                    row.latitude &&
                                    row.geo &&
                                    row.location_type
                                    ? {
                                        longitude: row.longitude,
                                        latitude: row.latitude,
                                        geo: row.geo,
                                        location_type: row.location_type
                                    }
                                    : null

                        };
                    } catch (error) {
                        throw new Error("Error processing service data");
                    }
                }else if(row.type == 'used_product_listing'){
                    try {
                        const publisher_id = row.publisher_id;
                        const result = await UsedProductListing.getUserPublishedUsedProductListingsFeedUser(publisher_id, publisher_id);
                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }
                        items[itemId] = {
                            type:'used_product_listing',
                            user: {
                                user_id: row.publisher_id,
                                first_name: row.publisher_first_name,
                                last_name: row.publisher_last_name,
                                email: row.publisher_email,
                                is_email_verified: !!row.publisher_email_verified,
                                profile_pic_url: row.publisher_profile_pic_url
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url
                                    : null,

                                profile_pic_url_96x96: row.publisher_profile_pic_url
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url_96x96
                                    : null,
                                online: Boolean(row.user_online_status),
                                created_at: new Date(row.publisher_created_at).getFullYear().toString()
                            },
                            created_used_product_listings: result,
                            product_id: productId,
                            name: row.name,
                            description: row.description,
                            price: row.price,
                            price_unit: row.price_unit,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            short_code: BASE_URL + "/service/" + row.short_code,

                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url // Prepend the base URL to the image URL
                            })) : [],

                            is_bookmarked: Boolean(row.is_bookmarked),
                            bookmarked_at: row.bookmarked_at,
                            location:
                                row.longitude &&
                                    row.latitude &&
                                    row.geo &&
                                    row.location_type
                                    ? {
                                        longitude: row.longitude,
                                        latitude: row.latitude,
                                        geo: row.geo,
                                        location_type: row.location_type
                                    }
                                    : null
                        };
                    } catch (error) {
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }else if(row.type =='local_job'){
                    try {
                        items[itemId] = {
                            item:"local_job",
                            user: {
                                user_id: row.publisher_id,
                                first_name: row.publisher_first_name,
                                last_name: row.publisher_last_name,
                                email: row.publisher_email,
                                is_email_verified: !!row.publisher_email_verified,
                                profile_pic_url: row.publisher_profile_pic_url
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url
                                    : null,
                                profile_pic_url_96x96: row.publisher_profile_pic_url_96x96
                                    ? PROFILE_BASE_URL + "/" + row.publisher_profile_pic_url_96x96
                                    : null,
                                created_at: new Date(row.publisher_created_at).getFullYear().toString(),
                            },
                            local_job_id: row.local_job_id,
                            title: row.title,
                            description: row.description,
                            company: row.company,
                            age_min: row.age_min,
                            age_max: row.age_max,
                            marital_statuses: JSON.parse(row.marital_statuses),
                            salary_unit: row.salary_unit,
                            salary_min: row.salary_min,
                            salary_max: row.salary_max,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            short_code: BASE_URL + "/local-job/" + row.short_code,
                            is_bookmarked: Boolean(row.is_bookmarked),
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url
                            })) : [],
                            location: row.longitude ? {
                                longitude: row.longitude,
                                latitude: row.latitude,
                                geo: row.geo,
                                location_type: row.location_type
                            } : null
                        };
                    } catch (error) {
                        throw new Error("Error processing service data");
                    }
                }
                 
                if (index == results.length - 1) lastItem = {
                    bookmarked_at: row.bookmarked_at,
                    p_type: row.p_type,
                    id: row.id
                }
            }
        });

        const allItems = Object.values(items)
        const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
        const hasPreviousPage = payload != null;
        const payloadToEncode = hasNextPage && lastItem ? {
            bookmarked_at: row.bookmarked_at,
            p_type: row.p_type,
            id: row.id
        } : null;


        console.log(allItems);

        return {
            data: allItems,
            next_token: payloadToEncode ? encodeCursor(
                payloadToEncode
            ) : null,
            previous_token: hasPreviousPage ? nextToken : null
        };
    }
}

module.exports = App;