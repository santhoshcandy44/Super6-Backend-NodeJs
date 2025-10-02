
const { PROFILE_BASE_URL, MEDIA_BASE_URL, BASE_URL } = require('../config/config');
const db = require('../config/database');
const jobsDb = require('../config/lts360JobsDatabase');
const { encrypt } = require('../utils/authUtils');
const Service = require('./Service');
const UsedProductListing = require('./UsedProdctListing');

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

    static async getUserBookmarks(userId) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );
        if (userCheckResult.length === 0) throw new Error('User is not exist.');

        let query = `
            (
              SELECT 'service' AS type, s.service_id AS id, ub.created_at AS bookmarked_at
              FROM services s
              INNER JOIN user_bookmark_services ub ON s.service_id = ub.service_id
              WHERE ub.user_id = ?
            )
            UNION ALL
            (
              SELECT 'used_product_listing' AS type, p.product_id AS id, ub.created_at AS bookmarked_at
              FROM used_product_listings p
              INNER JOIN user_bookmark_used_product_listings ub ON p.product_id = ub.product_id
              WHERE ub.user_id = ?
            )
            UNION ALL
            (
              SELECT 'local_job' AS type, l.local_job_id AS id, ub.created_at AS bookmarked_at
              FROM local_jobs l
              INNER JOIN user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id
              WHERE ub.user_id = ?
            )
        `;
        const params =  [userId, userId, userId];

        if (!lastTimeStamp) {
            query += ` AND ub.created_at < CURRENT_TIMESTAMP`;
        } else {
            query += ` AND ub.created_at < ?`;
            params.push(lastTimeStamp);
        }

        query += ` ORDER BY bookmarked_at DESC LIMIT ? OFFSET ?`;

        const offset = (page - 1) * pageSize;

        params.push(pageSize, offset);

        const [bookmarkRows] = await db.execute(query, params);

        if (bookmarkRows.length === 0) {
            return [];
        }

        const serviceIds = bookmarkRows.filter(r => r.type === 'service').map(r => r.id);
        const productIds = bookmarkRows.filter(r => r.type === 'used_product_listing').map(r => r.id);
        const localJobIds = bookmarkRows.filter(r => r.type === 'local_job').map(r => r.id);

        let services = {};
        let usedProducts = {};
        let localJobs = {};

        if (serviceIds.length) {
            const [results] = await db.execute(`               
            SELECT
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
                ORDER BY sp.created_at ASC  -- Order by plan_id in ascending order
            ), 
        ']'), '[]') AS plans,  -- Ensure it returns an empty array if no plans
    
    
    
           
          CASE
            WHEN st.thumbnail_id IS NOT NULL THEN 
                JSON_OBJECT(
                    'id', st.thumbnail_id,
                    'url', st.image_url,
                    'width', st.width,
                    'height', st.height,
                    'size', st.size,
                    'format', st.format
                )
            ELSE
                NULL  -- Return null if no result is found
        END AS thumbnail,
     
    
                u.user_id AS publisher_id,
                u.first_name AS publisher_first_name,
                u.last_name AS publisher_last_name,
                u.email AS publisher_email,
                u.is_email_verified AS publisher_email_verified,
                u.profile_pic_url AS publisher_profile_pic_url,
                u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,
    
        -- User online status (0 = offline, 1 = online)
        ci.online AS user_online_status,
    
                CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
    
                ub.created_at As bookmarked_at
    
            FROM
                services s
            LEFT JOIN
                service_images si ON s.service_id = si.service_id
            LEFT JOIN
                service_plans sp ON s.service_id = sp.service_id
    
            LEFT JOIN service_thumbnail st ON s.service_id = st.service_id
    
            INNER JOIN
                users u ON s.created_by = u.user_id
            INNER JOIN
                industries i ON s.industry = i.industry_id
            LEFT JOIN
                user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?
    
                LEFT JOIN
        chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
        
            WHERE
                ub.user_id = ? AND s.service_id IN (?)
                GROUP BY service_id 
                `, [userId, userId, serviceIds]);

            await (async () => {
                for (const row of results) {
                    const serviceId = row.service_id;
                    const date = new Date(row.created_at);
                    const createdAtYear = date.getFullYear().toString();
                    if (!services[serviceId]) {
                        try {
                            const publisher_id = row.publisher_id;
                            const result = await Service.getUserPublishedServicesFeedUser(publisher_id, publisher_id);
                            if (!result) {
                                throw new Error("Failed to retrieve published services of the user");
                            }
                            services[serviceId] = {
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
                                    created_at: createdAtYear
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
                    }
                }
            })();
        }

        if (productIds.length) {
            const [usedProductResults] = await db.execute(`       
            SELECT
                s.product_id AS product_id,
                s.name,
                s.description,
                s.price,
                s.price_unit,
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
    
                u.user_id AS publisher_id,
                u.first_name AS publisher_first_name,
                u.last_name AS publisher_last_name,
                u.email AS publisher_email,
                u.is_email_verified AS publisher_email_verified,
                u.profile_pic_url AS publisher_profile_pic_url,
                u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,
    
        -- User online status (0 = offline, 1 = online)
        ci.online AS user_online_status,
    
                CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,

                ub.created_at As bookmarked_at

            FROM
                used_product_listings s
            LEFT JOIN
                used_product_listing_images si ON s.product_id = si.product_id
        
            INNER JOIN
                users u ON s.created_by = u.user_id
       
            LEFT JOIN
                user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?
    
                LEFT JOIN
        chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
        
            WHERE
                ub.user_id = ? AND s.product_id IN (?)
                GROUP BY product_id
                `, [userId, userId, productIds]);
            await (async () => {
                for (const row of usedProductResults) {
                    const productId = row.product_id;
                    const date = new Date(row.created_at);
                    const createdAtYear = date.getFullYear().toString();
                    if (!usedProducts[productId]) {
                        try {
                            const publisher_id = row.publisher_id;
                            const result = await UsedProductListing.getUserPublishedUsedProductListingsFeedUser(publisher_id, publisher_id);
                            if (!result) {
                                throw new Error("Failed to retrieve published services of the user");
                            }
                            usedProducts[productId] = {
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
                                    created_at: createdAtYear
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
                    }
                }
            })();
        }

        if (localJobIds.length) {
            const [localJobResults] = await db.execute(`
                SELECT
                    l.local_job_id AS local_job_id,
                    l.title,
                    l.description,
                    l.company,
                    l.age_min,
                    l.age_max,
                    l.marital_statuses,
                    l.salary_unit,
                    l.salary_min,
                    l.salary_max,
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
        
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                                u.created_at AS created_at,
        
            -- User online status (0 = offline, 1 = online)
            ci.online AS user_online_status,
        
                    CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
    
                    ub.created_at As bookmarked_at
                FROM
                    local_jobs l
                    
                LEFT JOIN
                    local_job_images li ON l.local_job_id = li.local_job_id
            
                INNER JOIN
                    users u ON l.created_by = u.user_id
                   
                    LEFT JOIN
            chat_info ci ON u.user_id = ci.user_id  
    
                LEFT JOIN
                    user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?
    
                WHERE
                    ub.user_id = ? 
                    GROUP BY local_job_id AND l.local_job_id IN (?)
                    `, [userId, userId, localJobIds]);
    
            await (async () => {
                for (const row of localJobResults) {
                    const localJobId = row.local_job_id;
                    if (!localJobs[localJobId]) {
                        try {
                            localJobs[localJobId] = {
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
                }
            })();
        }

        const combinedResults = [
            ...Object.values(services).map(s => ({
                type: "service",
                ...s
            })),
            ...Object.values(usedProducts).map(up => ({
                type: "used_product_listing",
                ...up
            })),
            ...Object.values(localJobs).map(l => ({
                type: "local_job",
                ...l
            }))
        ].sort((a, b) => new Date(b.bookmarked_at || 0) - new Date(a.bookmarked_at || 0));

        return Object.values(combinedResults);
    }
}


module.exports = App;