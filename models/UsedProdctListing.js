const db = require('../config/database.js')
const sharp = require('sharp');
const he = require('he');
const moment = require('moment');
const { BASE_URL, PROFILE_BASE_URL, MEDIA_BASE_URL } = require('../config/config.js');
const { uploadToS3, deleteFromS3, deleteDirectoryFromS3} = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');
const { formatMySQLDateToInitialCheckAt } = require('./utils/dateUtils.js');

class UsedProductListing {

    static async getUsedProductListingsForUser(userId, queryParam, afterId, pageSize, lastTimeStamp, lastTotalRelevance = null, initialRadius = 50) {

        const connection = await db.getConnection();

        const [userCoords] = await connection.execute(
            'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
            [userId]
        );

        const userCoordsData = userCoords[0];

        let query, params;
        var radius = initialRadius;

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;

            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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
                        s.product_id AS product_id,
                        s.name,
                        s.description,
                        s.price,
                        s.price_unit,
                        s.status,
                        s.short_code,
                        s.state, 
                        s.country,

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

                        CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at,

                        ST_Distance_Sphere(
                            POINT(?, ?),
                            POINT(sl.longitude, sl.latitude)
                        ) * 0.001 AS distance,

                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS name_relevance,
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) As total_relevance

                        FROM
                        used_product_listings s

                    LEFT JOIN
                        used_product_listing_images si ON s.product_id = si.product_id
            
                    LEFT JOIN
                        used_product_listing_location sl ON s.product_id = sl.product_id
   

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?

                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180`;

                params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userId, userLat, userLon];

                if (lastTimeStamp != null) {
                    query += ` AND s.created_at < ?`;
                    params.push(lastTimeStamp);
                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY product_id HAVING distance < ? AND (name_relevance > 0 OR description_relevance > 0) AND ((total_relevance = ? AND distance <= ?) OR (total_relevance < ? AND distance <= ?))`;
                    params.push(radius, lastTotalRelevance, radius, lastTotalRelevance, radius);
                } else {
                    query += ` GROUP BY product_id HAVING distance < ? AND (name_relevance > 0 OR description_relevance > 0)`;
                    params.push(radius);
                }

                query += ` ORDER BY distance ASC, total_relevance DESC LIMIT ? OFFSET ?`;
                const offset = (page - 1) * pageSize;
            
                params.push(pageSize, offset);
            } else {
                query = `
                    SELECT
                    s.id,
    s.product_id AS product_id,
    s.name,
    s.price,
    s.price_unit,
    s.description,
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

    CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
    CURRENT_TIMESTAMP AS initial_check_at,

    
     ST_Distance_Sphere(
        POINT(?, ?),
        POINT(sl.longitude, sl.latitude)
    ) * 0.001 AS distance
    
FROM
    used_product_listings s

LEFT JOIN
    used_product_listing_images si ON s.product_id = si.product_id

LEFT JOIN
    used_product_listing_location sl ON s.product_id = sl.product_id


INNER JOIN
    users u ON s.created_by = u.user_id

    LEFT JOIN user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?

    LEFT JOIN chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

WHERE
    sl.latitude BETWEEN -90 AND 90
    AND sl.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180 
`
                params = [userLon, userLat, userId, userLat, userLon];

                if (!lastTimeStamp) {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ? `;
                    params.push(lastTimeStamp);
                }

                query+= ' AND s.id > ?'

                params.push(afterId)

                query += ` GROUP BY product_id HAVING distance < ?`;

                params.push(radius);

                query += ` ORDER BY distance LIMIT ?`;

                params.push(pageSize);
            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
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

                            
                        CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at,


                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS name_relevance,
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                        
                        FROM
                        used_product_listings s
                    LEFT JOIN
                        used_product_listing_images si ON s.product_id = si.product_id
                    LEFT JOIN
                        used_product_listing_location sl ON s.product_id = sl.product_id
                  
        

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180 `;

                params = [queryParam, queryParam, queryParam, queryParam, userId];

                if (lastTimeStamp != null) {
                    query += ` AND s.created_at < ?`;
                    params.push(lastTimeStamp);
                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY product_id HAVING
                                (
                                    name_relevance > 0 OR
                                    description_relevance > 0
                                ) AND (
                                (total_relevance = ? )
                                OR (total_relevance < ?)
                            )`;
                    params.push(lastTotalRelevance, lastTotalRelevance);
                } else {
                    query += ` GROUP BY product_id HAVING
                                (
                                    name_relevance > 0 OR
                                    description_relevance > 0
                                )`;
                }

                query += ` ORDER BY total_relevance DESC LIMIT ? OFFSET ?`;
                const offset = (page - 1) * pageSize;
                params.push(pageSize, offset);

            } else {
                query = `
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

                            CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at


                FROM
                    used_product_listings s
                LEFT JOIN
                    used_product_listing_images si ON s.product_id = si.product_id
             
                LEFT JOIN
                    used_product_listing_location sl ON s.product_id = sl.product_id
           
    
                INNER JOIN
                    users u ON s.created_by = u.user_id

                        LEFT JOIN
                 user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?

           
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    
                WHERE
                    sl.latitude BETWEEN -90 AND 90
                    AND sl.longitude BETWEEN -180 AND 180`

                if (!lastTimeStamp) {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;
                    params.push(lastTimeStamp);
                }

                query += ` GROUP BY product_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                params.push(pageSize, offset);
            }
        }

        const [results] = await connection.execute(query, params);

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    radius += 30;
                    await connection.release();
                    return await this.getUsedProductListingsForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, radius)
                }
            }
        }
        
        const services = {};

        await (async () => {
            for (const row of results) {
                const product_id = row.product_id;
                if (!services[product_id]) {
                    const publisher_id = row.publisher_id;
                    try {
                        const result = await UsedProductListing.getUserPublishedUsedProductListingsFeedUser(userId, publisher_id);
                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }
                        services[product_id] = {
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
                            id:row.id,
                            product_id: product_id,
                            created_used_product_listings: result,
                            name: row.name,
                            description: row.description,
                            price: row.price,
                            price_unit: row.price_unit,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url // Prepend the base URL to the image URL
                            })) : [],
                            short_code: BASE_URL + "/used-product/" + row.short_code,

                            initial_check_at: formatMySQLDateToInitialCheckAt(row.initial_check_at),
                            total_relevance: row.total_relevance,
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
                        };
                    } catch (error) {
                        throw new Error("Error processing service data");
                    }
                }
            }
        })();

        await connection.release();
        return Object.values(services);
    }

    static async guestGetUsedProductListings(userId, queryParam, page, pageSize, lastTimeStamp,
        lastTotalRelevance = null, userCoordsData = null, initialRadius = 50) {
        const connection = await db.getConnection();
        let query, params;
        var radius = initialRadius;

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                    VALUES (?, 1, NOW(), ?)
                    ON DUPLICATE KEY UPDATE
                        popularity = popularity + 1,
                        last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
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

                        CURRENT_TIMESTAMP AS initial_check_at,

                           -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

                        ST_Distance_Sphere(
                            POINT(?, ?),
                            POINT(sl.longitude, sl.latitude)
                        ) * 0.001 AS distance,

                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS name_relevance,
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       

                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                   
                        FROM
                        used_product_listings s
                    LEFT JOIN
                        used_product_listing_images si ON s.product_id = si.product_id
                 
                    LEFT JOIN
                        used_product_listing_location sl ON s.product_id = sl.product_id

                   
                    INNER JOIN
                        users u ON s.created_by = u.user_id
               
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180 `;

                if (lastTimeStamp != null) {
                    query += `AND s.created_at < ?`;
                } else {
                    query += `AND s.created_at < CURRENT_TIMESTAMP`;
                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY product_id HAVING
                        distance < ? AND (
                            name_relevance > 0 OR
                            description_relevance > 0 
                                                    ) AND (
                        (total_relevance = ? AND distance <= ?) 
                        OR (total_relevance < ? AND distance <= ?)  
                    ) `;
                } else {
                    query += ` GROUP BY product_id HAVING
                        distance < ? AND (
                            name_relevance > 0 OR
                            description_relevance > 0
                        )`
                }

                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize;

                if (lastTotalRelevance != null && lastTimeStamp != null) {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];
                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, radius, pageSize, offset];
                }
            } else {
                query = `
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

    
    CURRENT_TIMESTAMP AS initial_check_at,
    ci.online AS user_online_status,
    
     ST_Distance_Sphere(
        POINT(?, ?),
        POINT(sl.longitude, sl.latitude)
    ) * 0.001 AS distance
    
FROM
    used_product_listings s
LEFT JOIN
    used_product_listing_images si ON s.product_id = si.product_id

LEFT JOIN
    used_product_listing_location sl ON s.product_id = sl.product_id

  

INNER JOIN
    users u ON s.created_by = u.user_id

LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
WHERE
    sl.latitude BETWEEN -90 AND 90
    AND sl.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180`

                if (!lastTimeStamp) {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;
                }

                query += ` GROUP BY product_id HAVING
    distance < ?
    ORDER BY
distance LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                if (lastTimeStamp) {
                    params = [userLon, userLat, userLat, userLon, lastTimeStamp, radius, pageSize, offset];
                } else {
                    params = [userLon, userLat, userLat, userLon, radius, pageSize, offset];
                }
            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );

                }

                query = `
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
                        CURRENT_TIMESTAMP AS initial_check_at,
                            ci.online AS user_online_status,

                        -- Full-text search relevance scores
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS name_relevance,
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(s.name) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(s.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0)  As total_relevance
                   
                        
                        FROM
                        used_product_listings s
                    LEFT JOIN
                        used_product_listing_images si ON s.product_id = si.product_id
                   LEFT JOIN

                        used_product_listing_location sl ON s.product_id = sl.product_id

                 

                    INNER JOIN
                        users u ON s.created_by = u.user_id
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    WHERE
                        sl.latitude BETWEEN -90 AND 90
                        AND sl.longitude BETWEEN -180 AND 180 `;

                if (lastTimeStamp != null) {
                    query += ` AND s.created_at < ?`;
                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY product_id HAVING
                        (
                            name_relevance > 0 OR
                            description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;
                } else {
                    query += ` GROUP BY product_id HAVING
                        (
                            name_relevance > 0 OR
                            description_relevance > 0
                        )`
                }

                query += ` ORDER BY
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                if (lastTotalRelevance != null && lastTimeStamp != null) {
                    params = [queryParam, queryParam, queryParam, queryParam, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];
                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, pageSize, offset];
                }
            } else {
                query = `
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
    ci.online AS user_online_status

                FROM
                    used_product_listings s

                   LEFT JOIN
                        used_product_listing_images si ON s.product_id = si.product_id
          
                LEFT JOIN
                    used_product_listing_location sl ON s.product_id = sl.product_id
           
                INNER JOIN
                    users u ON s.created_by = u.user_id
                
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                    sl.latitude BETWEEN -90 AND 90
                    AND sl.longitude BETWEEN -180 AND 180`

                if (!lastTimeStamp) {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;
                }

                query += ` GROUP BY product_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;
                if (lastTimeStamp) {
                    params = [lastTimeStamp, pageSize, offset];
                } else {
                    params = [pageSize, offset];
                }
            }
        }

        const [results] = await connection.execute(query, params);

        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    radius += 30;
                    await connection.release();
                    return await this.guestGetUsedProductListings(userId, queryParam, 1, pageSize, lastTimeStamp, lastTotalRelevance, userCoordsData, radius)
                }
            }
        }

        const products = {};

        await (async () => {
            for (const row of results) {
                const productId = row.product_id;
                if (!products[productId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        const result = await UsedProductListing.getUserPublishedUsedProductListingsFeedUser(userId, publisher_id);
                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }
                        products[productId] = {
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

                            created_used_product_listings: result,

                            product_id: productId,
                            name: row.name,
                            description: row.description,
                            price: row.price,
                            price_unit: row.price_unit,
                            country: row.country,
                            state: row.state,
                            status: row.status,
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url // Prepend the base URL to the image URL
                            })) : [],

                            short_code: BASE_URL + "/used-product/" + row.short_code,

                            initial_check_at: formatMySQLDateToInitialCheckAt(row.initial_check_at),
                            total_relevance: row.total_relevance,

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
                        throw new Error("Error processing used product listing data");
                    }
                }
            }
        })();

        await connection.release();

        return Object.values(products);
    }

    static async getUserPublishedUsedProductListingsFeedUser(userId, serviceOwnerId) {

        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [serviceOwnerId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }

        const [results] = await db.query(`
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

                    CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked

                FROM used_product_listings s
                LEFT JOIN used_product_listing_images si ON s.product_id = si.product_id
                
                 INNER JOIN users u ON s.created_by = u.user_id

                LEFT JOIN used_product_listing_location sl ON s.product_id = sl.product_id
                                
                     LEFT JOIN
                        user_bookmark_used_product_listings ub ON s.product_id = ub.product_id AND ub.user_id = ?

                LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
    
                WHERE s.created_by = ? GROUP BY product_id
            `, [userId, serviceOwnerId]);

        const products = {};

        results.forEach(row => {
            const productId = row.product_id;
            if (!products[productId]) {
                products[productId] = {
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
                    product_id: productId,
                    name: row.name,
                    description: row.description,
                    price: row.price,
                    price_unit: row.price_unit,
                    country: row.country,
                    state: row.state,
                    status: row.status,
                    short_code: BASE_URL + "/used-product/" + row.short_code,
                    is_bookmarked: Boolean(row.is_bookmarked),

                    images: row.images ? JSON.parse(row.images).map(image => ({
                        ...image,
                        image_url: MEDIA_BASE_URL + "/" + image.image_url
                    })) : [],
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
        });
        return Object.values(products);
    }

    static async bookmarkUsedProductListing(userId, productId) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                "INSERT INTO user_bookmark_used_product_listings (user_id, product_id) VALUES (?, ?)",
                [userId, productId]
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

    static async removeBookmarkUsedProductListing(userId, productId) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [result] = await connection.execute(
                "DELETE FROM user_bookmark_used_product_listings WHERE user_id = ? AND product_id = ?",
                [userId, productId]
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

    static async createOrUpdateUsedProductListing(user_id, name, description, price, price_unit, country, state, files, locationJson, keepImageIdsArray, product_id) {
        let connection;
        const uploadedFiles = [];
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            let productExists = false;

            if (product_id) {
                const [existingProductResult] = await connection.execute(
                    'SELECT product_id FROM used_product_listings WHERE product_id = ? AND created_by = ?',
                    [product_id, user_id]
                );

                if (existingProductResult.length > 0) {
                    productExists = true;
                }
            }

            if (productExists) {
                await connection.execute(
                    `UPDATE used_product_listings
                     SET name = ?, description = ?, price =?, price_unit = ?, country = ?, state = ?, updated_at = NOW()
                     WHERE product_id = ?`,
                    [name, description, price, price_unit, country, state, product_id]
                );
            } else {
                const [insertResult] = await connection.execute(
                    `INSERT INTO used_product_listings (created_by, name, description, price, price_unit, country, state)
                     VALUES (?, ?, ?, ?, ? , ?, ?)`,
                    [user_id, name, description, price, price_unit, country, state]
                );

                product_id = insertResult.insertId;
            }

            const [userResult] = await connection.execute(
                'SELECT media_id FROM users WHERE user_id = ?',
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            const [existingImages] = await connection.execute(
                `SELECT id, image_url FROM used_product_listing_images WHERE product_id = ?`,
                [product_id]
            );

            for (const existingImage of existingImages) {
                const { id, image_url } = existingImage;
                if (!keepImageIdsArray.includes(id) && productExists) {
                    await deleteFromS3(image_url)
                    await connection.execute(
                        `DELETE FROM used_product_listing_images WHERE id = ?`,
                        [id]
                    );
                }
            }

            const image_urls = [];

            if (files) {
                for (const file of files) {
                    const newFileName = `${uuidv4()}-${file.originalname}`;
                    const s3Key = `media/${media_id}/used-product-listings/${product_id}/${newFileName}`;

                    const uploadResult = await uploadToS3( file.buffer, s3Key, file.mimetype);
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
            }

            for (const image of image_urls) {
                await connection.execute(
                    `INSERT INTO used_product_listing_images (product_id, image_url, width, height, size, format)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                    [product_id, image.url, image.width, image.height, image.size, image.format]
                );
            }


            if (locationJson) {
                const decodedLocation = he.decode(locationJson);
                if (decodedLocation) {
                    const location = JSON.parse(decodedLocation);
                    if (!productExists) {
                        const insertLocationText = `
                            INSERT INTO used_product_listing_location (product_id, longitude, latitude, geo, location_type)
                            VALUES (?, ?, ?, ?, ?)
                        `;

                        await connection.execute(insertLocationText, [
                            product_id,
                            location.longitude,
                            location.latitude,
                            location.geo,
                            location.location_type
                        ]);

                    } else {
                        const updateLocationText = `
                            UPDATE used_product_listing_location
                            SET longitude = ?, latitude = ?, geo = ?, location_type = ?
                            WHERE product_id = ?
                        `;
                        await connection.execute(updateLocationText, [
                            location.longitude,
                            location.latitude,
                            location.geo,
                            location.location_type,
                            product_id
                        ]);
                    }
                }
            }

            await connection.commit();
            const [productData] = await connection.execute(
                `SELECT 
                    upl.product_id,
                    upl.name,
                    upl.description,
                    upl.country,
                    upl.state,
                    upl.status,
                    upl.short_code,
                    upl.price,
                    upl.price_unit,
            
                    -- User details (publisher)
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
                    u.created_at AS publisher_created_at,
            
                     COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN upi.id IS NOT NULL THEN JSON_OBJECT(
                            'image_id', upi.id,
                            'image_url', upi.image_url,
                            'width', upi.width,
                            'height', upi.height,
                            'size', upi.size,
                            'format', upi.format
                        )
                    END
                    ORDER BY upi.created_at DESC
                ), 
            ']'), '[]') AS images,

            
                    -- Location details
                    uploc.longitude, uploc.latitude, uploc.geo, uploc.location_type
            
                FROM used_product_listings upl
                JOIN users u ON upl.created_by = u.user_id
                LEFT JOIN used_product_listing_images upi ON upl.product_id = upi.product_id
                LEFT JOIN used_product_listing_location uploc ON upl.product_id = uploc.product_id
                WHERE upl.product_id = ?
                GROUP BY upl.product_id`,
                [product_id]
            );

            if (productData.length === 0) {
                throw new Error("Failed to fetch product details after creation/update.");
            }

            const product = {
                user: {
                    user_id: productData[0].publisher_id,
                    first_name: productData[0].publisher_first_name,
                    last_name: productData[0].publisher_last_name,
                    email: productData[0].publisher_email,
                    is_email_verified: !!productData[0].publisher_email_verified,
                    profile_pic_url: productData[0].publisher_profile_pic_url
                        ? PROFILE_BASE_URL + "/" + productData[0].publisher_profile_pic_url
                        : null,
                    profile_pic_url_96x96: productData[0].publisher_profile_pic_url_96x96
                        ? PROFILE_BASE_URL + "/" + productData[0].publisher_profile_pic_url_96x96
                        : null,
                    created_at: new Date(productData[0].publisher_created_at).getFullYear().toString(),
                },
                product_id: productData[0].product_id,
                name: productData[0].name,
                description: productData[0].description,
                price: productData[0].price,
                price_unit: productData[0].price_unit,
                country: productData[0].country,
                state: productData[0].state,
                status: productData[0].status,
                short_code: BASE_URL + "/used-product/" + productData[0].short_code,
                images: productData[0].images ? JSON.parse(productData[0].images).map(image => ({
                    ...image,
                    image_url: MEDIA_BASE_URL + "/" + image.image_url
                })) : [],
                location: productData[0].longitude ? {
                    longitude: productData[0].longitude,
                    latitude: productData[0].latitude,
                    geo: productData[0].geo,
                    location_type: productData[0].location_type
                } : null
            };

            return product;

        } catch (error) {
            if (connection) {
                await connection.rollback();
                for (const fileKey of uploadedFiles) {
                    await deleteFromS3(fileKey)
                }
            }
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async getPublishedUsedProductListings(userId, page, pageSize, lastTimeStamp) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) throw new Error('User not exist');

        let query = `
            SELECT
                p.product_id AS product_id,
                p.name,
                p.description,
                p.price,
                p.price_unit,
                p.status,
                p.short_code,
                p.country,
                p.state, 
        
                 COALESCE(
            CONCAT('[', 
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN pi.id IS NOT NULL THEN JSON_OBJECT(
                            'image_id', pi.id,
                            'image_url', pi.image_url,
                            'width', pi.width,
                            'height', pi.height,
                            'size', pi.size,
                            'format', pi.format
                        )
                    END
                    ORDER BY pi.created_at DESC
                ), 
            ']'), '[]') AS images,

            CASE WHEN ub.product_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,


                pl.longitude,
                pl.latitude,
                pl.geo,
                pl.location_type,
    
                u.user_id AS publisher_id,
                u.first_name AS publisher_first_name,
                u.last_name AS publisher_last_name,
                u.email AS publisher_email,
                u.is_email_verified AS publisher_email_verified,
                u.profile_pic_url AS publisher_profile_pic_url,
                u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
                u.created_at AS publisher_created_at
    
            FROM used_product_listings p
            LEFT JOIN used_product_listing_images pi ON p.product_id = pi.product_id
            LEFT JOIN used_product_listing_location pl ON p.product_id = pl.product_id
            
                        INNER JOIN users u ON p.created_by = u.user_id

      LEFT JOIN user_bookmark_used_product_listings ub ON p.product_id = ub.product_id AND ub.user_id = u.user_id
            
            WHERE p.created_by = ?
        `;

        const params = [userId];

        if (!lastTimeStamp) {
            query += ` AND p.created_at < CURRENT_TIMESTAMP`;
        } else {
            query += ` AND p.created_at < ?`;
            params.push(lastTimeStamp);
        }

        query += ` GROUP BY product_id 
               ORDER BY p.created_at DESC
               LIMIT ? OFFSET ?`;

        const offset = (page - 1) * pageSize;

        params.push(pageSize, offset);

        const [results] = await db.execute(query, params);

        const products = {};

        results.forEach(row => {
            const productId = row.product_id;
            if (!products[productId]) {
                products[productId] = {
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
                        created_at: new Date(row.publisher_created_at).getFullYear().toString()
                    },
                    product_id: productId,
                    name: row.name,
                    price: row.price,
                    price_unit: row.price_unit,
                    description: row.description,
                    country: row.country,
                    state: row.state,
                    status: row.status,
                    short_code: BASE_URL + "/used-product/" + row.short_code,
                    images: row.images ? JSON.parse(row.images).map(image => ({
                        ...image,
                        image_url: MEDIA_BASE_URL + "/" + image.image_url
                    })) : [],
                    location: row.longitude && row.latitude && row.geo && row.location_type
                        ? {
                            longitude: row.longitude,
                            latitude: row.latitude,
                            geo: row.geo,
                            location_type: row.location_type
                        }
                        : null,
                    is_bookmarked: Boolean(row.is_bookmarked),
                    initial_check_at: formatMySQLDateToInitialCheckAt(row.initial_check_at)
                };
            }
        });

        return Object.values(products);
    }

    static async deleteUsedProductListing(user_id, product_id) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            await connection.execute(
                "DELETE FROM used_product_listing_images WHERE product_id = ?",
                [product_id]
            );

            await connection.execute(
                "DELETE FROM used_product_listing_location WHERE product_id = ?",
                [product_id]
            );

            await connection.execute(
                "DELETE FROM used_product_listings WHERE product_id = ?",
                [product_id]
            );

            const [userResult] = await connection.execute(
                "SELECT media_id FROM users WHERE user_id = ?",
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }
            const s3Key = 'media/' + media_id.toString() + '/used-product-listings/' + product_id.toString();

            await deleteDirectoryFromS3(s3Key)

            await connection.commit();
            return { status: 'success', message: 'Product and related data deleted successfully' };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw new Error(`Used product deletion failed: ${error.message}`);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async usedProductListingsSearchQueries(query) {
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
                    FROM used_product_listing_search_queries 
                    WHERE search_term LIKE CONCAT(?, '%')
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 1 AS relevance_score
                    FROM used_product_listing_search_queries 
                    WHERE ${likeConditions}
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 2 AS relevance_score
                    FROM used_product_listing_search_queries 
                    WHERE search_term_concatenated LIKE CONCAT(?, '%')
                    AND search_term NOT LIKE CONCAT(?, '%')
                    AND NOT (${likeConditions})
                    AND popularity > 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, (${matchCountSql}) AS match_count, 3 AS relevance_score
                    FROM used_product_listing_search_queries 
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
                    FROM used_product_listing_search_queries 
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
}

module.exports = UsedProductListing;