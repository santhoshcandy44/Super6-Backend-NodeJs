const db = require('../config/database')
const sharp = require('sharp');
const he = require('he');
const { BASE_URL, PROFILE_BASE_URL, MEDIA_BASE_URL } = require('../config/config');
const { uploadToS3, deleteFromS3, deleteDirectoryFromS3 } = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');
const { decodeCursor, encodeCursor } = require('./utils/pagination/cursor.js');

class Service {
    static async getServices(userId, queryParam, pageSize, nextToken, initialRadius = 50) {
        const connection = await db.getConnection();
        const [userCoords] = await connection.execute(
            'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
            [userId]
        );

        const userCoordsData = userCoords[0];

        let query, params;
        var radius = initialRadius;
        const payload = nextToken ? decodeCursor(nextToken) : null;

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }
                query = `
                    SELECT
                        s.id,
                        s.service_id AS service_id,
                        s.title,
                        s.short_description,
                        s.long_description,
                        s.industry AS industry,
                        s.status,
                        s.short_code,
                        s.country,
                        s.state, 
                        s.created_at,

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
                    'price_unit',sp.price_unit,
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

        
                        sl.longitude,
                        sl.latitude,
                        sl.geo,
                        sl.location_type,
                        u.user_id AS publisher_id,
                        u.first_name AS publisher_first_name,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS publisher_created_at,

                                ci.online AS user_online_status,

                        CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,

                        ST_Distance_Sphere(
                            POINT(?, ?),
                            POINT(sl.longitude, sl.latitude)
                        ) * 0.001 AS distance,

                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS short_description_relevance,
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS long_description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                   
                        FROM
                        services s
                    LEFT JOIN
                        service_images si ON s.service_id = si.service_id
                    LEFT JOIN
                        service_plans sp ON s.service_id = sp.service_id
                    LEFT JOIN
                        service_locations sl ON s.service_id = sl.service_id

                             LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id   

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?

                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180`;

                params = [
                    userLon, userLat,
                    queryParam, queryParam, queryParam, queryParam, queryParam, queryParam,
                    userId, userLat, userLon
                ];

                if (payload?.total_relevance) {
                    query += ` GROUP BY service_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    short_description_relevance > 0 OR
                                    long_description_relevance > 0
                                ) AND (
                                (total_relevance = ? AND distance <= ?)
                                OR (total_relevance < ? AND distance <= ?)
                            )`;
                    params.push(radius, payload.total_relevance, radius, payload.total_relevance, radius);
                } else {
                    query += ` GROUP BY service_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    short_description_relevance > 0 OR
                                    long_description_relevance > 0
                                )`;
                    params.push(radius);
                }

                if (payload) {
                    query += ` AND (
                            distance > ? 
                            OR (distance = ? AND total_relevance < ?) 
                            OR (distance = ? AND total_relevance = ? AND s.created_at < ?) 
                            OR (distance = ? AND total_relevance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.distance,
                        payload.distance,
                        payload.total_relevance,
                        payload.distance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.distance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` ORDER BY
                            distance ASC,
                            total_relevance DESC,
                            s.created_at DESC,
                            s.id ASC
                        LIMIT ?`;

                params.push(pageSize);

            } else {
                query = `
                    SELECT
    s.id,                  
    s.service_id AS service_id,
    s.title,
    s.short_description,
    s.long_description,
    s.industry AS industry,
    s.status,
     s.short_code,
        s.country,
                        s.state, 
     s.created_at,

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
                    'price_unit',sp.price_unit,
                    'plan_features', sp.features,
                    'plan_delivery_time', sp.delivery_time,
                    'duration_unit',sp.duration_unit
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
      

    sl.longitude,
    sl.latitude,
    sl.geo,
    sl.location_type,
    u.user_id AS publisher_id,
    u.first_name AS publisher_first_name,
    u.about AS about,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
    u.created_at AS publisher_created_at,

      -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

    CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,

    
     ST_Distance_Sphere(
        POINT(?, ?),
        POINT(sl.longitude, sl.latitude)
    ) * 0.001 AS distance
    
FROM
    services s
LEFT JOIN
    service_images si ON s.service_id = si.service_id
LEFT JOIN
    service_plans sp ON s.service_id = sp.service_id
LEFT JOIN
    service_locations sl ON s.service_id = sl.service_id

         LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id    

INNER JOIN
    users u ON s.created_by = u.user_id


LEFT JOIN
    user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?

    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

WHERE
    sl.latitude BETWEEN -90 AND 90
    AND sl.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180 

    AND (
      (SELECT COUNT(*) FROM user_industries ui WHERE ui.user_id = ? ) = 0  
      OR s.industry IN (SELECT ui.industry_id FROM user_industries ui WHERE ui.user_id = ?))`;

                params = [
                    userLon, userLat,
                    userId, userLat, userLon,
                    userId, userId
                ];

              query += ` GROUP BY service_id HAVING distance < ?`;
              params.push(radius);

                if (payload) {
                    query += ` AND (
                            distance > ? 
                            OR (distance = ? AND s.created_at < ?) 
                            OR (distance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.distance,
                        payload.distance,
                        payload.created_at,
                        payload.distance,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` ORDER BY
        distance ASC,
        s.created_at DESC,
        s.id ASC
    LIMIT ?`;

                params.push(pageSize);
            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
                    SELECT
                        s.id,
                        s.service_id AS service_id,
                        s.title,
                        s.short_description,
                        s.long_description,
                        s.industry AS industry,
                        s.status,
                        s.short_code,
                           s.country,
                        s.state, 
                        s.created_at,
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
                    'price_unit',sp.price_unit,
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

        
                        sl.longitude,
                        sl.latitude,
                        sl.geo,
                        sl.location_type,
                        u.user_id AS publisher_id,
                        u.first_name AS publisher_first_name,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS publisher_created_at,
                                -- User online status (0 = offline, 1 = online)
                        ci.online AS user_online_status,

                            
                        CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,


                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS short_description_relevance,
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS long_description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                        
                        FROM
                        services s
                    LEFT JOIN
                        service_images si ON s.service_id = si.service_id
                    LEFT JOIN
                        service_plans sp ON s.service_id = sp.service_id
                    LEFT JOIN
                        service_locations sl ON s.service_id = sl.service_id

                             LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id   

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180 `;


                params = [
                    queryParam, queryParam, queryParam,
                    queryParam, queryParam, queryParam,
                    userId
                ];



                if (payload?.total_relevance) {
                    query += ` GROUP BY service_id HAVING
                                (
                                    title_relevance > 0 OR
                                    short_description_relevance > 0 OR
                                    long_description_relevance > 0
                                ) AND (
                                    (total_relevance = ?)
                                    OR (total_relevance < ?)
                                )`;
                    params.push(payload.total_relevance, payload.total_relevance);
                } else {
                    query += ` GROUP BY service_id HAVING
                                (
                                    title_relevance > 0 OR
                                    short_description_relevance > 0 OR
                                    long_description_relevance > 0
                                )`;
                }

                if (payload) {
                    query += ` AND (
                            total_relevance < ? 
                            OR (total_relevance = ? AND s.created_at < ?) 
                            OR (total_relevance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.total_relevance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.total_relevance,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` ORDER BY
                            total_relevance DESC,
                            s.created_at DESC,
                            s.id ASC

                        LIMIT ?`;

                params.push(pageSize);
            } else {
                query = `
                SELECT
                    s.id,
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
                    s.status,
                    s.short_code,
                       s.country,
                        s.state, 
                        s.created_at,


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
                    'price_unit',sp.price_unit,
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


    

                    sl.longitude,
                    sl.latitude,
                    sl.geo,
                    sl.location_type,

                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                        u.created_at AS publisher_created_at,

                        
    -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status, 

                            CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked


                FROM
                    services s
                LEFT JOIN
                    service_images si ON s.service_id = si.service_id
                LEFT JOIN
                    service_plans sp ON s.service_id = sp.service_id
                LEFT JOIN
                    service_locations sl ON s.service_id = sl.service_id
           
                LEFT JOIN
                    service_thumbnail st ON s.service_id = st.service_id
    
                INNER JOIN
                    users u ON s.created_by = u.user_id
                LEFT JOIN
                    user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    
                WHERE
                    sl.latitude BETWEEN -90 AND 90
                    AND sl.longitude BETWEEN -180 AND 180  AND (
      (SELECT COUNT(*) FROM user_industries ui WHERE ui.user_id = ? ) = 0  
      OR s.industry IN (SELECT ui.industry_id FROM user_industries ui WHERE ui.user_id = ?))`;

                params = [userId, userId, userId, userId];

                if (payload) {
                    query += `
                        AND (
                            s.created_at < ?
                            OR (s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.created_at,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` GROUP BY service_id ORDER BY s.created_at DESC, s.id ASC LIMIT ?`;
                params.push(pageSize);
            }
        }

        const [results] = await connection.execute(query, params);

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    radius += 30;
                    await connection.release();
                    return await this.getServices(userId, queryParam, pageSize, nextToken, radius)
                }
            }
        }

        const services = {};
        let lastItem = null

        await (async () => {
            for (let index = 0; index < results.length; index++) {
                const row = results[index];
                const serviceId = row.service_id;
                if (!services[serviceId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        const result = await Service.getFeedUserPublishedServices(userId, publisher_id);
                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }
                        const [commentsResult] = await db.query(`
                    SELECT 
                        (SELECT COUNT(*) FROM service_reviews WHERE service_id = ?) AS comment_count,
                        (SELECT COUNT(*) FROM service_reviews_replies srp 
                         JOIN service_reviews sr ON srp.service_review_id = sr.id 
                         WHERE sr.service_id = ?) AS reply_count
                `, [serviceId, serviceId]);

                        let total_count;
                        if (commentsResult.length > 0) {
                            const { comment_count, reply_count } = commentsResult[0];
                            total_count = comment_count + reply_count
                        } else {
                            total_count = 0;
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
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url
                            })) : [],

                            plans: row.plans
                                ? JSON.parse(row.plans).map(plan => ({
                                    ...plan,
                                    plan_features: plan.plan_features
                                        ? (typeof plan.plan_features === "string" ? JSON.parse(plan.plan_features) : plan.plan_features)
                                        : []
                                }))
                                : [],

                            short_code: BASE_URL + "/service/" + row.short_code,

                            thumbnail: row.thumbnail ? {
                                ...JSON.parse(row.thumbnail),
                                url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url
                            } : null,

                            is_bookmarked: Boolean(row.is_bookmarked),
                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null,
                            location: row.longitude && row.latitude && row.geo && row.location_type
                                ? {
                                    longitude: row.longitude,
                                    latitude: row.latitude,
                                    geo: row.geo,
                                    location_type: row.location_type
                                }
                                : null,
                            comments_count: total_count
                        };
                    } catch (error) {
                        throw new Error("Error processing service data");
                    }
                }

                if (index == results.length - 1) lastItem = {
                    distance: row.distance ? row.distance : null,
                    total_relevance: row.total_relevance ? row.total_relevance : null,
                    created_at: row.created_at,
                    id: row.id
                }
            }
        })();

        await connection.release();

        const allItems = Object.values(services)
        const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
        const hasPreviousPage = payload != null;
        const payloadToEncode = hasNextPage && lastItem ? {
            distance: lastItem.distance ? lastItem.distance : null,
            total_relevance: lastItem.total_relevance ? lastItem.total_relevance : null,
            created_at: lastItem.created_at,
            id: lastItem.id
        } : null;

        return {
            data: allItems,
            next_token: payloadToEncode ? encodeCursor(
                payloadToEncode
            ) : null,
            previous_token: hasPreviousPage ? nextToken : null
        };
    }

    static async getGuestServices(userId, queryParam,
        userCoordsData, industryIds,
        pageSize, nextToken, initialRadius = 50) {

        const connection = await db.getConnection();

        let query, params;
        var radius = initialRadius;

        const payload = nextToken ? decodeCursor(nextToken) : null;

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                    VALUES (?, 1, NOW(), ?)
                    ON DUPLICATE KEY UPDATE
                        popularity = popularity + 1,
                        last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
                    SELECT
                        s.id,
                        s.service_id AS service_id,
                        s.title,
                        s.short_description,
                        s.long_description,
                        s.industry AS industry,
                        s.status,
                         s.short_code,
                            s.country,
                        s.state, 
                        s.created_at,

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
                    'price_unit',sp.price_unit,
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


                        sl.longitude,
                        sl.latitude,
                        sl.geo,
                        sl.location_type,
                        u.user_id AS publisher_id,
                        u.first_name AS publisher_first_name,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                        u.created_at AS publisher_created_at,

                           -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

                        ST_Distance_Sphere(
                            POINT(?, ?),
                            POINT(sl.longitude, sl.latitude)
                        ) * 0.001 AS distance,

                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS short_description_relevance,
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS long_description_relevance,
                       

                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                   
                        FROM
                        services s
                    LEFT JOIN
                        service_images si ON s.service_id = si.service_id
                    LEFT JOIN
                        service_plans sp ON s.service_id = sp.service_id
                    LEFT JOIN
                        service_locations sl ON s.service_id = sl.service_id

                             LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id   

                    INNER JOIN
                        users u ON s.created_by = u.user_id
               
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180 `;

                if (industryIds && industryIds.length > 0) {
                    const industryList = industryIds.join(', ');
                    query += ` AND s.industry IN (${industryList})`;
                }

                params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userLat, userLon];
                
                if (payload) {
                    query += `
                        AND (
                            distance > ? 
                            OR (distance = ? AND total_relevance < ?) 
                            OR (distance = ? AND total_relevance = ? AND s.created_at < ?) 
                            OR (distance = ? AND total_relevance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.distance,
                        payload.distance,
                        payload.total_relevance,
                        payload.distance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.distance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.id
                    );
                }

                if (payload?.total_relevance) {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? AND distance <= ?) 
                        OR (total_relevance < ? AND distance <= ?)  
                    ) `;
                    params.push(radius, payload.total_relevance, radius, payload.total_relevance, radius);
                } else {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`;
                    params.push(radius);
                }

                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC,
                        s.created_at,
                        s.id
                    LIMIT ?`;

                params.push(pageSize);
            } else {
                query = `
                    SELECT
    s.id,                   
    s.service_id AS service_id,
    s.title,
    s.short_description,
    s.long_description,
    s.industry AS industry,
    s.status,
     s.short_code,
        s.country,
                        s.state, 
                        s.creaetd_at,

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
                    'price_unit',sp.price_unit,
                    'plan_features', sp.features,
                    'plan_delivery_time', sp.delivery_time,
                    'duration_unit',sp.duration_unit
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


    sl.longitude,
    sl.latitude,
    sl.geo,
    sl.location_type,
    u.user_id AS publisher_id,
    u.first_name AS publisher_first_name,
    u.about AS about,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
    u.created_at AS publisher_created_at,

    ci.online AS user_online_status,
    
     ST_Distance_Sphere(
        POINT(?, ?),
        POINT(sl.longitude, sl.latitude)
    ) * 0.001 AS distance
    
FROM
    services s
LEFT JOIN
    service_images si ON s.service_id = si.service_id
LEFT JOIN
    service_plans sp ON s.service_id = sp.service_id
LEFT JOIN
    service_locations sl ON s.service_id = sl.service_id

         LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id    

INNER JOIN
    users u ON s.created_by = u.user_id

LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
WHERE
    sl.latitude BETWEEN -90 AND 90
    AND sl.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180`;

                if (industryIds && industryIds.length > 0) {
                    const industryList = industryIds.join(', ');
                    query += ` AND s.industry IN (${industryList})`;
                }

                params = [userLon, userLat, userLat, userLon];

        
                if (payload) {
                    query += `
                        AND (
                            distance > ? 
                            OR (distance = ? AND s.created_at < ?) 
                            OR (distance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.distance,
                        payload.distance,
                        payload.created_at,
                        payload.distance,
                        payload.created_at,
                        payload.id
                    );
                }
              
                query += ` GROUP BY service_id HAVING
    distance < ?
    ORDER BY
distance ASC, s.created_at DESC, s.id ASC LIMIT ?`;
                params.push(radius, pageSize);

            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
                    SELECT
                        s.id,
                        s.service_id AS service_id,
                        s.title,
                        s.short_description,
                        s.long_description,
                        s.industry AS industry,
                        s.status,
                        s.short_code,
                           s.country,
                        s.state, 
                        s.created_at,

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
                    'price_unit',sp.price_unit,
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


        
                        sl.longitude,
                        sl.latitude,
                        sl.geo,
                        sl.location_type,
                        u.user_id AS publisher_id,
                        u.first_name AS publisher_first_name,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS publisher_created_at,

                            ci.online AS user_online_status,

                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS short_description_relevance,
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS long_description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.short_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.long_description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                        
                        FROM
                        services s
                    LEFT JOIN
                        service_images si ON s.service_id = si.service_id
                    LEFT JOIN
                        service_plans sp ON s.service_id = sp.service_id
                    LEFT JOIN
                        service_locations sl ON s.service_id = sl.service_id

                             LEFT JOIN
            service_thumbnail st ON s.service_id = st.service_id   

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180 `;

                if (industryIds && industryIds.length > 0) {
                    const industryList = industryIds.join(', ');
                    query += ` AND s.industry IN (${industryList})`;
                }

                params = [queryParam, queryParam, queryParam, queryParam, queryParam, queryParam]

                
                if (payload) {
                    query += `
                        AND (
                            total_relevance < ?
                            OR (total_relevance = ? AND s.created_at < ?) 
                            OR (total_relevance = ? AND s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.total_relevance,
                        payload.total_relevance,
                        payload.created_at,
                        payload.total_relevance,
                        payload.created_at,
                        payload.id
                    );
                }
              

                if (payload?.total_relevance) {
                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;
                    params.push(payload.total_relevance, payload.total_relevance);
                } else {
                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`
                }

                query += ` ORDER BY
                        total_relevance DESC,
                        s.created_at DESC,
                        s.id ASC
                    LIMIT ?`;

                params.push(pageSize);
            } else {
                query = `
                SELECT
                    s.id,
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
                    s.status,
                  s.short_code,
                     s.country,
                        s.state, 
                        s.created_at,

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
                    'price_unit',sp.price_unit,
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


    

                    sl.longitude,
                    sl.latitude,
                    sl.geo,
                    sl.location_type,
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS publisher_created_at,
                        -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

                FROM
                    services s
                LEFT JOIN
                    service_images si ON s.service_id = si.service_id
                LEFT JOIN
                    service_plans sp ON s.service_id = sp.service_id
                LEFT JOIN
                    service_locations sl ON s.service_id = sl.service_id
           
                LEFT JOIN
                    service_thumbnail st ON s.service_id = st.service_id
    
                INNER JOIN
                    users u ON s.created_by = u.user_id
                LEFT JOIN
                    user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?
                    
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                    sl.latitude BETWEEN -90 AND 90
                    AND sl.longitude BETWEEN -180 AND 180`;

                params = [];

                if (industryIds && industryIds.length > 0) {
                    const industryList = industryIds.join(', ');
                    query += ` AND s.industry IN (${industryList})`;
                }

                
                if (payload) {
                    query += `
                        AND (
                            s.created_at < ?
                            OR (s.created_at = ? AND s.id > ?)
                        )
                    `;

                    params.push(
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` GROUP BY service_id ORDER BY s,created_at DESC, s.id ASC LIMIT ?`;
                params.push(pageSize);
            }
        }

        const [results] = await connection.execute(query, params);
        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    radius += 30;
                    await connection.release();
                    return await this.getGuestServices(userId, queryParam, userCoordsData, industryIds, nextToken, pageSize, radius)
                }
            }
        }

        const services = {};
        let lastItem = null

        await (async () => {
            for (let index = 0; index < results.length; index++) {
                const row = results[index];
                const serviceId = row.service_id;
                if (!services[serviceId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        const result = await Service.getFeedUserPublishedServices(userId, publisher_id);

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
                                created_at: new Date(row.publisher_created_at).getFullYear().toString(),
                            },

                            created_services: result,
                            id: row.id,
                            service_id: serviceId,
                            title: row.title,
                            short_description: row.short_description,
                            long_description: row.long_description,
                            industry: row.industry,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url
                            })) : [],

                            plans: row.plans
                                ? JSON.parse(row.plans).map(plan => ({
                                    ...plan,
                                    plan_features: plan.plan_features
                                        ? (typeof plan.plan_features === "string" ? JSON.parse(plan.plan_features) : plan.plan_features)
                                        : []
                                }))
                                : [],

                            short_code: BASE_URL + "/service/" + row.short_code,
                            thumbnail: row.thumbnail ? {
                                ...JSON.parse(row.thumbnail),
                                url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url
                            } : null,

                            is_bookmarked: Boolean(row.is_bookmarked),
                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null,

                            location: row.longitude && row.latitude && row.geo && row.location_type
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
                if (index == results.length - 1) lastItem = {
                    distance: row.distance ? row.distance : null,
                    total_relevance: row.total_relevance ? row.total_relevance : null,
                    created_at: row.created_at,
                    id: row.id
                }
            }
        })();

        await connection.release();
        const allItems = Object.values(services)
        const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
        const hasPreviousPage = payload != null;
        const payloadToEncode = hasNextPage && lastItem ? {
            created_at: lastItem.created_at,
            id: lastItem.id
        } : null;

        return {
            data: allItems,
            next_token: payloadToEncode ? encodeCursor(
                payloadToEncode
            ) : null,
            previous_token: hasPreviousPage ? nextToken : null
        };
    }

    static async getFeedUserPublishedServices(userId, serviceOwnerId, limit = 5) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [serviceOwnerId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }

        const [results] = await db.query(`
                SELECT
                    s.id,
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
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

                    sl.longitude,
                    sl.latitude,
                    sl.geo,
                    sl.location_type,
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS publisher_created_at,

                        -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

                    CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked

                FROM services s
                LEFT JOIN service_images si ON s.service_id = si.service_id
                LEFT JOIN service_plans sp ON s.service_id = sp.service_id
                LEFT JOIN service_locations sl ON s.service_id = sl.service_id
                                
                LEFT JOIN service_thumbnail st ON s.service_id = st.service_id

                LEFT JOIN user_bookmark_services ub ON s.service_id = ub.service_id AND ub.user_id = ?


                INNER JOIN users u ON s.created_by = u.user_id

                LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
    
                WHERE s.created_by = ? GROUP BY service_id limit ?
            `, [userId, serviceOwnerId, limit]);

        const services = {};

        results.forEach(row => {
            const serviceId = row.service_id;
            if (!services[serviceId]) {
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
                        created_at: new Date(row.publisher_created_at).getFullYear().toString()

                    },
                    id: row.id,
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
                        url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url
                    } : null,
                    is_bookmarked: Boolean(row.is_bookmarked),

                    images: row.images ? JSON.parse(row.images).map(image => ({
                        ...image,
                        image_url: MEDIA_BASE_URL + "/" + image.image_url
                    })) : [],

                    plans: row.plans
                        ? JSON.parse(row.plans).map(plan => ({
                            ...plan,
                            plan_features: plan.plan_features
                                ? (typeof plan.plan_features === "string" ? JSON.parse(plan.plan_features) : plan.plan_features)
                                : []
                        }))
                        : [],

                    location: row.longitude && row.latitude && row.geo && row.location_type
                        ? {
                            longitude: row.longitude,
                            latitude: row.latitude,
                            geo: row.geo,
                            location_type: row.location_type
                        }
                        : null,
                    is_bookmarked: Boolean(row.is_bookmarked),
                };
            }
        });

        return Object.values(services);
    }

    static async getUserPublishedServices(userId, pageSize, nextToken) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) throw new Error('User not exist');

        let query = `
                SELECT
                    s.id,
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
                    s.status,
                    s.short_code,
                       s.country,
                        s.state, 
                        s.created_at,
                    
    
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



                    sl.longitude,
                    sl.latitude,
                    sl.geo,
                    sl.location_type,
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS publisher_created_at

                FROM services s
                LEFT JOIN service_images si ON s.service_id = si.service_id
                LEFT JOIN service_plans sp ON s.service_id = sp.service_id
                LEFT JOIN service_locations sl ON s.service_id = sl.service_id

                
               LEFT JOIN service_thumbnail st ON s.service_id = st.service_id


                INNER JOIN users u ON s.created_by = u.user_id
                WHERE s.created_by = ?`;


        const params = [userId];

        const payload = nextToken ? decodeCursor(nextToken) : null;

        if (payload) {
            query += ' AND (s.created_at < ? OR (s.created_at = ? AND s.id > ?))';
            params.push(payload.created_at, payload.created_at, payload.id);
        }

        query += ` GROUP BY service_id 
               ORDER BY s.created_at DESC, s.id ASC
               LIMIT ?`;

        params.push(pageSize);

        const [results] = await db.execute(query, params);

        const services = {};
        let lastItem = null

        results.forEach((row, index) => {
            const serviceId = row.service_id;
            if (!services[serviceId]) {
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
                        created_at: new Date(row.publisher_created_at).getFullYear().toString()
                    },
                    id: row.id,
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
                        url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url
                    } : null,

                    images: row.images ? JSON.parse(row.images).map(image => ({
                        ...image,
                        image_url: MEDIA_BASE_URL + "/" + image.image_url
                    })) : [],

                    plans: row.plans
                        ? JSON.parse(row.plans).map(plan => ({
                            ...plan,
                            plan_features: plan.plan_features
                                ? (typeof plan.plan_features === "string" ? JSON.parse(plan.plan_features) : plan.plan_features)
                                : []
                        }))
                        : [],

                    location: row.longitude && row.latitude && row.geo && row.location_type
                        ? {
                            longitude: row.longitude,
                            latitude: row.latitude,
                            geo: row.geo,
                            location_type: row.location_type
                        }
                        : null
                };
            }

            if (index == results.length - 1) lastItem = {
                created_at: row.created_at,
                id: row.id
            }
        });

        const allItems = Object.values(services)
        const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
        const hasPreviousPage = payload != null;
        const payloadToEncode = hasNextPage && lastItem ? {
            created_at: lastItem.created_at,
            id: lastItem.id
        } : null;

        return {
            data: allItems,
            next_token: payloadToEncode ? encodeCursor(
                payloadToEncode
            ) : null,
            previous_token: hasPreviousPage ? nextToken : null
        };
    }

    static async createService(user_id, title, short_description, long_description, industry, country, state, thumbnail, plans_json, files, locationJson) {
        let connection;

        const uploadedFiles = [];

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [serviceResult] = await connection.execute(
                `INSERT INTO services(created_by, title, short_description, long_description, industry, country, state)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [user_id, title, short_description, long_description, industry, country, state]
            );


            const insertedId = serviceResult.insertId;

            const [serviceResultById] = await connection.execute(
                'SELECT service_id FROM services WHERE id = ?',
                [insertedId]
            );

            const service_id = serviceResultById[0].service_id;

            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            const image_urls = [];


            for (const file of files) {


                const newFileName = `${uuidv4()}-${file.originalname}`;
                const s3Key = `media/${media_id}/services/${service_id}/${newFileName}`;

                const uploadResult = await uploadToS3(file.buffer, s3Key, file.mimetype);
                uploadedFiles.push(uploadResult.Key);

                const metadata = await sharp(file.buffer).metadata();
                image_urls.push({
                    url: s3Key,
                    width: metadata.width,
                    height: metadata.height,
                    size: file.size,
                    format: metadata.format,
                });

            }

            const thumbnailFileName = `${uuidv4()}-${thumbnail.originalname}`;
            const thumbnailS3Key = `media/${media_id}/services/${service_id}/${thumbnailFileName}`;

            const thumbnailUploadResult = await uploadToS3(thumbnail.buffer, thumbnailS3Key, thumbnail.mimetype);
            uploadedFiles.push(thumbnailUploadResult.Key);

            const thumbnail_metadata = await sharp(thumbnail.buffer).metadata();

            const thumbnailUrl = {
                url: thumbnailS3Key,
                width: thumbnail_metadata.width,
                height: thumbnail_metadata.height,
                size: thumbnail_metadata.size,
                format: thumbnail_metadata.format
            };

            await connection.execute(
                `INSERT INTO service_thumbnail (service_id, image_url, width, height, size, format)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [service_id, thumbnailUrl.url, thumbnailUrl.width, thumbnailUrl.height, thumbnailUrl.size, thumbnailUrl.format]
            );

            for (const image of image_urls) {
                await connection.execute(
                    `INSERT INTO service_images (service_id, image_url, width, height, size, format)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [service_id, image.url, image.width, image.height, image.size, image.format]
                );
            }

            const plans = plans_json;
            if (typeof plans !== 'object') {
                throw new Error('Invalid JSON format for plans.');
            }

            for (const plan of plans) {
                await connection.execute(
                    `INSERT INTO service_plans (service_id, name, description, price, price_unit, features, delivery_time, duration_unit)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [service_id, plan.plan_name, plan.plan_description, plan.plan_price, plan.price_unit, JSON.stringify(plan.plan_features), plan.plan_delivery_time,
                        plan.duration_unit]
                );
            }

            const decodedLocation = he.decode(locationJson);

            if (decodedLocation) {
                const location = JSON.parse(decodedLocation);
                const insertLocationText = `
                    INSERT INTO service_locations (service_id, longitude, latitude, geo, location_type)
                    VALUES (?, ?, ?, ?, ?)
                `;
                await connection.execute(insertLocationText, [
                    service_id,
                    location.longitude,
                    location.latitude,
                    location.geo,
                    location.locationType
                ]);
            }

            await connection.commit();
            return { success: true, service_id };
        } catch (error) {
            if (connection) {
                await connection.rollback();
                try {
                    for (const fileKey of uploadedFiles) {
                        await deleteFromS3(fileKey);
                    }
                } catch (deleteError) { }
            }
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async updateServiceDetails(service_id, user_id, title, short_description, long_description, industry) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const updateQuery = `
                UPDATE services
                SET 
                    title = ?, 
                    short_description = ?, 
                    long_description = ?, 
                    industry = ?
                WHERE service_id = ? AND created_by = ?`;

            const [updateResult] = await connection.execute(updateQuery, [
                title,
                short_description,
                long_description,
                industry,
                service_id,
                user_id
            ]);

            if (updateResult.affectedRows === 0) {
                throw new Error('No rows were updated, service or user not found');
            }

            const selectQuery = `
                SELECT
                    s.id,
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
                    s.country,
                    s.status
                FROM
                    services s
                WHERE
                    s.service_id = ? AND s.created_by = ?`;

            const [rows] = await connection.execute(selectQuery, [service_id, user_id]);

            if (rows.length === 0) {
                throw new Error('Service not exist');
            }

            await connection.commit();
            return rows.length > 0 ? rows[0] : null;

        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) await connection.release();
        }
    }

    static async updateOrInsertLocation(service_id, longitude, latitude, geo, location_type) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const query = `
                INSERT INTO service_locations (service_id, longitude, latitude, geo, location_type)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    longitude = VALUES(longitude),
                    latitude = VALUES(latitude),
                    geo = VALUES(geo),
                    location_type = VALUES(location_type);
            `;

            const [result] = await connection.execute(query, [service_id, longitude, latitude, geo, location_type]);

            const isUpdated = result.affectedRows > 0;
            const isNewInsert = result.insertId > 0;

            let updatedRow = null;
            if (isUpdated || isNewInsert) {
                const selectQuery = `
                    SELECT service_id, longitude, latitude, geo, location_type
                    FROM service_locations
                    WHERE service_id = ?;
                `;
                const [rows] = await connection.execute(selectQuery, [service_id]);
                updatedRow = rows[0];
            }

            await connection.commit();
            return {
                success: true,
                isUpdated,
                isNewInsert,
                updatedRow
            };
        } catch (err) {
            if (connection) await connection.rollback();
            throw err;
        } finally {
            if (connection) await connection.release();
        }
    }

    static async updateServicePlans(serviceId, data) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const updateSql = `
                UPDATE service_plans 
                SET name = ?, description = ?, price = ?, price_unit = ?, features = ?, delivery_time = ?, duration_unit = ?
                WHERE id = ?`;

            const insertSql = `
                INSERT INTO service_plans (service_id, name, description, price, price_unit, features, delivery_time, duration_unit) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

            const deleteSql = `DELETE FROM service_plans WHERE id = ?`;

            const currentPlansSql = `SELECT id FROM service_plans WHERE service_id = ?`;
            const [currentPlansResult] = await connection.execute(currentPlansSql, [serviceId]);

            const existingPlanIds = currentPlansResult.map(row => row.id);
            const planIdsInInput = [];
            const newlyInsertedPlanIds = [];

            for (const plan of data) {
                const planId = plan.plan_id || -1;
                const name = plan.plan_name || '';
                const description = plan.plan_description || '';
                const price = plan.plan_price || 0;
                const priceUnit = plan.price_unit || '';
                const features = JSON.stringify(plan.plan_features || {});
                const deliveryTime = plan.plan_delivery_time || '';
                const durationUnit = plan.duration_unit || '';

                if (planId === -1) {
                    const [insertResult] = await connection.execute(insertSql, [
                        serviceId, name, description, price, priceUnit, features, deliveryTime, durationUnit
                    ]);
                    newlyInsertedPlanIds.push(insertResult.insertId);
                } else {
                    await connection.execute(updateSql, [
                        name, description, price, priceUnit, features, deliveryTime, durationUnit, planId
                    ]);
                    planIdsInInput.push(planId);
                }
            }

            const allValidPlanIds = [...planIdsInInput, ...newlyInsertedPlanIds];

            for (const existingPlanId of existingPlanIds) {
                if (!allValidPlanIds.includes(existingPlanId)) {
                    await connection.execute(deleteSql, [existingPlanId]);
                }
            }

            const allPlans = `SELECT id As plan_id, name as plan_name, description as plan_description,
            price as plan_price, price_unit as price_unit, delivery_time as plan_delivery_time, duration_unit as duration_unit, features as plan_features
            FROM service_plans WHERE service_id = ?`;

            const [rows] = await connection.execute(allPlans, [serviceId]);
            await connection.commit();

            const result = rows.map(row => {
                return {
                    ...row,
                    plan_features: row.plan_features ? JSON.parse(row.plan_features) : []
                };
            });

            return result.length > 0 ? result : null;
        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) await connection.release();
        }
    }

    static async createImage(user_id, service_id, file) {
        let connection;
        let s3Key;

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            const fileName = `${uuidv4()}-${file.originalname}`;
            s3Key = `media/${media_id}/services/${service_id}/${fileName}`;

            const metadata = await sharp(file.buffer).metadata();

            let contentType;
            switch (metadata.format) {
                case 'jpeg':
                    contentType = 'image/jpeg';
                    break;
                case 'png':
                    contentType = 'image/png';
                    break;
                case 'gif':
                    contentType = 'image/gif';
                    break;
                default:
                    contentType = file.mimetype;
                    break;
            }

            await uploadToS3(file.buffer, s3Key, contentType);

            const image = {
                url: s3Key,
                width: metadata.width,
                height: metadata.height,
                size: file.size,
                format: metadata.format
            };

            const [result] = await connection.execute(
                `INSERT INTO service_images (service_id, image_url, width, height, size, format)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [service_id, image.url, image.width, image.height, image.size, image.format]
            );

            const insertedImageId = result.insertId;
            await connection.commit();

            const [rows] = await connection.execute(
                `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                [service_id, insertedImageId]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (connection) {
                await connection.rollback();
                if (s3Key) {
                    try {
                        await deleteFromS3(s3Key);
                    } catch (err) { }
                }
            }
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async updateImage(user_id, service_id, imageId, file) {
        let connection;
        let s3Key;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );
            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            const fileName = `${uuidv4()}-${file.originalname}`;
            s3Key = `media/${media_id}/services/${service_id}/${fileName}`;

            const metadata = await sharp(file.buffer).metadata();
            let contentType;

            switch (metadata.format) {
                case 'jpeg':
                    contentType = 'image/jpeg';
                    break;

                case 'png':
                    contentType = 'image/png';
                    break;

                case 'gif':
                    contentType = 'image/gif';
                    break;
                default:
                    contentType = file.mimetype;
                    break;
            }

            await uploadToS3(file.buffer, s3Key, contentType);

            const newImage = {
                url: s3Key,
                width: metadata.width,
                height: metadata.height,
                size: file.size,
                format: metadata.format
            };

            if (imageId === -1) {
                const [result] = await connection.execute(
                    `INSERT INTO service_images (image_url, width, height, size, format) 
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        image_url = VALUES(image_url),
                        width = VALUES(width),
                        height = VALUES(height),
                        size = VALUES(size),
                        format = VALUES(format);`,
                    [newImage.url, newImage.width, newImage.height, newImage.size, newImage.format]
                );

                await connection.commit();
                const insertedId = result.insertId;

                const [output] = await connection.execute(
                    `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                    [service_id, insertedId]
                );

                return output.length > 0 ? output[0] : null;
            } else {
                const [rows] = await connection.execute(
                    'SELECT image_url FROM service_images WHERE service_id = ? AND id = ?',
                    [service_id, imageId]
                );

                if (rows.length === 0) {
                    throw new Error('Image not found.');
                }
                const oldImageUrl = rows[0].image_url;
                const oldS3Key = oldImageUrl.replace(BASE_URL, '');
                await connection.execute(
                    `UPDATE service_images
                    SET image_url = ?, width = ?, height = ?, size = ?, format = ?
                    WHERE id = ?`,
                    [newImage.url, newImage.width, newImage.height, newImage.size, newImage.format, imageId]
                );
                await connection.commit();
                if (oldS3Key) {
                    try {
                        await deleteFromS3(oldS3Key);
                    } catch (err) { }
                }

                const [output] = await connection.execute(
                    `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                    [service_id, imageId]
                );
                return output.length > 0 ? output[0] : null;
            }
        } catch (error) {
            if (connection) {
                await connection.rollback();
                if (s3Key) {
                    try {
                        await deleteFromS3(s3Key);
                    } catch (err) { }
                }
            }
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async deleteServiceImage(serviceId, imageId) {
        let connection;
        let s3Key;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                'SELECT image_url FROM service_images WHERE service_id = ? AND id = ?',
                [serviceId, imageId]
            );

            if (rows.length === 0) {
                throw new Error('Image not found.');
            }

            const imageUrl = rows[0].image_url;
            s3Key = imageUrl.replace(BASE_URL, '');
            const [deleteResult] = await connection.execute(
                'DELETE FROM service_images WHERE service_id = ? AND id = ?',
                [serviceId, imageId]
            );

            if (deleteResult.affectedRows === 0) {
                throw new Error('Failed to delete image record.');
            }

            await connection.commit();

            try {
                await deleteFromS3(s3Key);
            } catch (err) { }
            return {
                success: true,
                message: 'Image deleted successfully'
            };

        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) await connection.release();
        }
    }

    static async updateThumbnail(user_id, service_id, imageId, file) {
        let connection;
        let s3Key;

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            if (imageId === -1) {
                const newFileName = `${uuidv4()}-${file.originalname}`;
                const metadata = await sharp(file.buffer).metadata();
                let contentType;
                switch (metadata.format) {
                    case 'jpeg':
                        contentType = 'image/jpeg';
                        break;
                    case 'png':
                        contentType = 'image/png';
                        break;
                    case 'gif':
                        contentType = 'image/gif';
                        break;
                    default:
                        contentType = file.mimetype;
                        break;
                }

                s3Key = `media/${media_id}/services/${service_id}/${newFileName}`

                await uploadToS3(file.buffer, s3Key, contentType);

                const newImage = {
                    url: s3Key,
                    width: metadata.width,
                    height: metadata.height,
                    size: metadata.size,
                    format: metadata.format
                };

                const [result] = await connection.execute(
                    `INSERT INTO service_thumbnail (service_id, image_url, width, height, size, format) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        image_url = VALUES(image_url),
                        width = VALUES(width),
                        height = VALUES(height),
                        size = VALUES(size),
                        format = VALUES(format);`,
                    [service_id, newImage.url, newImage.width, newImage.height, newImage.size, newImage.format]
                );

                await connection.commit();
                const insertedId = result.insertId;

                const [output] = await connection.execute(
                    `SELECT * FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?`,
                    [service_id, insertedId]
                );

                return output.length > 0 ? output[0] : null;

            } else {
                const [rows] = await connection.execute(
                    'SELECT image_url FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?',
                    [service_id, imageId]
                );

                if (rows.length === 0) {
                    throw new Error('Image not found.');
                }

                const oldImageUrl = rows[0].image_url;
                const oldS3Key = oldImageUrl.replace(BASE_URL, '');

                const newFileName = `${uuidv4()}-${file.originalname}`;

                const metadata = await sharp(file.buffer).metadata();

                let contentType;
                switch (metadata.format) {
                    case 'jpeg':
                        contentType = 'image/jpeg';
                        break;
                    case 'png':
                        contentType = 'image/png';
                        break;
                    case 'gif':
                        contentType = 'image/gif';
                        break;
                    default:
                        contentType = file.mimetype;
                        break;
                }


                s3Key = `media/${media_id}/services/${service_id}/${newFileName}`
                await uploadToS3(file.buffer, s3Key, contentType);

                const newImage = {
                    url: s3Key,
                    width: metadata.width,
                    height: metadata.height,
                    size: metadata.size,
                    format: metadata.format
                };

                await connection.execute(
                    `UPDATE service_thumbnail
                    SET image_url = ?, width = ?, height = ?, size = ?, format = ?
                    WHERE thumbnail_id = ?`,
                    [newImage.url, newImage.width, newImage.height, newImage.size, newImage.format, imageId]
                );

                await connection.commit();

                try {
                    await deleteFromS3(oldS3Key);
                } catch (err) { }

                const [output] = await connection.execute(
                    `SELECT * FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?`,
                    [service_id, imageId]
                );

                return output.length > 0 ? output[0] : null;
            }
        } catch (error) {
            if (connection) {
                await connection.rollback();
                if (s3Key) {
                    try {
                        await deleteFromS3(s3Key);
                    } catch (err) { }
                }
            }
            throw error;
        } finally {
            if (connection) {
                await connection.release();
            }
        }
    }

    static async createBookmarkService(userId, serviceId) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "INSERT INTO user_bookmark_services (user_id, service_id) VALUES (?, ?)",
                [userId, serviceId]
            );

            if (rows.affectedRows === 0) {
                throw new Error('Error on inserting bookmark');
            }

            await connection.commit();
            return rows.insertId;

        } catch (error) {
            (await connection).rollback();
            throw new Error('Failed to create bookmark: ' + error.message);
        } finally {
            (await connection).release;
        }
    }

    static async removeBookmarkService(userId, serviceId) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [result] = await connection.execute(
                "DELETE FROM user_bookmark_services WHERE user_id = ? AND service_id = ?",
                [userId, serviceId]
            );

            if (result.affectedRows === 0) {
                throw new Error('No bookmark found to delete');
            }
            await connection.commit();

            return { "Success": true };
        } catch (error) {
            (await connection).rollback();
            throw new Error('Failed to remove  bookmark: ' + error.message);
        } finally {
            (await connection).release;
        }
    }

    static async searchQueries(query) {
        let connection;
        try {
            connection = await db.getConnection();

            const trimmedQuery = query.trim();
            const cleanQuery = trimmedQuery.replace(/\s+/g, ' ');
            const lowercaseQuery = cleanQuery.toLowerCase();
            const words = cleanQuery.split(' ');

            const concatenatedQuery = lowercaseQuery.replace(/ /g, '');

            const likeConditions = words
                .map(() => `search_term LIKE CONCAT('%', ?, '%')`)
                .join(' AND ');

            const concatenatedLikeConditions = words
                .map(() => `search_term_concatenated LIKE CONCAT('%', ?, '%')`)
                .join(' AND ');

            const maxWords = 10;
            const levenshteinConditions = [];
            const matchCounts = [];

            for (const _ of words) {
                const levenshteinCondition = [];
                const matchCountCondition = [];

                for (let i = 1; i <= maxWords; i++) {
                    levenshteinCondition.push(
                        `levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(search_term, ' ', ${i}), ' ', -1), ?) < 3`
                    );
                    matchCountCondition.push(
                        `IF(levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(search_term, ' ', ${i}), ' ', -1), ?) < 3, 1, 0)`
                    );
                }

                levenshteinConditions.push(`(${levenshteinCondition.join(' OR ')})`);
                matchCounts.push(`(${matchCountCondition.join(' OR ')})`);
            }

            const levenshteinSql = levenshteinConditions.join(' OR ');
            const matchCountSql = matchCounts.join(' + ');

            const sql = `
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 0 AS relevance_score
                    FROM search_queries 
                    WHERE search_term LIKE CONCAT(?, '%')
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 1 AS relevance_score
                    FROM search_queries 
                    WHERE ${likeConditions}
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 2 AS relevance_score
                    FROM search_queries 
                    WHERE search_term_concatenated LIKE CONCAT(?, '%')
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND NOT (${likeConditions})
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, (${matchCountSql}) AS match_count, 3 AS relevance_score
                    FROM search_queries 
                    WHERE (${levenshteinSql})
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND NOT (${likeConditions})
                    AND search_term_concatenated NOT LIKE CONCAT(?, '%') 
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 4 AS relevance_score
                    FROM search_queries 
                    WHERE ${concatenatedLikeConditions}
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND NOT (${likeConditions})
                    AND search_term_concatenated NOT LIKE CONCAT(?, '%') 
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                ORDER BY relevance_score ASC, match_count DESC, popularity DESC
                LIMIT 10;
            `;

            const params = [];

            // Parameters for exact match
            params.push(lowercaseQuery);

            // Parameters for partial matches
            for (const word of words) params.push(word);
            params.push(lowercaseQuery);

            // Parameters for concatenated match
            params.push(concatenatedQuery);
            params.push(lowercaseQuery);
            for (const word of words) params.push(word);

            // Parameters for levenshtein
            for (const word of words) {
                for (let i = 0; i < maxWords; i++) params.push(word);
                for (let i = 0; i < maxWords; i++) params.push(word);
            }
            params.push(lowercaseQuery);
            for (const word of words) params.push(word);
            params.push(lowercaseQuery);


            // Parameters for concatenatedLikeConditions
            for (const word of words) params.push(word);
            params.push(lowercaseQuery);
            for (const word of words) params.push(word);
            params.push(lowercaseQuery);

            const [results] = await connection.execute(sql, params);

            return results;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            if (connection) (await connection).release();
        }
    }

    static async deleteService(user_id, service_id) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            await connection.execute(
                "DELETE FROM service_images WHERE service_id = ?",
                [service_id]
            );
            await connection.execute(
                "DELETE FROM service_thumbnail WHERE service_id = ?",
                [service_id]
            );
            await connection.execute(
                "DELETE FROM service_plans WHERE service_id = ?",
                [service_id]
            );
            await connection.execute(
                "DELETE FROM service_locations WHERE service_id = ?",
                [service_id]
            );
            await connection.execute(
                "DELETE FROM services WHERE service_id = ?",
                [service_id]
            );
            const [userResult] = await connection.execute(
                "SELECT media_id FROM users WHERE user_id = ?",
                [user_id]
            );
            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            const s3Key = 'media/' + media_id.toString() + '/services/' + service_id.toString();

            await deleteDirectoryFromS3(s3Key);

            await connection.commit();
            return { status: 'success', message: 'Service and related data deleted successfully' };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw new Error(`Service deletion failed: ${error.message}`);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
}

module.exports = Service;