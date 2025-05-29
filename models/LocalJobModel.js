const { BASE_URL, PROFILE_BASE_URL, MEDIA_BASE_URL, S3_BUCKET_NAME } = require('../config/config.js');
const db = require('../config/database.js')
const sharp = require('sharp');
const he = require('he');
const moment = require('moment');
const { awsS3Bucket } = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');  // For unique file names
const { sendFCMNotification, getAccessToken } = require('../utils/fcmUtils.js');
const { sendLocalJobApplicantAppliedNotificationToKafka } = require('../kafka/producer.js');
const User = require('./User.js');


class LocalJobModel {



    static async getLocalJobsForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance = null, initialRadius = 50) {


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
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }


                // SQL query with Levenshtein distance
                query = `SELECT
    l.local_job_id AS local_job_id,
    l.title,
    l.description,
    l.company,
    l.age_min,
    l.age_max,
    l.salary_unit,
    l.salary_min,
    l.salary_max,
    l.marital_statuses,
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

                        ll.longitude,
                        ll.latitude,
                        ll.geo,
                        ll.location_type,
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

                        CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

                        CURRENT_TIMESTAMP AS initial_check_at,

                        ST_Distance_Sphere(
                            POINT(?, ?),
                            POINT(ll.longitude, ll.latitude)
                        ) * 0.001 AS distance,

                        -- Full-text search relevance scores
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) As total_relevance

                        FROM
                        local_jobs l

                    LEFT JOIN
                        local_job_images li ON l.local_job_id = li.local_job_id
            
                    LEFT JOIN
                        local_job_location ll ON l.local_job_id = ll.local_job_id

                    INNER JOIN
                        users u ON l.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?

                            LEFT JOIN local_job_applicants lja 
    ON l.local_job_id = lja.local_job_id AND lja.candidate_id = ?  

                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        ll.latitude BETWEEN -90 AND 90
                        AND ll.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180`;


                if (lastTimeStamp != null) {

                    query += ` AND l.created_at < ?`;
                } else {
                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;
                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY local_job_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            description_relevance > 0
                        ) AND (
                        (total_relevance = ? AND distance <= ?)  -- Fetch records with the same relevance and within the current distance
                        OR (total_relevance < ? AND distance <= ?)  -- Fetch records with lower relevance within the current distance
                    ) `;

                } else {
                    query += ` GROUP BY local_job_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            description_relevance > 0)`
                }

                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination


                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userId, userId, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];

                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userId, userId, userLat, userLon, radius, pageSize, offset];
                }

            } else {


                query = `
                    SELECT
    l.local_job_id AS local_job_id,
    l.title,
    l.company,
    l.description,
    l.age_min,
    l.age_max,
    l.salary_unit,
    l.salary_min,
    l.salary_max,
    l.marital_statuses,
    l.short_code,
        l.country,
                        l.state, 
                        l.status,

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


    ll.longitude,
    ll.latitude,
    ll.geo,
    ll.location_type,
    u.user_id AS publisher_id,
    u.first_name AS publisher_first_name,
    u.about AS about,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
    u.created_at AS created_at,

      -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

    CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
    CURRENT_TIMESTAMP AS initial_check_at,
CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

    
     ST_Distance_Sphere(
        POINT(?, ?),
        POINT(ll.longitude, ll.latitude)
    ) * 0.001 AS distance
    
FROM
    local_jobs l

LEFT JOIN
    local_job_images li ON l.local_job_id = li.local_job_id

LEFT JOIN
   local_job_location ll ON l.local_job_id = ll.local_job_id

   
INNER JOIN
    users u ON l.created_by = u.user_id

    LEFT JOIN user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?

    LEFT JOIN local_job_applicants lja 
    ON l.local_job_id = lja.local_job_id AND lja.candidate_id = ?  

    LEFT JOIN chat_info ci ON u.user_id = ci.user_id  

WHERE
    ll.latitude BETWEEN -90 AND 90
    AND ll.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180 
`

                if (!lastTimeStamp) {

                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND l.created_at < ? `;

                }

                query += ` GROUP BY local_job_id HAVING
    distance < ?
    ORDER BY
distance LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;


                if (lastTimeStamp) {
                    params = [userLon, userLat, userId, userId, userLat, userLon, lastTimeStamp, radius, pageSize, offset];
                } else {

                    params = [userLon, userLat, userId, userId, userLat, userLon, radius, pageSize, offset];
                }


            }

        } else {

            if (queryParam) {


                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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
                                   l.local_job_id AS local_job_id,
    l.title,
    l.description,
    l.company,
    l.age_min,
    l.age_max,
    l.salary_unit,
    l.salary_min,
    l.salary_max,
    l.marital_statuses,
    l.short_code,
        l.country,
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

    
        
                        ll.longitude,
                        ll.latitude,
                        ll.geo,
                        ll.location_type,
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

                            
                        CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

                        CURRENT_TIMESTAMP AS initial_check_at,


                        -- Full-text search relevance scores
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
        
                        FROM
                        local_jobs l
                    LEFT JOIN
                        local_job_images li ON l.local_job_id = li.local_job_id
                    LEFT JOIN
                        local_job_location ll ON l.local_job_id = ll.local_job_id
                  
                    INNER JOIN
                        users u ON l.created_by = u.user_id
                    LEFT JOIN
                        user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?

                        LEFT JOIN local_job_applicants lja 
    ON l.local_job_id = lja.local_job_id AND lja.candidate_id = ?

                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        ll.latitude BETWEEN -90 AND 90
                        AND ll.longitude BETWEEN -180 AND 180 `;



                if (lastTimeStamp != null) {

                    query += ` AND l.created_at < ?`;

                } else {
                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY local_job_id HAVING
                        (
                            title_relevance > 0 OR
                            description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;

                } else {
                    query += ` GROUP BY local_job_id HAVING
                        (
                            title_relevance > 0 OR
                            description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, userId, userId, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, userId, userId, pageSize, offset];
                }

            } else {

                query = `
                SELECT
                   l.local_job_id AS local_job_id,
    l.title,
    l.description,
    l.company,
    l.age_min,
    l.age_max,
    l.salary_unit,
    l.salary_min,
    l.salary_max,
    l.marital_statuses,
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


    
                    ll.longitude,
                    ll.latitude,
                    ll.geo,
                    ll.location_type,

                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,

                        u.created_at AS created_at,

                        
    -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status, 

                            CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                            CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

                        CURRENT_TIMESTAMP AS initial_check_at


                FROM
                    local_jobs l
                LEFT JOIN
                    local_job_images li ON l.local_job_id = li.local_job_id
             
                LEFT JOIN
                    local_job_location ll ON l.local_job_id = li.local_job_id
           
    
                 LEFT JOIN
                 user_bookmark_local_jobs ub ON l.local_job_id = ub.local_job_id AND ub.user_id = ?

                 LEFT JOIN local_job_applicants lja 
    ON l.local_job_id = lja.local_job_id AND lja.candidate_id = ? 

                INNER JOIN
                    users u ON l.created_by = u.user_id
           
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    
                WHERE
                    ll.latitude BETWEEN -90 AND 90
                    AND ll.longitude BETWEEN -180 AND 180`


                if (!lastTimeStamp) {
                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND l.created_at < ?`;
                }

                query += ` GROUP BY local_job_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                if (lastTimeStamp) {
                    params = [userId, userId, lastTimeStamp, pageSize, offset];

                } else {
                    params = [userId, userId, pageSize, offset];
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
                    return await this.getLocalJobsForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, radius)

                } else {
                    console.log("Reached maximum distance limit. Returning available results.");
                    // Process available results as needed, limited to requestedLimit
                    // const limitedResults = results.slice(0, requestedLimit);
                    // console.log("Fetched Results:", limitedResults);
                }
            }

        }

        const items = {};  // Assuming services is declared somewhere

        // Wrap the code in an async IIFE (Immediately Invoked Function Expression)
        await (async () => {

            for (const row of results) {
                const local_job_id = row.local_job_id;
                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                // Initialize service entry if it doesn't exist
                if (!items[local_job_id]) {
                    try {


                        items[local_job_id] = {
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
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url
                            })) : [],
                            location: row.longitude ? {
                                longitude: row.longitude,
                                latitude: row.latitude,
                                geo: row.geo,
                                location_type: row.location_type
                            } : null,
                            is_bookmarked: Boolean(row.is_bookmarked),
                            is_applied: Boolean(row.is_applied),

                            initial_check_at: formattedDate,
                            total_relevance: row.total_relevance,
                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null,

                        };
                    } catch (error) {
                        // Handle the error if the async operation fails
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }
            }


        })();


        await connection.release();

        return Object.values(items);
    }


    static async guestGetLocalJobs(userId, queryParam, page, pageSize, lastTimeStamp,
        lastTotalRelevance = null, userCoordsData = null, initialRadius = 50) {

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
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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
                    

                        ll.longitude,
                        ll.latitude,
                        ll.geo,
                        ll.location_type,
                        u.user_id AS publisher_id,
                        u.first_name AS publisher_first_name,
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
                            POINT(ll.longitude, ll.latitude)
                        ) * 0.001 AS distance,

                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       

                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
                   
                        FROM local_jobs l
                    LEFT JOIN
                        local_job_images li ON l.local_job_id = li.local_job_id
                 
                    LEFT JOIN
                        local_job_location ll ON l.local_job_id = ll.local_job_id

                   
                    INNER JOIN
                        users u ON l.created_by = u.user_id
               
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                        ll.latitude BETWEEN -90 AND 90
                        AND ll.longitude BETWEEN -180 AND 180
                        AND ? BETWEEN -90 AND 90
                        AND ? BETWEEN -180 AND 180 `;


                if (lastTimeStamp != null) {
                    query += `AND l.created_at < ?`;
                } else {
                    query += `AND l.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY local_job_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            description_relevance > 0 
                                                    ) AND (
                        (total_relevance = ? AND distance <= ?) 
                        OR (total_relevance < ? AND distance <= ?)  
                    ) `;

                } else {
                    query += ` GROUP BY local_job_id HAVING
                        distance < ? AND (
                            title_relevance > 0 OR
                            description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];

                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, radius, pageSize, offset];
                }

            } else {

                query = `SELECT
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




    ll.longitude,
    ll.latitude,
    ll.geo,
    ll.location_type,
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
        POINT(ll.longitude, ll.latitude)
    ) * 0.001 AS distance
    
FROM
    local_jobs l
LEFT JOIN
    local_job_images li ON l.local_job_id = li.local_job_id

LEFT JOIN
    local_job_location ll ON l.local_job_id = li.local_job_id


INNER JOIN
    users u ON l.created_by = u.user_id

LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
WHERE
    ll.latitude BETWEEN -90 AND 90
    AND ll.longitude BETWEEN -180 AND 180
    
    AND 
    ? BETWEEN -90 AND 90
    AND ? BETWEEN -180 AND 180`


                if (!lastTimeStamp) {

                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND l.created_at < ?`;

                }


                query += ` GROUP BY local_job_id HAVING
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
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );

                }

                // SQL query with Levenshtein distance
                query = `SELECT 
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

                        ll.longitude,
                        ll.latitude,
                        ll.geo,
                        ll.location_type,
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
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
                       
                        -- Total relevance score
                        COALESCE(MATCH(l.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                        COALESCE(MATCH(l.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0)  As total_relevance
                   
                        
                        FROM
                        local_jobs l
                    LEFT JOIN
                        local_job_images li ON l.local_job_id = li.local_job_id
                   LEFT JOIN

                        local_job_location ll ON l.local_job_id = ll.local_job_id

                 

                    INNER JOIN
                        users u ON l.created_by = u.user_id
                        LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status
                    WHERE
                        ll.latitude BETWEEN -90 AND 90
                        AND ll.longitude BETWEEN -180 AND 180 `;


                if (lastTimeStamp != null) {

                    query += ` AND l.created_at < ?`;

                } else {
                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {

                    query += ` GROUP BY local_job_id HAVING
                        (
                            title_relevance > 0 OR
                            description_relevance > 0
                        ) AND (
                        (total_relevance = ? )  -- Fetch records with the same relevance
                        OR (total_relevance < ?)  -- Fetch records with lower relevance
                    ) `;

                } else {
                    query += ` GROUP BY local_job_id HAVING
                        (
                            title_relevance > 0 OR
                            description_relevance > 0
                        )`
                }



                query += ` ORDER BY
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, pageSize, offset];
                }


            } else {
                query = `
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

    

                    ll.longitude,
                    ll.latitude,
                    ll.geo,
                    ll.location_type,
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
    ci.online AS user_online_status

                FROM
                    local_jobs l

                   LEFT JOIN
                        local_job_images li ON l.local_job_id = li.local_job_id
          
                LEFT JOIN
                    local_job_location ll ON l.local_job_id = ll.local_job_id
           
                
                INNER JOIN
                    users u ON l.created_by = u.user_id

                    
                    LEFT JOIN
    chat_info ci ON u.user_id = ci.user_id  -- Join chat_info to get user online status

                    WHERE
                    ll.latitude BETWEEN -90 AND 90
                    AND ll.longitude BETWEEN -180 AND 180`


                if (!lastTimeStamp) {

                    query += ` AND l.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND l.created_at < ?`;
                }

                query += ` GROUP BY local_job_id LIMIT ? OFFSET ?`;

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
                    // Increase distance and fetch again
                    radius += 30;
                    console.log(`Only ${availableResults} results found. Increasing distance to ${radius} km.`);
                    await connection.release();
                    return await this.guestGetLocalJobs(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, userCoordsData, radius)

                } else {
                    console.log("Reached maximum distance limit. Returning available results.");
                    // Process available results as needed, limited to requestedLimit
                    // const limitedResults = results.slice(0, requestedLimit);
                    // console.log("Fetched Results:", limitedResults);
                }
            }

        }


        const items = {};

        await (async () => {

            for (const row of results) {

                const local_job_id = row.local_job_id;

                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                if (!items[local_job_id]) {
                    try {
                        items[local_job_id] = {
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
                            images: row.images ? JSON.parse(row.images).map(image => ({
                                ...image,
                                image_url: MEDIA_BASE_URL + "/" + image.image_url
                            })) : [],
                            location: row.longitude ? {
                                longitude: row.longitude,
                                latitude: row.latitude,
                                geo: row.geo,
                                location_type: row.location_type
                            } : null,
                            is_bookmarked: Boolean(row.is_bookmarked),

                            initial_check_at: formattedDate,
                            total_relevance: row.total_relevance,
                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null,

                        };
                    } catch (error) {
                        console.error(error);
                        throw new Error("Error processing service data");
                    }
                }
            }

        })();

        await connection.release();

        return Object.values(items);
    }


    static async createOrUpdateLocalJob(user_id, title, description, company, age_min, age_max, marital_statuses,
        salary_unit, salary_min, salary_max, country, state, files, locationJson, keepImageIdsArray, local_job_id) {
        let connection;
        const uploadedFiles = [];

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            let jobExists = false;

            if (local_job_id) {
                const [existingJobResult] = await connection.execute(
                    'SELECT local_job_id FROM local_jobs WHERE local_job_id = ? AND created_by = ?',
                    [local_job_id, user_id]
                );

                if (existingJobResult.length > 0) {
                    jobExists = true;
                }
            }

            if (jobExists) {

                await connection.execute(
                    `UPDATE local_jobs
                     SET title = ?, description = ?, company = ?, age_min = ?, age_max = ?, marital_statuses = ?,
                         salary_unit = ?, salary_min = ?, salary_max = ?, country = ?, state = ?, updated_at = NOW()
                     WHERE local_job_id = ?`,
                    [title, description, company, age_min, age_max, JSON.stringify(
                        marital_statuses
                    ),
                        salary_unit, salary_min, salary_max, country, state, local_job_id]
                );
            } else {
                const [insertResult] = await connection.execute(
                    `INSERT INTO local_jobs (created_by, title, description, company, age_min, age_max, marital_statuses,
                     salary_unit, salary_min, salary_max, country, state)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [user_id, title, description, company, age_min, age_max, JSON.stringify(
                        marital_statuses
                    ),
                        salary_unit, salary_min, salary_max, country, state]
                );
                local_job_id = insertResult.insertId;
            }


            const [userResult] = await connection.execute(
                'SELECT media_id FROM users WHERE user_id = ?',
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) throw new Error("Unable to retrieve media_id.");

            const [existingImages] = await connection.execute(
                `SELECT id, image_url FROM local_job_images WHERE local_job_id = ?`,
                [local_job_id]
            );

            for (const image of existingImages) {
                const { id, image_url } = image;
                if (!keepImageIdsArray.includes(id)) {
                    try {
                        await awsS3Bucket.deleteObject({ Bucket: S3_BUCKET_NAME, Key: image_url }).promise();
                    } catch (err) {
                        console.error('Error deleting image from S3:', err.message);
                    }

                    await connection.execute(`DELETE FROM local_job_images WHERE id = ?`, [id]);
                }
            }

            const image_urls = [];

            if (files) {
                for (const file of files) {
                    const newFileName = `${uuidv4()}-${file.originalname}`;
                    const s3Key = `media/${media_id}/local-jobs/${local_job_id}/${newFileName}`;
                    const uploadParams = {
                        Bucket: S3_BUCKET_NAME,
                        Key: s3Key,
                        Body: file.buffer,
                        ContentType: file.mimetype,
                        ACL: 'public-read',
                    };

                    const uploadResult = await awsS3Bucket.upload(uploadParams).promise();
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
                    `INSERT INTO local_job_images (local_job_id, image_url, width, height, size, format)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [local_job_id, image.url, image.width, image.height, image.size, image.format]
                );
            }

            if (locationJson) {
                const decoded = he.decode(locationJson);
                const location = JSON.parse(decoded);

                const [locResult] = await connection.execute(
                    `SELECT COUNT(*) as count FROM local_job_location WHERE local_job_id = ?`,
                    [local_job_id]
                );

                if (locResult[0].count > 0) {
                    await connection.execute(
                        `UPDATE local_job_location
                         SET longitude = ?, latitude = ?, geo = ?, location_type = ?
                         WHERE local_job_id = ?`,
                        [location.longitude, location.latitude, location.geo, location.location_type, local_job_id]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO local_job_location (local_job_id, longitude, latitude, geo, location_type)
                         VALUES (?, ?, ?, ?, ?)`,
                        [local_job_id, location.longitude, location.latitude, location.geo, location.location_type]
                    );
                }
            }

            await connection.commit();


            const [jobData] = await connection.execute(
                `SELECT 
    l.local_job_id,
    l.title,
    l.description,
    l.company,
    l.age_min,
    l.age_max,
    l.marital_statuses,
    l.salary_unit,
    l.salary_min,
    l.salary_max,
    l.country,
    l.state,
    l.status,
    l.short_code,
    l.created_by,

    -- User (publisher) details
    u.user_id AS publisher_id,
    u.first_name AS publisher_first_name,
    u.last_name AS publisher_last_name,
    u.email AS publisher_email,
    u.is_email_verified AS publisher_email_verified,
    u.profile_pic_url AS publisher_profile_pic_url,
    u.profile_pic_url_96x96 AS publisher_profile_pic_url_96x96,
    u.created_at AS publisher_created_at,

    -- Location
    loc.longitude,
    loc.latitude,
    loc.geo,
    loc.location_type,

    -- Images
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
        ']'), '[]') AS images

FROM local_jobs l
JOIN users u ON l.created_by = u.user_id
LEFT JOIN local_job_location loc ON l.local_job_id = loc.local_job_id
LEFT JOIN local_job_images li ON l.local_job_id = li.local_job_id
WHERE l.local_job_id = ?
GROUP BY l.local_job_id;
`,
                [local_job_id]
            );


            if (jobData.length === 0) {
                throw new Error("Failed to fetch local job details after creation/update.");
            }

            const job = {
                user: {
                    user_id: jobData[0].publisher_id,
                    first_name: jobData[0].publisher_first_name,
                    last_name: jobData[0].publisher_last_name,
                    email: jobData[0].publisher_email,
                    is_email_verified: !!jobData[0].publisher_email_verified,
                    profile_pic_url: jobData[0].publisher_profile_pic_url
                        ? PROFILE_BASE_URL + "/" + jobData[0].publisher_profile_pic_url
                        : null,
                    profile_pic_url_96x96: jobData[0].publisher_profile_pic_url_96x96
                        ? PROFILE_BASE_URL + "/" + jobData[0].publisher_profile_pic_url_96x96
                        : null,
                    created_at: new Date(jobData[0].publisher_created_at).getFullYear().toString(),
                },
                local_job_id: jobData[0].local_job_id,
                title: jobData[0].title,
                description: jobData[0].description,
                company: jobData[0].company,
                age_min: jobData[0].age_min,
                age_max: jobData[0].age_max,
                marital_statuses: JSON.parse(jobData[0].marital_statuses),
                salary_unit: jobData[0].salary_unit,
                salary_min: jobData[0].salary_min,
                salary_max: jobData[0].salary_max,
                country: jobData[0].country,
                state: jobData[0].state,
                status: jobData[0].status,
                short_code: BASE_URL + "/local-job/" + jobData[0].short_code,
                images: jobData[0].images ? JSON.parse(jobData[0].images).map(image => ({
                    ...image,
                    image_url: MEDIA_BASE_URL + "/" + image.image_url
                })) : [],
                location: jobData[0].longitude ? {
                    longitude: jobData[0].longitude,
                    latitude: jobData[0].latitude,
                    geo: jobData[0].geo,
                    location_type: jobData[0].location_type
                } : null
            };


            return job;

        } catch (error) {
            if (connection) {
                await connection.rollback();
                try {
                    for (const fileKey of uploadedFiles) {
                        await awsS3Bucket.deleteObject({ Bucket: S3_BUCKET_NAME, Key: fileKey }).promise();
                    }
                } catch (delError) {
                    console.error('Error rolling back S3 uploads:', delError.message);
                }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    static async getPublishedLocalJobs(userId) {


        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }


        const [results] = await db.query(
            `  SELECT
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
   


                    ll.longitude,
                    ll.latitude,
                    ll.geo,
                    ll.location_type,
                    u.user_id AS publisher_id,
                    u.first_name AS publisher_first_name,
                    u.last_name AS publisher_last_name,
                    u.email AS publisher_email,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS created_at

                FROM local_jobs l
                LEFT JOIN local_job_images li ON l.local_job_id = li.local_job_id
                LEFT JOIN local_job_location ll ON l.local_job_id = ll.local_job_id
            

                INNER JOIN users u ON l.created_by = u.user_id
                WHERE l.created_by = ? GROUP BY local_job_id`,

            [userId]
        );

        const items = {};

        results.forEach(row => {
            const localJobId = row.local_job_id;

            if (!items[localJobId]) {
                const date = new Date(row.publisher_created_at);
                const createdAtYear = date.getFullYear().toString();

                items[localJobId] = {
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
                        created_at: createdAtYear
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
            }
        });


        return Object.values(items);
    }


    static async getLocalJobApplicants(userId, localJobId, page, pageSize, lastTimeStamp) {

        const [jobCheckResult] = await db.query(
            'SELECT local_job_id FROM local_jobs WHERE local_job_id = ?',
            [localJobId]
        );


        if (jobCheckResult.length === 0) {
            throw new Error('Local job not found');
        }

        let query = `SELECT 
                a.applicant_id AS applicant_id,
        a.local_job_id AS local_job_id,
        a.candidate_id,
        a.applied_at,
        a.is_reviewed,
        a.reviewed_at,
        u.first_name,
        u.last_name,
        u.email,
        u.is_email_verified,
        u.profile_pic_url,
        u.profile_pic_url_96x96,
        u.created_at AS applicant_created_at,
        u.phone_country_code,
        u.phone_number,
        u.is_phone_verified,

        ul.geo, ul.location_type, ul.updated_at,

            CURRENT_TIMESTAMP AS initial_check_at
        
    FROM local_job_applicants a
    LEFT JOIN user_locations ul ON a.candidate_id = ul.user_id

    INNER JOIN users u ON a.candidate_id = u.user_id
    WHERE a.local_job_id = ?`;

        if (!lastTimeStamp) {
            query += ` AND a.applied_at < CURRENT_TIMESTAMP`;
        } else {
            query += ` AND a.applied_at < ?`;
        }

        query += ` GROUP BY applicant_id 
        ORDER BY a.is_reviewed ASC, a.reviewed_at ASC
        LIMIT ? OFFSET ?`;

        const offset = (page - 1) * pageSize;

        let params;

        if (lastTimeStamp) {
            params = [localJobId, lastTimeStamp, pageSize, offset];

        } else {
            params = [localJobId, pageSize, offset];
        }

        const [results] = await db.query(
            query,
            params
        );

        const items = {};


        results.forEach(row => {
            const applicantId = row.applicant_id;
            const createdAtYear = new Date(row.applicant_created_at).getFullYear().toString();

            if (!items[applicantId]) {
                items[applicantId] = {
                    applicant_id: applicantId,
                    applied_at: row.applied_at,
                    is_reviewed: !!row.is_reviewed,
                    initial_check_at: row.initial_check_at,
                    user: {
                        user_id: applicantId,
                        first_name: row.first_name,
                        last_name: row.last_name,
                        email: row.email,
                        is_email_verified: !!row.is_email_verified,
                        phone_country_code: row.phone_country_code || null,
                        phone_number: row.phone_number || null,
                        is_phone_verified: !!row.is_phone_verified,
                        profile_pic_url: row.profile_pic_url
                            ? PROFILE_BASE_URL + "/" + row.profile_pic_url
                            : null,
                        profile_pic_url_96x96: row.profile_pic_url_96x96
                            ? PROFILE_BASE_URL + "/" + row.profile_pic_url_96x96
                            : null,
                        geo: row.geo,
                        created_at: createdAtYear
                    }
                };
            }
        });



        return Object.values(items);
    }


    static async markAsReviewed(userId, localJobId, applicant_id) {

        const [jobCheckResult] = await db.query(
            'SELECT local_job_id FROM local_jobs WHERE local_job_id = ? AND created_by = ?',
            [localJobId, userId]
        );


        if (jobCheckResult.length === 0) {
            throw new Error('Local job not found');
        }

        const [result] = await db.query(
            `UPDATE local_job_applicants
             SET is_reviewed = 1,
                 reviewed_at = NOW()
             WHERE local_job_id = ? AND applicant_id = ?`,
            [localJobId, applicant_id]
        );

        return result;
    }

    static async unmarkAsReviewed(userId, localJobId, applicant_id) {

        const [jobCheckResult] = await db.query(
            'SELECT local_job_id FROM local_jobs WHERE local_job_id = ? AND created_by = ?',
            [localJobId, userId]
        );


        if (jobCheckResult.length === 0) {
            throw new Error('Local job not found');
        }

        const [result] = await db.query(
            `UPDATE local_job_applicants
             SET is_reviewed = 0,
                 reviewed_at = NULL
             WHERE local_job_id = ? AND applicant_id = ?`,
            [localJobId, applicant_id]
        );

        return result;
    }


    static async applyLocalJob(userId, localJobId) {
        let connection;
        try {
            const [jobCheckResult] = await db.query(
                'SELECT created_by, title FROM local_jobs WHERE local_job_id = ?',
                [localJobId, userId]
            );


            if (jobCheckResult.length === 0) {
                throw new Error('Local job not found');
            }

            const createdBy = jobCheckResult[0].created_by;
            const localJobTitle = jobCheckResult[0].title;

            connection = await db.getConnection();

            await connection.beginTransaction();


            const [rows] = await connection.execute(
                "INSERT INTO local_job_applicants (candidate_id, local_job_id) VALUES (?, ?)",
                [userId, localJobId]
            );

            if (rows.affectedRows === 0) {
                throw new Error('Error on inserting local job');
            }

            await connection.commit();


            const kafkaKey = `${localJobId}:${createdBy}:${userId}`

            sendLocalJobApplicantAppliedNotificationToKafka(kafkaKey, {
                user_id: createdBy,
                candidate_id: userId,
                local_job_title: localJobTitle,
                applicant_id: rows.insertId
            })

            return rows.insertId;

        } catch (error) {
            (await connection).rollback();
            throw new Error('Failed to create local job: ' + error.message);
        } finally {
            (await connection).release;
        }
    }






    static async bookmarkLocalJob(userId, localJobId) {
        let connection;
        try {
            connection = await db.getConnection();

            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "INSERT INTO user_bookmark_local_jobs (user_id, local_job_id) VALUES (?, ?)",
                [userId, localJobId]
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

    static async removeBookmarkLocalJob(userId, localJobId) {

        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [result] = await connection.execute(
                "DELETE FROM user_bookmark_local_jobs WHERE user_id = ? AND local_job_id = ?",
                [userId, localJobId]
            );


            if (result.affectedRows === 0) {
                throw new Error('No bookmark found to delete');
            }

            await connection.commit();

            return { "Success": true };


        } catch (error) {
            (await connection).rollback();
            throw new Error('Failed to remove bookmark: ' + error.message);
        } finally {
            (await connection).release;
        }
    }

    static async deleteLocalJob(user_id, local_job_id) {
        let connection;
        try {
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();


            await connection.execute(
                "DELETE FROM local_job_images WHERE local_job_id = ?",
                [local_job_id]
            );


            await connection.execute(
                "DELETE FROM local_job_location WHERE local_job_id = ?",
                [local_job_id]
            );

            await connection.execute(
                "DELETE FROM local_jobs WHERE local_job_id = ?",
                [local_job_id]
            );


            const [userResult] = await connection.execute(
                "SELECT media_id FROM users WHERE user_id = ?",
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }


            const s3Key = 'media/' + media_id.toString() + '/local-jobs/' + local_job_id.toString();


            const listedObjects = await awsS3Bucket.listObjectsV2({
                Bucket: S3_BUCKET_NAME,
                Prefix: s3Key
            }).promise();

            // Check if there are objects to delete
            if (listedObjects?.Contents?.length > 0) {
                const deleteParams = {
                    Bucket: S3_BUCKET_NAME,
                    Delete: {
                        Objects: listedObjects.Contents.map(obj => ({ Key: obj.Key }))
                    }
                };

                await awsS3Bucket.deleteObjects(deleteParams).promise();
                console.log(`Deleted all files inside: ${s3Key}`);

            }


            await connection.commit();

            return { status: 'success', message: 'Local job and related data deleted successfully' };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            console.error('Error during used product deletion:', error.message);
            throw new Error(`Used product deletion failed: ${error.message}`);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }


    static async LocalJobsSearchQueries(query) {

        let connection;

        try {
            connection = await db.getConnection();

            // Trim leading and trailing spaces, remove excessive whitespace, and convert to lowercase
            const trimmedQuery = query.trim();
            const cleanQuery = trimmedQuery.replace(/\s+/g, ' '); // Replace multiple spaces with a single space
            const lowercaseQuery = cleanQuery.toLowerCase(); // Convert query to lowercase

            // Escape the query to prevent SQL injection
            const escapedQuery = connection.escape(lowercaseQuery); // Escaping directly for use in SQL

            // Split the query into individual words
            const words = cleanQuery.split(' '); // e.g., ['texi', '2024']

            // Remove spaces from the query to match concatenated search terms
            const concatenatedQuery = escapedQuery.replace(/ /g, ''); // e.g., 'bluaa2024'


            // Create LIKE conditions for partial match (all words should be present)
            const likeConditions = words.map(word => {
                const escapedWord = connection.escape(word);
                return `search_term LIKE CONCAT('%', ${escapedWord}, '%')`;
            }).join(' AND ');

            // Create LIKE conditions for concatenated match
            const concatenatedLikeConditions = words.map(word => {
                const escapedWord = connection.escape(word);
                return `search_term_concatenated LIKE CONCAT('%', ${escapedWord}, '%')`;
            }).join(' AND ');

            const maxWords = 10; // Define a reasonable max number of words to check in search_term
            const levenshteinConditions = [];
            const matchCounts = [];

            for (const word of words) {
                const escapedWord = connection.escape(word);

                const levenshteinCondition = [];
                const matchCountCondition = [];

                // Dynamically build the Levenshtein conditions for each position up to maxWords
                for (let i = 1; i <= maxWords; i++) {
                    levenshteinCondition.push(`levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(search_term, ' ', ${i}), ' ', -1), ${escapedWord}) < 3`);
                    matchCountCondition.push(`IF(levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(search_term, ' ', ${i}), ' ', -1), ${escapedWord}) < 3, 1, 0)`);
                }

                // Combine the conditions for this word
                levenshteinConditions.push(`(${levenshteinCondition.join(' OR ')})`);
                matchCounts.push(`(${matchCountCondition.join(' OR ')})`);
            }

            // Combine the conditions for all query words
            const levenshteinSql = levenshteinConditions.join(' OR ');
            const matchCountSql = matchCounts.join(' + ');

            // Your final SQL query logic stays the same
            const sql = `
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 0 AS relevance_score
                    FROM local_job_search_queries 
                    WHERE search_term LIKE CONCAT(${escapedQuery}, '%') -- Exact match that starts with the search query
                    AND popularity > 10  -- Ensure popularity is greater than 10

                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 1 AS relevance_score
                    FROM local_job_search_queries 
                    WHERE ${likeConditions} -- Partial match (contains all words)
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from partial results
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 2 AS relevance_score
                    FROM local_job_search_queries 
                    WHERE search_term_concatenated LIKE CONCAT(${concatenatedQuery}, '%') -- Concatenated match
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from concatenated results
                    AND NOT (${likeConditions}) -- Exclude partial matches containing all words
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, (${matchCountSql}) AS match_count, 3 AS relevance_score
                    FROM local_job_search_queries 
                    WHERE (${levenshteinSql}) -- Levenshtein distance match for misspelled words
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from Levenshtein results
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 4 AS relevance_score
                    FROM local_job_search_queries 
                    WHERE ${concatenatedLikeConditions} -- Match each word in the concatenated form
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches
                    AND NOT (${likeConditions}) -- Exclude partial matches containing all words
                    AND popularity > 10  -- Ensure popularity is greater than 100
                    ORDER BY popularity DESC
                )
                ORDER BY
                    relevance_score ASC, -- Order by relevance score (exact match is highest priority)
                    match_count DESC, -- Then order by number of matched words based on Levenshtein distance
                    popularity DESC -- Finally order by popularity 

                    LIMIT 10;
            `;

            // Execute the query
            const [results] = await connection.execute(sql);

            return results;

        } catch (error) {
            console.log(error);
            throw error;
        } finally {
            if (connection) {
                // Close the connection
                (await connection).release();
            }
        }

    }

}

module.exports = LocalJobModel;