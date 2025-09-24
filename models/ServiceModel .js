
const { BASE_URL, MEDIA_ROOT_PATH, PROFILE_BASE_URL, MEDIA_BASE_URL, S3_BUCKET_NAME } = require('../config/config');
const db = require('../config/database')
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const he = require('he');
const moment = require('moment');
const crypto = require('crypto');
const { awsS3Bucket } = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');  // For unique file names
class ServiceModel {

    static async getServicesForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance = null, initialRadius = 50) {


        const connection = await db.getConnection();
        // Retrieve user coordinates
        const [userCoords] = await connection.execute(
            'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
            [userId]
        );

        const userCoordsData = userCoords[0];

        // If user coordinates are available, add distance filter
        let query, params;
        var radius = initialRadius; // You can adjust this as needed



        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;

            if (queryParam) {


                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }


                // SQL query with Levenshtein distance
                query = `
                    SELECT
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
                        u.created_at AS created_at,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,

                                ci.online AS user_online_status,

                        CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at,

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



                if (lastTimeStamp != null) {

                    query += ` AND s.created_at < ?`;

                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? AND distance <= ?)  -- Fetch records with the same relevance and within the current distance
                        OR (total_relevance < ? AND distance <= ?)  -- Fetch records with lower relevance within the current distance
                    ) `;

                } else {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userId, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];

                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userId, userLat, userLon, radius, pageSize, offset];
                }

            } else {

                query = `
                    SELECT
    s.service_id AS service_id,
    s.title,
    s.short_description,
    s.long_description,
    s.industry AS industry,
    s.status,
     s.short_code,
        s.country,
                        s.state, 

                        (SELECT COUNT(ui.industry_id)
     FROM user_industries ui
     WHERE ui.user_id = ? ) AS industries_count, 

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
    u.created_at AS created_at,
    u.about AS about,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
    u.created_at AS created_at,

      -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

    CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
    CURRENT_TIMESTAMP AS initial_check_at,

    
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
      OR s.industry IN (SELECT ui.industry_id FROM user_industries ui WHERE ui.user_id = ?))`




                if (!lastTimeStamp) {

                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ? `;

                }



                query += ` GROUP BY service_id HAVING
    distance < ?
    ORDER BY
distance LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                if (lastTimeStamp) {
                    params = [userId, userLon, userLat, userId, userLat, userLon, userId, userId, lastTimeStamp, radius, pageSize, offset];
                } else {

                    params = [userId, userLon, userLat, userId, userLat, userLon, userId, userId, radius, pageSize, offset];
                }
            }

        } else {



            if (queryParam) {


                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );

                }



                // SQL query with Levenshtein distance
                query = `
                    SELECT
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
                        u.created_at AS created_at,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,
                                -- User online status (0 = offline, 1 = online)
                        ci.online AS user_online_status,

                            
                        CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at,


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



                if (lastTimeStamp != null) {

                    query += ` AND s.created_at < ?`;

                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;

                } else {
                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userId, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userId, pageSize, offset];
                }

            } else {



                query = `
                SELECT
                    s.service_id AS service_id,
                    s.title,
                    s.short_description,
                    s.long_description,
                    s.industry AS industry,
                    s.status,
                    s.short_code,
                       s.country,
                        s.state, 

                     (SELECT COUNT(ui.industry_id)
     FROM user_industries ui
     WHERE ui.user_id = ? ) AS industries_count, 


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
                    u.created_at AS created_at,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,

                        u.created_at AS created_at,

                        
    -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status, 

                            CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CURRENT_TIMESTAMP AS initial_check_at


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
      OR s.industry IN (SELECT ui.industry_id FROM user_industries ui WHERE ui.user_id = ?))`



                if (!lastTimeStamp) {

                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;
                }

                query += ` GROUP BY service_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;
                if (lastTimeStamp) {
                    params = [userId, userId, userId, userId, lastTimeStamp, pageSize, offset];

                } else {
                    params = [userId, userId, userId, userId, pageSize, offset];
                }


            }



        }

        // Prepare and execute the query
        const [results] = await connection.execute(query, params);


        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    // Increase distance and fetch again
                    radius += 30;
                    console.log(`Only ${availableResults} results found. Increasing distance to ${radius} km.`);
                    await connection.release();
                    return await this.getServicesForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, radius)

                } else {
                    console.log("Reached maximum distance limit. Returning available results.");
                    // Process available results as needed, limited to requestedLimit
                    // const limitedResults = results.slice(0, requestedLimit);
                    // console.log("Fetched Results:", limitedResults);
                }
            }

        }

        const services = {};  // Assuming services is declared somewhere

        // Wrap the code in an async IIFE (Immediately Invoked Function Expression)
        await (async () => {

            for (const row of results) {
                const serviceId = row.service_id;


                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                // Initialize service entry if it doesn't exist
                if (!services[serviceId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        // Await the async operation
                        const result = await ServiceModel.getUserPublishedServicesFeedUser(userId, publisher_id);

                        if (!result) {
                            throw new Error("Failed to retrieve published services of the user");
                        }


                        // Query to get the total comments and replies for the service_id
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

                            short_code: BASE_URL + "/service/" + row.short_code,

                            thumbnail: row.thumbnail ? {
                                ...JSON.parse(row.thumbnail),
                                url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url // Prepend the base URL to the thumbnail URL
                            } : null,

                            initial_check_at: formattedDate,
                            total_relevance: row.total_relevance,
                            industries_count: (row.industries_count === undefined || row.industries_count === null) ? -1 : row.industries_count,
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
                        // Handle the error if the async operation fails
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }
            }


        })();


        // Close the connection
        await connection.release();




        // Return the services object
        return Object.values(services);
    }


    static async getServicesForGuestUser(userId, queryParam, page, pageSize, lastTimeStamp,
        lastTotalRelevance = null, userCoordsData = null, industryIds = [], initialRadius = 50) {

        const connection = await db.getConnection();



        // If user coordinates are available, add distance filter
        let query, params;
        var radius = initialRadius; // You can adjust this as needed



        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const userLat = userCoordsData.latitude;
            const userLon = userCoordsData.longitude;



            if (queryParam) {



                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                    VALUES (?, 1, NOW(), ?)
                    ON DUPLICATE KEY UPDATE
                        popularity = popularity + 1,
                        last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                // SQL query with Levenshtein distance
                query = `
                    SELECT
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
                        u.created_at AS created_at,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                        u.created_at AS created_at,

                        CURRENT_TIMESTAMP AS initial_check_at,

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




                // Check if industryIds is provided and contains values
                if (industryIds && industryIds.length > 0) {
                    // Step 4a: Directly insert the industryIds into the query as a comma-separated list
                    const industryList = industryIds.join(', ');  // This will join the array into a string (e.g., '1, 2, 3')

                    // Step 4b: Append the industry filter to the query
                    query += ` AND s.industry IN (${industryList})`;  // Directly insert the industryIds into the query string


                }


                if (lastTimeStamp != null) {
                    query += `AND s.created_at < ?`;
                } else {
                    query += `AND s.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? AND distance <= ?) 
                        OR (total_relevance < ? AND distance <= ?)  
                    ) `;

                } else {
                    query += ` GROUP BY service_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];

                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, userLat, userLon, radius, pageSize, offset];
                }

            } else {


                query = `
                    SELECT
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
    u.created_at AS created_at,
    u.about AS about,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
    u.created_at AS created_at,

    
    CURRENT_TIMESTAMP AS initial_check_at,
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
    AND ? BETWEEN -180 AND 180`



                // Check if industryIds is provided and contains values
                if (industryIds && industryIds.length > 0) {
                    // Step 4a: Directly insert the industryIds into the query as a comma-separated list
                    const industryList = industryIds.join(', ');  // This will join the array into a string (e.g., '1, 2, 3')

                    // Step 4b: Append the industry filter to the query
                    query += ` AND s.industry IN (${industryList})`;  // Directly insert the industryIds into the query string


                }






                if (!lastTimeStamp) {

                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;

                }


                query += ` GROUP BY service_id HAVING
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

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO search_queries (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );

                }



                // SQL query with Levenshtein distance
                query = `
                    SELECT
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
                        u.created_at AS created_at,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,
                        CURRENT_TIMESTAMP AS initial_check_at,
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


                // Check if industryIds is provided and contains values
                if (industryIds && industryIds.length > 0) {
                    // Step 4a: Directly insert the industryIds into the query as a comma-separated list
                    const industryList = industryIds.join(', ');  // This will join the array into a string (e.g., '1, 2, 3')

                    // Step 4b: Append the industry filter to the query
                    query += ` AND s.industry IN (${industryList})`;  // Directly insert the industryIds into the query string


                }




                if (lastTimeStamp != null) {

                    query += ` AND s.created_at < ?`;

                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {

                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;

                } else {
                    query += ` GROUP BY service_id HAVING
                        (
                            title_relevance > 0 OR
                            short_description_relevance > 0 OR
                            long_description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, queryParam, queryParam, pageSize, offset];
                }


            } else {


                // BASE QUERY FOR NON LOCATION PROVIDED/ FOR GUEST
                query = `
                SELECT
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
                    u.created_at AS created_at,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS created_at,
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
                    AND sl.longitude BETWEEN -180 AND 180`


                // Check if industryIds is provided and contains values
                if (industryIds && industryIds.length > 0) {
                    // Step 4a: Directly insert the industryIds into the query as a comma-separated list
                    const industryList = industryIds.join(', ');  // This will join the array into a string (e.g., '1, 2, 3')

                    // Step 4b: Append the industry filter to the query
                    query += ` AND s.industry IN (${industryList})`;  // Directly insert the industryIds into the query string


                }



                if (!lastTimeStamp) {

                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ?`;
                }

                query += ` GROUP BY service_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;
                if (lastTimeStamp) {
                    params = [lastTimeStamp, pageSize, offset];

                } else {
                    params = [pageSize, offset];
                }



            }


        }

        // Prepare and execute the query
        const [results] = await connection.execute(query, params);


        if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
            const availableResults = results.length;
            if (availableResults < pageSize) {
                if (radius < 200) {
                    // Increase distance and fetch again
                    radius += 30;
                    console.log(`Only ${availableResults} results found. Increasing distance to ${radius} km.`);
                    await connection.release();
                    return await this.getServicesForGuestUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, userCoordsData, industryIds, radius)

                } else {
                    console.log("Reached maximum distance limit. Returning available results.");
                    // Process available results as needed, limited to requestedLimit
                    // const limitedResults = results.slice(0, requestedLimit);
                    // console.log("Fetched Results:", limitedResults);
                }
            }

        }

        // Initialize an array to hold the structured data

        const services = {};

        // Wrap the code in an async IIFE (Immediately Invoked Function Expression)
        await (async () => {

            for (const row of results) {
                const serviceId = row.service_id;
                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                // Initialize service entry if it doesn't exist
                if (!services[serviceId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        // Await the async operation
                        const result = await ServiceModel.getUserPublishedServicesFeedUser(userId, publisher_id);

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
                                created_at: createdAtYear,
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

                            short_code: BASE_URL + "/service/" + row.short_code,
                            thumbnail: row.thumbnail ? {
                                ...JSON.parse(row.thumbnail),
                                url: MEDIA_BASE_URL + "/" + JSON.parse(row.thumbnail).url // Prepend the base URL to the thumbnail URL
                            } : null,
                            initial_check_at: formattedDate,
                            total_relevance: row.total_relevance,

                            industries_count: (row.industries_count === undefined || row.industries_count === null) ? -1 : row.industries_count,

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
                        // Handle the error if the async operation fails
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }
            }


        })();


        // Close the connection
        await connection.release();



        // Return the services object
        return Object.values(services);
    }

    static async getUserBookmarkedServices(userId) {

        // Create a connection to the database

        // Check if user exists
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User does not exist.');
        }

        // Query to retrieve services, images, plans, and location for the specific user
        const [results] = await db.query(`
               
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

            CASE WHEN ub.service_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked
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
            ub.user_id = ? 
            GROUP BY service_id
            `, [userId, userId]);




        // Initialize an object to hold the structured data
        const services = {};
        await (async () => {

            for (const row of results) {

                const serviceId = row.service_id;
                const date = new Date(row.created_at);

                // Extract the year
                const createdAtYear = date.getFullYear().toString();




                // Initialize service entry if it doesn't exist
                if (!services[serviceId]) {
                    try {


                        const publisher_id = row.publisher_id;
                        // Await the async operation
                        const result = await ServiceModel.getUserPublishedServicesFeedUser(userId, publisher_id);

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
                        // Handle the error if the async operation fails
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }
            }



        })();




        // Return the services object
        return Object.values(services);

    }

    static async getUserPublishedServicesFeedUser(userId, serviceOwnerId) {



        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [serviceOwnerId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }

        // Query to retrieve services, images, plans, and location for the specific user
        const [results] = await db.query(`
                SELECT
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
                    u.created_at AS created_at,

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
    
                WHERE s.created_by = ? GROUP BY service_id
            `, [userId, serviceOwnerId]);



        // Initialize an object to hold the structured data
        const services = {};


        results.forEach(row => {


            const serviceId = row.service_id;

            // Initialize service entry if it doesn't exist
            if (!services[serviceId]) {


                const date = new Date(row.created_at);
                // Extract the year
                const createdAtYear = date.getFullYear().toString();




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
                    is_bookmarked: Boolean(row.is_bookmarked),

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


            // No need to check for image and plan uniqueness here, since they are already parsed
        });


        // Return the structured data as JSON
        return Object.values(services);

    }


    static async getUserPublishedServices(userId) {


        // Check if user exists
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }

        // Query to retrieve services, images, plans, and location for the specific user
        const [results] = await db.query(`
                SELECT
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
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS created_at

                FROM services s
                LEFT JOIN service_images si ON s.service_id = si.service_id
                LEFT JOIN service_plans sp ON s.service_id = sp.service_id
                LEFT JOIN service_locations sl ON s.service_id = sl.service_id

                
               LEFT JOIN service_thumbnail st ON s.service_id = st.service_id


                INNER JOIN users u ON s.created_by = u.user_id
                WHERE s.created_by = ? GROUP BY service_id
            `, [userId]);



        // Initialize an object to hold the structured data
        const services = {};


        results.forEach(row => {
            const serviceId = row.service_id;

            // Initialize service entry if it doesn't exist
            if (!services[serviceId]) {


                const date = new Date(row.created_at);
                // Extract the year
                const createdAtYear = date.getFullYear().toString();



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
                        created_at: createdAtYear
                    },
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


            // No need to check for image and plan uniqueness here, since they are already parsed
        });
        // Return the structured data as JSON
        return Object.values(services);

    }


    static async createService(user_id, title, short_description, long_description, industry, country, state, thumbnail, plans_json, files, locationJson) {
        let connection;

        const uploadedFiles = [];  // Array to track uploaded S3 files for rollback


        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // Insert the service into the services table
            const [serviceResult] = await connection.execute(
                `INSERT INTO services(created_by, title, short_description, long_description, industry, country, state)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [user_id, title, short_description, long_description, industry, country, state]
            );


            // Get the auto-incremented 'id' of the newly inserted service
            const insertedId = serviceResult.insertId;

            // Query the services table to get the corresponding service_id
            const [serviceResultById] = await connection.execute(
                'SELECT service_id FROM services WHERE id = ?',
                [insertedId]
            );

            // Get the service_id from the result
            const service_id = serviceResultById[0].service_id;




            // Retrieve media_id for the user
            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            // Handle file uploads for images
            const image_urls = [];


            // Process image files (e.g., for service gallery)
            for (const file of files) {


                const newFileName = `${uuidv4()}-${file.originalname}`;
                const s3Key = `media/${media_id}/services/${service_id}/${newFileName}`;

                const uploadParams = {
                    Bucket: S3_BUCKET_NAME,
                    Key: s3Key,
                    Body: file.buffer,
                    ContentType: file.mimetype,  // Ensure the content type is set based on the file type
                    ACL: 'public-read',  // Set the file to be publicly readable
                };

                // Upload the image to S3
                const uploadResult = await awsS3Bucket.upload(uploadParams).promise();

                // Track the uploaded S3 file for rollback
                uploadedFiles.push(uploadResult.Key);

                // Use Sharp to extract image metadata
                const metadata = await sharp(file.buffer).metadata();

                // Push the image URL and metadata to the image_urls array
                image_urls.push({
                    url: s3Key,  // S3 URL of the uploaded image
                    width: metadata.width,       // Extracted width from image metadata
                    height: metadata.height,     // Extracted height from image metadata
                    size: file.size,             // Original file size
                    format: metadata.format,     // Extracted format (e.g., jpeg, png)
                });

            }


            // Handle the thumbnail upload to S3
            const thumbnailFileName = `${uuidv4()}-${thumbnail.originalname}`;
            const thumbnailS3Key = `media/${media_id}/services/${service_id}/${thumbnailFileName}`;

            const thumbnailUploadParams = {
                Bucket: S3_BUCKET_NAME,
                Key: thumbnailS3Key,
                Body: thumbnail.buffer,
                ContentType: thumbnail.mimetype,
                ACL: 'public-read',
            };

            const thumbnailUploadResult = await awsS3Bucket.upload(thumbnailUploadParams).promise();

            // Track the uploaded thumbnail file for rollback
            uploadedFiles.push(thumbnailUploadResult.Key);

            const thumbnail_metadata = await sharp(thumbnail.buffer).metadata();


            const thumbnailUrl = {
                url: thumbnailS3Key,
                width: thumbnail_metadata.width,
                height: thumbnail_metadata.height,
                size: thumbnail_metadata.size,
                format: thumbnail_metadata.format
            };



            // Insert thumbnail image metadata into the database
            await connection.execute(
                `INSERT INTO service_thumbnail (service_id, image_url, width, height, size, format)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [service_id, thumbnailUrl.url, thumbnailUrl.width, thumbnailUrl.height, thumbnailUrl.size, thumbnailUrl.format]
            );

            // Insert image URLs into the service_images table
            for (const image of image_urls) {
                await connection.execute(
                    `INSERT INTO service_images (service_id, image_url, width, height, size, format)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [service_id, image.url, image.width, image.height, image.size, image.format]
                );
            }

            // Insert service plans if provided
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

            // Insert location if provided
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

            // Commit the transaction if all steps succeed
            await connection.commit();

            return { success: true, service_id };

        } catch (error) {
            if (connection) {
                await connection.rollback();  // Rollback transaction on error

                // Rollback S3 file uploads if something goes wrong
                try {
                    for (const fileKey of uploadedFiles) {
                        await awsS3Bucket.deleteObject({
                            Bucket: S3_BUCKET_NAME,
                            Key: fileKey,
                        }).promise();
                        console.log(`Deleted file from S3: ${fileKey}`);
                    }
                } catch (deleteError) {
                    console.error('Error deleting S3 files during rollback:', deleteError.message);
                }
            }


            throw error;  // Re-throw the error to propagate it
        } finally {
            if (connection) {
                connection.release();  // Release connection back to the pool (no need to await)
            }
        }
    }

    static async updateServiceDetails(service_id, user_id, title, short_description, long_description, industry) {
        let connection;
        try {

            connection = await db.getConnection();
            // Begin a transaction
            await connection.beginTransaction();

            // Prepare the SQL UPDATE query to update specific fields
            const updateQuery = `
                UPDATE services
                SET 
                    title = ?, 
                    short_description = ?, 
                    long_description = ?, 
                    industry = ?
                WHERE service_id = ? AND created_by = ?`;

            // Execute the UPDATE query
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

            // Fetch the updated service details
            const selectQuery = `
                SELECT
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

            // Commit the transaction
            await connection.commit();

            // Return the updated service details
            return rows.length > 0 ? rows[0] : null; // Return the first result if rows has length > 0, otherwise return null

        } catch (error) {
            // Rollback the transaction on error
            if (connection) await connection.rollback();
            throw error;
        } finally {
            // Close the connection
            if (connection) await connection.release();
        }
    }

    // The function to update or insert a service location
    static async updateOrInsertLocation(service_id, longitude, latitude, geo, location_type) {
        let connection;
        try {
            connection = await db.getConnection();

            // Begin a transaction
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

            // Run the query
            const [result] = await connection.execute(query, [service_id, longitude, latitude, geo, location_type]);

            // Check if the operation affected any rows
            const isUpdated = result.affectedRows > 0;  // This checks if a row was inserted or updated
            const isNewInsert = result.insertId > 0;    // This checks if it's a new insert

            // Fetch the updated or inserted row (using the service_id)
            let updatedRow = null;
            if (isUpdated || isNewInsert) {
                const selectQuery = `
                    SELECT service_id, longitude, latitude, geo, location_type
                    FROM service_locations
                    WHERE service_id = ?;
                `;
                const [rows] = await connection.execute(selectQuery, [service_id]);
                updatedRow = rows[0];  // There should be exactly one row returned
            }

            // Commit the transaction
            await connection.commit();

            // Return the updated or inserted row
            return {
                success: true,
                isUpdated,
                isNewInsert,
                updatedRow  // This is the updated or inserted row
            };

        } catch (err) {
            // Rollback the transaction on error
            if (connection) await connection.rollback();
            console.error('Error during transaction:', err);
            throw err;  // Re-throw the error to handle it in the calling code
        } finally {
            // Release the connection back to the pool
            if (connection) await connection.release();
        }
    }


    static async updateServicePlans(serviceId, data) {
        let connection;

        try {
            connection = await db.getConnection();
            // Begin a transaction
            await connection.beginTransaction();

            // Prepare SQL statements for update, insert, and delete operations
            const updateSql = `
                UPDATE service_plans 
                SET name = ?, description = ?, price = ?, price_unit = ?, features = ?, delivery_time = ?, duration_unit = ?
                WHERE id = ?`;


            const insertSql = `
                INSERT INTO service_plans (service_id, name, description, price, price_unit, features, delivery_time, duration_unit) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;


            const deleteSql = `DELETE FROM service_plans WHERE id = ?`;

            // Fetch all current plan IDs for the service
            const currentPlansSql = `SELECT id FROM service_plans WHERE service_id = ?`;
            const [currentPlansResult] = await connection.execute(currentPlansSql, [serviceId]);

            // Track existing plan IDs
            const existingPlanIds = currentPlansResult.map(row => row.id);
            const planIdsInInput = [];
            const newlyInsertedPlanIds = [];

            // Prepare the update, insert, and delete queries
            for (const plan of data) {
                const planId = plan.plan_id || -1; // -1 indicates a new plan
                const name = plan.plan_name || '';
                const description = plan.plan_description || '';
                const price = plan.plan_price || 0;
                const priceUnit = plan.price_unit || '';
                const features = JSON.stringify(plan.plan_features || {}); // Ensure it's a JSON string
                const deliveryTime = plan.plan_delivery_time || '';
                const durationUnit = plan.duration_unit || '';

                if (planId === -1) {
                    // Insert new plan
                    const [insertResult] = await connection.execute(insertSql, [
                        serviceId, name, description, price, priceUnit, features, deliveryTime, durationUnit
                    ]);
                    // Get the newly inserted plan ID
                    newlyInsertedPlanIds.push(insertResult.insertId);
                } else {

                    // Update existing plan
                    await connection.execute(updateSql, [
                        name, description, price, priceUnit, features, deliveryTime, durationUnit, planId
                    ]);
                    planIdsInInput.push(planId);
                }
            }

            // Combine IDs of plans to keep (those in input or newly inserted)
            const allValidPlanIds = [...planIdsInInput, ...newlyInsertedPlanIds];

            // Delete plans that are not in the input
            for (const existingPlanId of existingPlanIds) {
                if (!allValidPlanIds.includes(existingPlanId)) {
                    await connection.execute(deleteSql, [existingPlanId]);
                }
            }

            // SQL query to select plans for a given service_id
            const allPlans = `SELECT id As plan_id, name as plan_name, description as plan_description,
            price as plan_price, price_unit as price_unit, delivery_time as plan_delivery_time, duration_unit as duration_unit, features as plan_features
            FROM service_plans WHERE service_id = ?`;

            // Execute the query
            const [rows] = await connection.execute(allPlans, [serviceId]);

            // Commit the transaction
            await connection.commit();

            const result = rows.map(row => {
                return {
                    ...row,  // Spread the existing row properties
                    plan_features: row.plan_features ? JSON.parse(row.plan_features) : []  // Parse JSON or return empty array
                };
            });

            return result.length > 0 ? result : null;

        } catch (error) {
            console.log(error);
            // Rollback the transaction in case of an error
            if (connection) await connection.rollback();
            throw error;
        } finally {
            // Close the connection
            if (connection) await connection.release();
        }
    }



    static async createImage(user_id, service_id, file) {

        let connection;
        let s3Key = '';  // S3 key for the uploaded file, used to delete it later if necessary

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();   // Start transaction

            // Retrieve media_id for the user
            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            // Generate a unique filename for S3
            const fileName = `${uuidv4()}-${file.originalname}`;
            s3Key = `media/${media_id}/services/${service_id}/${fileName}`;

            // Use Sharp to extract metadata
            const metadata = await sharp(file.buffer).metadata();

            // Determine the MIME type based on the file format
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
                    contentType = file.mimetype;  // Fallback content type
                    break;
            }

            // Upload the file to S3
            const uploadParams = {
                Bucket: S3_BUCKET_NAME,
                Key: s3Key,
                Body: file.buffer,
                ContentType: contentType,
                ACL: 'public-read'  // Set public read permissions
            };

            await awsS3Bucket.upload(uploadParams).promise();

            // Save image metadata in the database
            const image = {
                url: s3Key,  // S3 URL
                width: metadata.width,
                height: metadata.height,
                size: file.size,
                format: metadata.format
            };

            // Insert image metadata into the database
            const [result] = await connection.execute(
                `INSERT INTO service_images (service_id, image_url, width, height, size, format)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [service_id, image.url, image.width, image.height, image.size, image.format]
            );

            // Get the ID of the inserted image
            const insertedImageId = result.insertId;


            // Commit the transaction
            await connection.commit();

            // Retrieve the inserted image data
            const [rows] = await connection.execute(
                `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                [service_id, insertedImageId]
            );


            // Return the inserted image metadata
            return rows.length > 0 ? rows[0] : null;

        } catch (error) {

            console.log(error);

            if (connection) {
                await connection.rollback();  // Rollback transaction on error

                // Delete the file from S3 if it was uploaded
                if (s3Key) {
                    try {
                        await awsS3Bucket.deleteObject({
                            Bucket: S3_BUCKET_NAME,
                            Key: s3Key,
                        }).promise();
                        console.log(`File with S3 Key ${s3Key} has been deleted due to error.`);
                    } catch (err) {
                        console.error('Error deleting file from S3 during rollback:', err.message);
                    }
                }

            }



            // Rethrow the error to propagate it
            throw error;
        } finally {
            if (connection) {
                connection.release();  // Release connection back to the pool (no need to await)
            }
        }
    }




    static async updateImage(user_id, service_id, imageId, file) {
        let connection;
        let s3Key = '';

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();  // Start transaction

            // Retrieve media_id for the user
            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );
            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            // Generate a unique key for the new file in S3
            const fileName = `${uuidv4()}-${file.originalname}`;
            s3Key = `media/${media_id}/services/${service_id}/${fileName}`;

            // Use Sharp to extract metadata
            const metadata = await sharp(file.buffer).metadata();

            // Determine the MIME type based on the file format
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
                    // Fallback content type
                    contentType = file.mimetype;

                    break;
            }



            // Upload the new image to S3
            const uploadParams = {
                Bucket: S3_BUCKET_NAME,
                Key: s3Key,
                Body: file.buffer,
                ContentType: contentType,  // Correct MIME type
                ACL: 'public-read'  // Set public read permissions
            };

            await awsS3Bucket.upload(uploadParams).promise();

            const newImage = {
                url: s3Key,
                width: metadata.width,
                height: metadata.height,
                size: file.size,
                format: metadata.format
            };



            if (imageId === -1) {
                // Insert or update the image in the service_images table
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



                // Commit transaction after all operations are successful
                await connection.commit();


                const insertedId = result.insertId; // Newly inserted thumbnail ID

                // Retrieve the inserted data
                const [output] = await connection.execute(
                    `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                    [service_id, insertedId]
                );


                return output.length > 0 ? output[0] : null;


            } else {


                // Case: Updating an existing thumbnail
                const [rows] = await connection.execute(
                    'SELECT image_url FROM service_images WHERE service_id = ? AND id = ?',
                    [service_id, imageId]
                );

                if (rows.length === 0) {
                    throw new Error('Image not found.');
                }
                const oldImageUrl = rows[0].image_url;
                const oldS3Key = oldImageUrl.replace(BASE_URL, '');  // S3 key is the path without the base UR

                // Update existing image in the service_images table
                await connection.execute(
                    `UPDATE service_images
                    SET image_url = ?, width = ?, height = ?, size = ?, format = ?
                    WHERE id = ?`,
                    [newImage.url, newImage.width, newImage.height, newImage.size, newImage.format, imageId]
                );


                // Commit transaction after all operations are successful
                await connection.commit();


                // After commit, delete the old image from S3 if any
                if (oldS3Key) {
                    try {
                        const deleteParams = {
                            Bucket: S3_BUCKET_NAME,
                            Key: oldS3Key
                        };
                        await awsS3Bucket.deleteObject(deleteParams).promise();
                        console.log(`Old image file at ${oldS3Key} has been deleted from S3.`);
                    } catch (err) {
                        console.error('Error deleting old image from S3:', err.message);
                        throw new Error('Failed to delete old image from S3.');
                    }
                }

                // Retrieve the inserted data
                const [output] = await connection.execute(
                    `SELECT * FROM service_images WHERE service_id = ? AND id = ?`,
                    [service_id, imageId]
                );


                return output.length > 0 ? output[0] : null;

            }


        } catch (error) {
            console.log(error);
            if (connection) {
                await connection.rollback();  // Rollback transaction on error

                // If the image was uploaded to S3, delete it during rollback
                if (s3Key) {
                    const deleteParams = {
                        Bucket: S3_BUCKET_NAME,
                        Key: s3Key
                    };
                    try {
                        await awsS3Bucket.deleteObject(deleteParams).promise();
                        console.log(`Deleted image at ${deleteParams.Key} from S3 during rollback.`);
                    } catch (err) {
                        console.error('Error deleting uploaded image during rollback:', err.message);
                    }
                }
            }
            console.error('Error during image update:', error.message);
            throw error;
        } finally {
            if (connection) {
                connection.release();  // Release connection back to the pool (no need to await)
            }
        }
    }


    static async deleteServiceImage(serviceId, imageId) {
        let connection;
        let s3Key = ''; // To store the S3 key for deletion

        try {
            connection = await db.getConnection();

            // Start transaction
            await connection.beginTransaction();

            // Retrieve the image URL from the database
            const [rows] = await connection.execute(
                'SELECT image_url FROM service_images WHERE service_id = ? AND id = ?',
                [serviceId, imageId]
            );

            if (rows.length === 0) {
                throw new Error('Image not found.');
            }

            const imageUrl = rows[0].image_url;

            // Extract the S3 key from the image URL (remove base URL part)
            s3Key = imageUrl.replace(BASE_URL, '');  // Adjust BASE_URL as needed

            // Delete the image record from the database
            const [deleteResult] = await connection.execute(
                'DELETE FROM service_images WHERE service_id = ? AND id = ?',
                [serviceId, imageId]
            );

            if (deleteResult.affectedRows === 0) {
                throw new Error('Failed to delete image record.');
            }

            // Commit transaction
            await connection.commit();

            // After commit, delete the image from S3
            try {
                const deleteParams = {
                    Bucket: S3_BUCKET_NAME,
                    Key: s3Key
                };
                await awsS3Bucket.deleteObject(deleteParams).promise();
                console.log(`Deleted image file at ${s3Key} from S3.`);
            } catch (err) {
                console.error('Error deleting image from S3:', err.message);
                throw new Error('Failed to delete image from S3.');
            }

            // Return success response
            return {
                success: true,
                message: 'Image deleted successfully'
            };

        } catch (error) {

            // In case of error, rollback transaction
            if (connection) await connection.rollback();

            console.log('Error during deletion process:', error.message);
            throw error;  // Re-throw the error to propagate it
        } finally {
            // Release connection back to the pool
            if (connection) await connection.release();
        }
    }


    static async updateThumbnail(user_id, service_id, imageId, file) {
        let connection;
        let s3Key = '';  // Track the S3 key for the old image


        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // Retrieve media_id
            const [userResult] = await connection.execute(
                `SELECT media_id FROM users WHERE user_id = ?`,
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            if (imageId === -1) {
                // Case: Creating a new thumbnail
                const newFileName = `${uuidv4()}-${file.originalname}`;



                // Use Sharp to extract metadata
                const metadata = await sharp(file.buffer).metadata();


                // Determine the MIME type based on the file format
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
                        contentType = file.mimetype;  // Fallback content type
                        break;
                }


                s3Key = `media/${media_id}/services/${service_id}/${newFileName}`

                // Upload the image to S3
                const uploadParams = {
                    Bucket: S3_BUCKET_NAME,
                    Key: s3Key,
                    Body: file.buffer,
                    ContentType: contentType,
                    ACL: 'public-read' // Make sure to adjust permissions based on your needs
                };

                await awsS3Bucket.upload(uploadParams).promise();



                const newImage = {
                    url: s3Key,
                    width: metadata.width,
                    height: metadata.height,
                    size: metadata.size,
                    format: metadata.format
                };

                // Insert the new thumbnail into the database
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

                // Commit transaction
                await connection.commit();

                const insertedId = result.insertId; // Newly inserted thumbnail ID

                // Retrieve the inserted data
                const [output] = await connection.execute(
                    `SELECT * FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?`,
                    [service_id, insertedId]
                );

                return output.length > 0 ? output[0] : null;

            } else {
                // Case: Updating an existing thumbnail
                const [rows] = await connection.execute(
                    'SELECT image_url FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?',
                    [service_id, imageId]
                );

                if (rows.length === 0) {
                    throw new Error('Image not found.');
                }

                const oldImageUrl = rows[0].image_url;
                const oldS3Key = oldImageUrl.replace(BASE_URL, ''); // S3 key format (remove media base path)


                // Case: Creating a new thumbnail
                const newFileName = `${uuidv4()}-${file.originalname}`;



                // Use Sharp to extract metadata
                const metadata = await sharp(file.buffer).metadata();


                // Determine the MIME type based on the file format
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
                        contentType = file.mimetype;  // Fallback content type
                        break;
                }


                s3Key = `media/${media_id}/services/${service_id}/${newFileName}`
                const uploadParams = {
                    Bucket: S3_BUCKET_NAME,
                    Key: s3Key,
                    Body: file.buffer,
                    ContentType: contentType,
                    ACL: 'public-read' // Adjust ACL based on your needs
                };

                await awsS3Bucket.upload(uploadParams).promise();

                const newImage = {
                    url: s3Key,
                    width: metadata.width,
                    height: metadata.height,
                    size: metadata.size,
                    format: metadata.format
                };

                // Update the existing thumbnail record in the database
                await connection.execute(
                    `UPDATE service_thumbnail
                    SET image_url = ?, width = ?, height = ?, size = ?, format = ?
                    WHERE thumbnail_id = ?`,
                    [newImage.url, newImage.width, newImage.height, newImage.size, newImage.format, imageId]
                );

                // Commit transaction
                await connection.commit();

                // After commit, delete the old image file from S3
                try {
                    const deleteParams = {
                        Bucket: S3_BUCKET_NAME,
                        Key: oldS3Key
                    };
                    await awsS3Bucket.deleteObject(deleteParams).promise();
                    console.log(`Deleted old image from S3 at ${s3Key}`);
                } catch (err) {
                    console.error('Error deleting old image from S3:', err.message);
                    throw new Error('Failed to delete old image from S3.');
                }

                // Retrieve the updated data
                const [output] = await connection.execute(
                    `SELECT * FROM service_thumbnail WHERE service_id = ? AND thumbnail_id = ?`,
                    [service_id, imageId]
                );

                return output.length > 0 ? output[0] : null;
            }

        } catch (error) {

            console.log(error);
            if (connection) {
                await connection.rollback();
                if (s3Key) {
                    const deleteParams = {
                        Bucket: S3_BUCKET_NAME,
                        Key: s3Key
                    };
                    try {
                        await awsS3Bucket.deleteObject(deleteParams).promise();
                        console.log(`Deleted image at ${deleteParams.Key} from S3 during rollback.`);
                    } catch (err) {
                        console.error('Error deleting uploaded image during rollback:', err.message);
                    }
                }
            }

            throw error;  // Rethrow the error to propagate it
        } finally {
            if (connection) {
                await connection.release();
            }
        }
    }





    static async createBookmarkService(userId, serviceId) {
        let connection;
        try {
            // Create a connection to the database
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();

            // Prepare the SQL statement to insert a bookmark
            const [rows] = await connection.execute(
                "INSERT INTO user_bookmark_services (user_id, service_id) VALUES (?, ?)",
                [userId, serviceId]
            );

            // Check if any row was affected
            if (rows.affectedRows === 0) {
                throw new Error('Error on inserting bookmark');
            }

            // Commit transaction
            await connection.commit();

            // Return the ID of the new bookmark
            return rows.insertId;

        } catch (error) {
            // If there's an error, rollback the transaction
            (await connection).rollback();
            throw new Error('Failed to create bookmark: ' + error.message);
        } finally {
            // Close the connection
            (await connection).release;
        }
    }

    static async removeBookmarkService(userId, serviceId) {

        let connection;
        try {
            // Create a connection to the database
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();

            const [result] = await connection.execute(
                "DELETE FROM user_bookmark_services WHERE user_id = ? AND service_id = ?",
                [userId, serviceId]
            );

            // Check if any row was affected
            if (result.affectedRows === 0) {
                throw new Error('No bookmark found to delete');
            }


            // Commit transaction
            await connection.commit();

            return { "Success": true };


        } catch (error) {
            // If there's an error, rollback the transaction
            (await connection).rollback();
            throw new Error('Failed to remove  bookmark: ' + error.message);
        } finally {
            // Close the connection
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

            // Begin transaction
            await connection.beginTransaction();


            // Delete the images from the database
            await connection.execute(
                "DELETE FROM service_images WHERE service_id = ?",
                [service_id]
            );

            await connection.execute(
                "DELETE FROM service_thumbnail WHERE service_id = ?",
                [service_id]
            );

            // Delete the plans from the database
            await connection.execute(
                "DELETE FROM service_plans WHERE service_id = ?",
                [service_id]
            );

            // Delete the service locations from the database
            await connection.execute(
                "DELETE FROM service_locations WHERE service_id = ?",
                [service_id]
            );

            // Delete the service itself
            await connection.execute(
                "DELETE FROM services WHERE service_id = ?",
                [service_id]
            );


            // Retrieve media_id for the user
            const [userResult] = await connection.execute(
                "SELECT media_id FROM users WHERE user_id = ?",
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }

            // Construct the base directory path using the retrieved media_id and service_id
            const base_dir = path.join(MEDIA_ROOT_PATH, 'media', media_id.toString(), 'services', service_id.toString());



            try {
                // Delete all files in the base_dir (images, thumbnail)
                if (fs.existsSync(base_dir)) {
                    const files = fs.readdirSync(base_dir);
                    for (const file of files) {
                        const filePath = path.join(base_dir, file);
                        await fs.promises.unlink(filePath);
                        console.log(`Deleted file: ${filePath}`);
                    }

                    // Optionally, remove the directory if empty
                    if (fs.readdirSync(base_dir).length === 0) {
                        fs.rmdirSync(base_dir);
                        console.log(`Deleted empty directory: ${base_dir}`);
                    }
                }

            } catch (err) {
                console.error('Error cleaning up files during rollback:', err.message);
            }




            // Commit transaction
            await connection.commit();

            // Return success response
            return { status: 'success', message: 'Service and related data deleted successfully' };
        } catch (error) {
            // Rollback transaction on error
            if (connection) {
                await connection.rollback();
            }
            console.error('Error during service deletion:', error.message);
            throw new Error(`Service deletion failed: ${error.message}`);
        } finally {
            // Ensure the connection is always released back to the pool
            if (connection) {
                connection.release();
            }
        }
    }




    static async getImageMetadata(imagePath) {
        try {
            // Ensure the file exists
            if (!fs.existsSync(imagePath)) {
                throw new Error('Image file does not exist');
            }

            const metadata = await sharp(imagePath).metadata();

            return {
                width: metadata.width,
                height: metadata.height,
                size: fs.statSync(imagePath).size, // Size in bytes
                format: metadata.format // Format of the image (e.g., jpeg, png)
            };
        } catch (error) {
            console.error('Error getting image metadata:', error);
            throw error;
        }
    }


}

module.exports = ServiceModel;