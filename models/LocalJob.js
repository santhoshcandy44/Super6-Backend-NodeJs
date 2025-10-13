const db = require('../config/database.js')
const sharp = require('sharp');
const he = require('he');
const { uploadToS3, deleteFromS3, deleteDirectoryFromS3 } = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');
const { sendLocalJobApplicantAppliedNotificationToKafka } = require('../kafka/notificationServiceProducer.js');
const { BASE_URL, PROFILE_BASE_URL, MEDIA_BASE_URL } = require('../config/config.js');
const { decodeCursor, encodeCursor } = require('./utils/pagination/cursor.js');

class LocalJob {
    static async getLocalJobs(userId, queryParam, pageSize, nextToken, initialRadius = 50) {
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
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `SELECT
                l.id,
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
                        l.status,
                        l.created_at,

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
                            u.created_at AS publisher_created_at,

                                ci.online AS user_online_status,

                        CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

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

                params = [
                    userLon,
                    userLat,
                    queryParam,
                    queryParam,
                    queryParam,
                    queryParam,
                    userId,
                    userId,
                    userLat,
                    userLon
                ];


                if (payload?.total_relevance) {
                    query += ` GROUP BY local_job_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                ) AND (
                                    (total_relevance = ? AND distance <= ?)
                                    OR (total_relevance < ? AND distance <= ?)
                                )`;

                    params.push(
                        radius,
                        payload.total_relevance, radius,
                        payload.total_relevance, radius
                    );
                } else {
                    query += ` GROUP BY local_job_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                )`;

                    params.push(radius);
                }


                if (payload) {
                    query += ` AND (
                            distance > ? 
                            OR (distance = ? AND total_relevance < ?) 
                            OR (distance = ? AND total_relevance = ? AND l.created_at < ?) 
                            OR (distance = ? AND total_relevance = ? AND l.created_at = ? AND l.id > ?)
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
                            l.created_at ASC,
                            l.id ASC
                            LIMIT ?`;
                params.push(pageSize);
            } else {
                query = `
                    SELECT
                    l.id,
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
                        l.created_at,

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
    u.created_at AS publisher_created_at,

      -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status,

    CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,

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
                params = [
                    userLon,
                    userLat,
                    userId,
                    userId,
                    userLat,
                    userLon
                ];

                query += ` GROUP BY local_job_id HAVING
    distance < ?`;

                params.push(radius);

                if (payload) {
                    query += ` AND (
                            distance > ? 
                            OR (distance = ? AND l.created_at < ?) 
                            OR (distance = ? AND l.created_at = ? AND l.id > ?)
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

                query += ` ORDER BY distance ASC, l.created_at DESC, l.id DESC LIMIT ?`;
                params.push(pageSize);
            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');

                    await connection.execute(
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
                    SELECT
                    l.id,
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
        l.status,
        l.created_at,

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
                            u.created_at AS publisher_created_at,
                                -- User online status (0 = offline, 1 = online)
                        ci.online AS user_online_status,

                            
                        CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                        CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,


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

                params = [
                    queryParam,
                    queryParam,
                    queryParam,
                    queryParam,
                    userId,
                    userId
                ];


                if (payload?.total_relevance) {
                    query += ` GROUP BY local_job_id HAVING
                                (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                ) AND (
                                    (total_relevance = ?)
                                    OR (total_relevance < ?)
                                )`;
                    params.push(payload.total_relevance, payload.total_relevance);
                } else {
                    query += ` GROUP BY local_job_id HAVING
                                (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                )`;
                }

                if (payload) {
                    query += `
                        AND (
                            total_relevance < ? 
                            OR (total_relevance = ? AND l.created_at < ?) 
                            OR (total_relevance = ? AND l.created_at = ? AND l.id > ?)
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
                                l.created_at DESC,
                                l.id ASC
                            LIMIT ?`;
                params.push(pageSize);
            } else {
                query = `
                SELECT
                l.id,
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
                        l.status,
                        l.created_at,

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
                    u.created_at AS publisher_created_at,

                        
    -- User online status (0 = offline, 1 = online)
    ci.online AS user_online_status, 

                            CASE WHEN ub.local_job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
                            CASE WHEN lja.candidate_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied


                FROM
                    local_jobs l
                LEFT JOIN
                    local_job_images li ON l.local_job_id = li.local_job_id
             
                LEFT JOIN
                    local_job_location ll ON l.local_job_id = ll.local_job_id
           
    
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
                    AND ll.longitude BETWEEN -180 AND 180`;

                params = [userId, userId];

                if (payload) {
                    query += ` AND (
                            l.created_at < ?
                            OR (l.created_at = ? AND l.id > ?)
                        )
                    `;

                    params.push(
                        payload.created_at,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` GROUP BY local_job_id ORDER BY l.created_at DESC, l.id ASC LIMIT ?`;

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
                    return await this.getLocalJobs(userId, queryParam, pageSize, nextToken, radius)
                }
            }
        }
        const items = {};
        let lastItem = null;

        await (async () => {
            for (let index = 0; index < results.length; index++) {
                const row = results[index];
                const local_job_id = row.local_job_id;
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
                                created_at: new Date(row.publisher_created_at).getFullYear().toString()
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
                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null
                        };
                    } catch (error) {
                        throw new Error("Error processing local job data");
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


        const allItems = Object.values(items)
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

    static async getGuestLocalJobs(userId, queryParam, userCoordsData, pageSize, nextToken, initialRadius = 50) {
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
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                    VALUES (?, 1, NOW(), ?)
                    ON DUPLICATE KEY UPDATE
                        popularity = popularity + 1,
                        last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `
                    SELECT
                        l.id,
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
                        l.status,
                        l.created_at,

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
                        u.created_at AS publisher_created_at,


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
                params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon];

                if (payload?.total_relevance) {
                    query += ` GROUP BY local_job_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                ) AND (
                                (total_relevance = ? AND distance <= ?)
                                OR (total_relevance < ? AND distance <= ?)
                            )`;
                    params.push(radius, payload.total_relevance, radius, payload.total_relevance, radius);
                } else {
                    query += ` GROUP BY local_job_id HAVING
                                distance < ? AND (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                )`;
                    params.push(radius);
                }

                if (payload) {
                    query += ` AND (
                            distance > ? 
                            OR (distance = ? AND total_relevance < ?) 
                            OR (distance = ? AND total_relevance = ? AND l.created_at < ?) 
                            OR (distance = ? AND total_relevance = ? AND l.created_at = ? AND l.id > ?)
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
                            l.created_at DESC,
                            l.id ASC
                        LIMIT ?`;

                params.push(pageSize);
            } else {
                query = `SELECT
                        l.id,
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
                         l.status,
                         l.created_at,

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
    u.created_at AS publisher_created_at,

    
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
    local_job_location ll ON l.local_job_id = ll.local_job_id


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

                params = [userLon, userLat, userLat, userLon];

                query += ` GROUP BY local_job_id HAVING distance < ?`;
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
        l.created_at DESC,
        l.id ASC
    LIMIT ?`;

                params.push(radius);
            }
        } else {
            if (queryParam) {
                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');
                    await connection.execute(
                        `INSERT INTO local_job_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );
                }

                query = `SELECT 
                        l.id,
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
                        l.status,
                        l.created_at,

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
                            u.created_at AS publisher_created_at,

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

                params = [queryParam, queryParam, queryParam, queryParam];

                if (payload?.total_relevance) {
                    query += ` GROUP BY local_job_id HAVING
                                (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                ) AND (
                                    (total_relevance = ?)
                                    OR (total_relevance < ?)
                                )`;
                    params.push(payload.total_relevance, payload.total_relevance);
                } else {
                    query += ` GROUP BY local_job_id HAVING
                                (
                                    title_relevance > 0 OR
                                    description_relevance > 0
                                )`;
                }


                if (payload) {
                    query += ` AND (
                            total_relevance < ? 
                            OR (total_relevance = ? AND l.created_at < ?) 
                            OR (total_relevance = ? AND l.created_at = ? AND l.id > ?)
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
                l.created_at DESC,
                l.id ASC

            LIMIT ?`;

                params.push(pageSize);
            } else {
                query = `
                SELECT
                       l.id,
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
                        l.created_at,
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

                params = [];

                if (payload) {
                    query += `
                        AND (
                            l.created_at < ?
                            OR (l.created_at = ? AND l.id > ?)
                        )
                    `;

                    params.push(
                        payload.created_at,
                        payload.created_at,
                        payload.id
                    );
                }

                query += ` GROUP BY local_job_id ORDER BY l.created_at DESC, l.id ASC LIMIT ?`;

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
                    return await this.getGuestLocalJobs(userId, queryParam, userCoordsData, pageSize, nextToken, radius)
                }
            }
        }

        const items = {};
        let lastItem = null;

        await (async () => {
            for (let index = 0; index < results.length; index++) {
                const row = results[index];
                const local_job_id = row.local_job_id;
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
                                created_at: new Date(row.publisher_created_at).getFullYear().toString()
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

                            distance: (row.distance !== null && row.distance !== undefined) ? row.distance : null,

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

        const allItems = Object.values(items)
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
                        await deleteFromS3(image_url);
                    } catch (err) { }
                    await connection.execute(`DELETE FROM local_job_images WHERE id = ?`, [id]);
                }
            }

            const image_urls = [];

            if (files) {
                for (const file of files) {
                    const newFileName = `${uuidv4()}-${file.originalname}`;
                    const s3Key = `media/${media_id}/local-jobs/${local_job_id}/${newFileName}`;

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
    l.id,            
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
                id: jobData[0].id,
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
                        await deleteFromS3(fileKey);
                    }
                } catch (delError) { }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    static async getPublishedLocalJobs(userId, pageSize, nextToken) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) throw new Error('User not exist');

        let query = `SELECT
                    l.id,    
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
                    l.status,
                    l.created_at,

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
                    u.created_at AS publisher_created_at

                FROM local_jobs l
                LEFT JOIN local_job_images li ON l.local_job_id = li.local_job_id
                LEFT JOIN local_job_location ll ON l.local_job_id = ll.local_job_id
            
                INNER JOIN users u ON l.created_by = u.user_id
                WHERE l.created_by = ?`;

        const params = [userId];

        const payload = nextToken ? decodeCursor(nextToken) : null;
        if (payload) {
            query += ' AND (l.created_at < ? OR (l.created_at = ? AND l.id > ?))';
            params.push(payload.created_at, payload.created_at, payload.id);
        }

        query += ` GROUP BY local_job_id 
               ORDER BY l.created_at DESC, l.id ASC
               LIMIT ?`;

        params.push(pageSize);

        const [results] = await db.execute(
            query,
            params
        );

        const items = {};
        let lastItem = null

        results.forEach((row, index) => {
            const localJobId = row.local_job_id;
            if (!items[localJobId]) {
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
                        created_at: new Date(row.publisher_created_at).getFullYear().toString()
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

            if (index == results.length - 1) lastItem = {
                created_at: row.created_at,
                id: row.id
            }
        });

        const allItems = Object.values(items)
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

    static async getLocalJobApplications(userId, localJobId, pageSize, nextToken) {
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) throw new Error('User not exist');

        const [jobCheckResult] = await db.query(
            'SELECT local_job_id FROM local_jobs WHERE local_job_id = ?',
            [localJobId]
        );

        if (jobCheckResult.length === 0) throw new Error('Local job not found');

        let query = `SELECT 
                a.id,
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

        ul.geo, ul.location_type, ul.updated_at
        
    FROM local_job_applicants a
    LEFT JOIN user_locations ul ON a.candidate_id = ul.user_id

    INNER JOIN users u ON a.candidate_id = u.user_id
    WHERE a.local_job_id = ?`;

        const params = [localJobId];

        const payload = nextToken ? decodeCursor(nextToken) : null;
        if (payload) {
            query += ' AND (a.is_reviewed > ? OR (a.is_reviewed = ? AND a.reviewed_at < ?) OR (a.is_reviewed = ? AND a.reviewed_at = ? AND a.id > ?))';
            params.push(
                payload.is_reviewed,
                payload.is_reviewed, payload.reviewed_at,
                payload.is_reviewed, payload.reviewed_at, payload.id
            );
        }

        query += ` GROUP BY applicant_id 
               ORDER BY a.is_reviewed ASC, a.reviewed_at DESC,  a.id ASC
               LIMIT ?`;

        params.push(pageSize);

        const [results] = await db.execute(
            query,
            params
        );

        const items = {};
        let lastItem = null

        results.forEach((row, index) => {
            const applicantId = row.applicant_id;
            if (!items[applicantId]) {
                items[applicantId] = {
                    applicant_id: applicantId,
                    applied_at: row.applied_at,
                    is_reviewed: !!row.is_reviewed,
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
                        created_at: new Date(row.applicant_created_at).getFullYear().toString()
                    }
                };
            }

            if (index == results.length - 1) lastItem = {
                is_reviewed: row.is_reviewed,
                reviewed_at: row.reviewed_at,
                id: row.id
            }
        });

        const allItems = Object.values(items)
        const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
        const hasPreviousPage = payload != null;
        const payloadToEncode = hasNextPage && lastItem ? {
            is_reviewed: lastItem.is_reviewed,
            reviewed_at: lastItem.reviewed_at,
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

            if (jobCheckResult.length === 0) throw new Error('Local job not found');

            const createdBy = jobCheckResult[0].created_by;
            const localJobTitle = jobCheckResult[0].title;

            connection = await db.getConnection();

            await connection.beginTransaction();

            const [rows] = await connection.execute(
                "INSERT INTO local_job_applicants (candidate_id, local_job_id) VALUES (?, ?)",
                [userId, localJobId]
            );

            if (rows.affectedRows === 0) throw new Error('Error on inserting local job');
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
            throw new Error('Failed to apply local job: ' + error.message);
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

            if (result.affectedRows === 0) throw new Error('No bookmark found to delete');
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

            await deleteDirectoryFromS3(s3Key);

            await connection.commit();
            return { status: 'success', message: 'Local job and related data deleted successfully' };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw new Error(`Local job deletion failed: ${error.message}`);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    static async localJobsSearchQueries(query) {
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
                        FROM local_job_search_queries 
                        WHERE search_term LIKE CONCAT(?, '%')
                        AND popularity > 10
                        ORDER BY popularity DESC
                    )
                    UNION ALL
                    (
                        SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 1 AS relevance_score
                        FROM local_job_search_queries 
                        WHERE ${likeConditions}
                        AND search_term NOT LIKE CONCAT(?, '%')
                        AND popularity > 10
                        ORDER BY popularity DESC
                    )
                    UNION ALL
                    (
                        SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 2 AS relevance_score
                        FROM local_job_search_queries 
                        WHERE search_term_concatenated LIKE CONCAT(?, '%')
                        AND search_term NOT LIKE CONCAT(?, '%')
                        AND NOT (${likeConditions})
                        AND popularity > 10
                        ORDER BY popularity DESC
                    )
                    UNION ALL
                    (
                        SELECT search_term, popularity, '' AS search_term_concatenated, (${matchCountSql}) AS match_count, 3 AS relevance_score
                        FROM local_job_search_queries 
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
                        FROM local_job_search_queries 
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
            throw error;
        } finally {
            if (connection) (await connection).release();
        }
    }
}

module.exports = LocalJob;