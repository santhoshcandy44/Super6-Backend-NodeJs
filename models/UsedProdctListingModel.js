const { BASE_URL, PROFILE_BASE_URL, MEDIA_BASE_URL, S3_BUCKET_NAME } = require('../config/config');
const db = require('../config/database')
const sharp = require('sharp');
const he = require('he');
const moment = require('moment');
const { awsS3Bucket } = require('../config/awsS3.js')
const { v4: uuidv4 } = require('uuid');  // For unique file names


class UsedProductListingModel {

    static async createOrUpdateUsedProductListing(user_id, name, description, price, price_unit, country, state, files, locationJson, keepImageIdsArray, product_id) {
        let connection;
        const uploadedFiles = [];  // Array to track uploaded S3 files for rollback


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

            // Retrieve media_id for the user
            const [userResult] = await connection.execute(
                'SELECT media_id FROM users WHERE user_id = ?',
                [user_id]
            );

            const media_id = userResult[0]?.media_id;
            if (!media_id) {
                throw new Error("Unable to retrieve media_id.");
            }



            // Remove images that are not in the keepImageIdsArray
            const [existingImages] = await connection.execute(
                `SELECT id, image_url FROM used_product_listing_images WHERE product_id = ?`,
                [product_id]
            );

            for (const existingImage of existingImages) {
                const { id, image_url } = existingImage;
                if (!keepImageIdsArray.includes(id) && productExists) {
                    // Delete image from S3
                    try {
                        await awsS3Bucket.deleteObject({
                            Bucket: S3_BUCKET_NAME,
                            Key: image_url,
                        }).promise();
                        console.log(`Deleted image from S3: ${image_url}`);
                    } catch (deleteError) {
                        console.error('Error deleting image from S3 during cleanup:', deleteError.message);
                    }

                    // Delete image from the database
                    await connection.execute(
                        `DELETE FROM used_product_listing_images WHERE id = ?`,
                        [id]
                    );
                }
            }



            // Handle file uploads for images
            const image_urls = [];


            if (files) {
                for (const file of files) {
                    const newFileName = `${uuidv4()}-${file.originalname}`;
                    const s3Key = `media/${media_id}/used-product-listings/${product_id}/${newFileName}`;

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


            // Insert image URLs into the database
            for (const image of image_urls) {
                await connection.execute(
                    `INSERT INTO used_product_listing_images (product_id, image_url, width, height, size, format)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                    [product_id, image.url, image.width, image.height, image.size, image.format]
                );
            }


            // Insert location if provided
            if (locationJson) {
                const decodedLocation = he.decode(locationJson);

                if (decodedLocation) {

                    const location = JSON.parse(decodedLocation);

                    if (!productExists) {
                        // Insert new location if product does not exist
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
                        // Update existing product location
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

            // If no product data found, return an error
            if (productData.length === 0) {
                throw new Error("Failed to fetch product details after creation/update.");
            }




            // Construct response object
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
                connection.release();  // Release connection back to the pool
            }
        }
    }


    static async getUsedProductListingsForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance = null, initialRadius = 50) {


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
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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
                        u.created_at AS created_at,
                        u.about AS about,
                        u.last_name AS publisher_last_name,
                        u.email AS publisher_email,
                        u.is_email_verified AS publisher_email_verified,
                        u.profile_pic_url AS publisher_profile_pic_url,
                        u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                            u.created_at AS created_at,

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



                if (lastTimeStamp != null) {

                    query += ` AND s.created_at < ?`;

                } else {
                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;

                }

                if (lastTotalRelevance !== null) {
                    query += ` GROUP BY product_id HAVING
                        distance < ? AND (
                            name_relevance > 0 OR
                            description_relevance > 0
                        ) AND (
                        (total_relevance = ? AND distance <= ?)  -- Fetch records with the same relevance and within the current distance
                        OR (total_relevance < ? AND distance <= ?)  -- Fetch records with lower relevance within the current distance
                    ) `;

                } else {
                    query += ` GROUP BY product_id HAVING
                        distance < ? AND (
                            name_relevance > 0 OR
                            description_relevance > 0)`
                }



                query += ` ORDER BY
                        distance ASC,
                        total_relevance DESC
                    LIMIT ? OFFSET ?`;


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userId, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];

                } else {
                    params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userId, userLat, userLon, radius, pageSize, offset];
                }

            } else {


                query = `
                    SELECT
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




                if (!lastTimeStamp) {

                    query += ` AND s.created_at < CURRENT_TIMESTAMP`;
                } else {
                    query += ` AND s.created_at < ? `;

                }



                query += ` GROUP BY product_id HAVING
    distance < ?
    ORDER BY
distance LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;


                if (lastTimeStamp) {
                    params = [userLon, userLat, userId, userLat, userLon, lastTimeStamp, radius, pageSize, offset];
                } else {

                    params = [userLon, userLat, userId, userLat, userLon, radius, pageSize, offset];
                }
            }

        } else {



            if (queryParam) {


                if (initialRadius == 50) {
                    const searchTermConcatenated = queryParam.replace(/\s+/g, '');

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
                        VALUES (?, 1, NOW(), ?)
                        ON DUPLICATE KEY UPDATE
                            popularity = popularity + 1,
                            last_searched = NOW();`,
                        [queryParam, searchTermConcatenated]
                    );

                }


                console.log("Camer");

                // SQL query with Levenshtein distance
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


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, userId, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, userId, pageSize, offset];
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
                    u.created_at AS created_at,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,

                        u.created_at AS created_at,

                        
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
                }

                query += ` GROUP BY product_id LIMIT ? OFFSET ?`;

                const offset = (page - 1) * pageSize;

                if (lastTimeStamp) {
                    params = [userId, lastTimeStamp, pageSize, offset];

                } else {
                    params = [userId, pageSize, offset];
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
                    return await this.getUsedProductListingsForUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, radius)

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
                const product_id = row.product_id;




                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                // Initialize service entry if it doesn't exist
                if (!services[product_id]) {
                    const publisher_id = row.publisher_id;
                    try {
                        // Await the async operation
                        const result = await UsedProductListingModel.getUserPublishedUsedProductListingsFeedUser(userId, publisher_id);

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
                                created_at: createdAtYear
                            },
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


                            initial_check_at: formattedDate,
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
                    u.created_at AS created_at,

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



        // Initialize an object to hold the structured data
        const products = {};


        results.forEach(row => {


            const productId = row.product_id;

            // Initialize service entry if it doesn't exist
            if (!products[productId]) {


                const date = new Date(row.created_at);
                // Extract the year
                const createdAtYear = date.getFullYear().toString();

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
                        created_at: createdAtYear

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
                        image_url: MEDIA_BASE_URL + "/" + image.image_url // Prepend the base URL to the image URL
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

    static async getPublishedUsedProductListings(userId) {
        // Check if user exists
        const [userCheckResult] = await db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (userCheckResult.length === 0) {
            throw new Error('User not exist');
        }


        // Query to retrieve used products, images, and location for the specific user
        const [results] = await db.query(`
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
                u.created_at AS created_at
    
            FROM used_product_listings p
            LEFT JOIN used_product_listing_images pi ON p.product_id = pi.product_id
            LEFT JOIN used_product_listing_location pl ON p.product_id = pl.product_id
            
                        INNER JOIN users u ON p.created_by = u.user_id

      LEFT JOIN user_bookmark_used_product_listings ub ON p.product_id = ub.product_id AND ub.user_id = u.user_id

            
            WHERE p.created_by = ? 
            GROUP BY p.product_id
        `, [userId]);

        // Initialize an object to hold the structured data
        const products = {};

        results.forEach(row => {
            const productId = row.product_id;

            // Initialize product entry if it doesn't exist
            if (!products[productId]) {
                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();




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
                        created_at: createdAtYear
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

                };
            }
        });

        return Object.values(products);
    }


    static async guestGetUsedProductListings(userId, queryParam, page, pageSize, lastTimeStamp,
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
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



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

                    // Retrieve user coordinates
                    await connection.execute(
                        `INSERT INTO used_product_listing_search_queries  (search_term, popularity, last_searched, search_term_concatenated)
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


                const offset = (page - 1) * pageSize; // Calculate the offset for pagination



                if (lastTotalRelevance != null && lastTimeStamp != null) {

                    params = [queryParam, queryParam, queryParam, queryParam, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];

                } else {
                    params = [queryParam, queryParam, queryParam, queryParam, pageSize, offset];
                }


            } else {


                // BASE QUERY FOR NON LOCATION PROVIDED/ FOR GUEST
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
                    u.created_at AS created_at,
                    u.about AS about,
                    u.is_email_verified AS publisher_email_verified,
                    u.profile_pic_url AS publisher_profile_pic_url,
                    u.profile_pic_url_96x96 As publisher_profile_pic_url_96x96,
                    u.created_at AS created_at,
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
                    return await this.guestGetUsedProductListings(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, userCoordsData, radius)

                } else {
                    console.log("Reached maximum distance limit. Returning available results.");
                    // Process available results as needed, limited to requestedLimit
                    // const limitedResults = results.slice(0, requestedLimit);
                    // console.log("Fetched Results:", limitedResults);
                }
            }

        }

        // Initialize an array to hold the structured data

        const products = {};

        // Wrap the code in an async IIFE (Immediately Invoked Function Expression)
        await (async () => {

            for (const row of results) {
                const productId = row.product_id;
                const date = new Date(row.created_at);
                const createdAtYear = date.getFullYear().toString();
                const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');

                // Initialize service entry if it doesn't exist
                if (!products[productId]) {
                    const publisher_id = row.publisher_id;
                    try {
                        // Await the async operation
                        const result = await UsedProductListingModel.getUserPublishedUsedProductListingsFeedUser(userId, publisher_id);

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
                                created_at: createdAtYear,
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

                            initial_check_at: formattedDate,
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
        return Object.values(products);
    }



    static async bookmarkUsedProductListing(userId, productId) {
        let connection;
        try {
            // Create a connection to the database
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();

            // Prepare the SQL statement to insert a bookmark
            const [rows] = await connection.execute(
                "INSERT INTO user_bookmark_used_product_listings (user_id, product_id) VALUES (?, ?)",
                [userId, productId]
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

    static async removeBookmarkUsedProductListing(userId, productId) {

        let connection;
        try {
            // Create a connection to the database
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();

            const [result] = await connection.execute(
                "DELETE FROM user_bookmark_used_product_listings WHERE user_id = ? AND product_id = ?",
                [userId, productId]
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



    static async deleteUsedProductListing(user_id, product_id) {
        let connection;
        try {
            connection = await db.getConnection();

            // Begin transaction
            await connection.beginTransaction();


            // Delete the images from the database
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
            const s3Key = 'media/' + media_id.toString() + '/used-product-listings/' + product_id.toString();


            // Step 1: List all objects in the folder
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

            // Commit transaction
            await connection.commit();

            // Return success response
            return { status: 'success', message: 'Product and related data deleted successfully' };
        } catch (error) {
            // Rollback transaction on error
            if (connection) {
                await connection.rollback();
            }
            console.error('Error during used product deletion:', error.message);
            throw new Error(`Used product deletion failed: ${error.message}`);
        } finally {
            // Ensure the connection is always released back to the pool
            if (connection) {
                connection.release();
            }
        }
    }


    static async usedProductListingsSearchQueries(query) {



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
                    FROM used_product_listing_search_queries 
                    WHERE search_term LIKE CONCAT(${escapedQuery}, '%') -- Exact match that starts with the search query
                    AND popularity > 10  -- Ensure popularity is greater than 10

                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, 0 AS match_count, 1 AS relevance_score
                    FROM used_product_listing_search_queries 
                    WHERE ${likeConditions} -- Partial match (contains all words)
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from partial results
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 2 AS relevance_score
                    FROM used_product_listing_search_queries 
                    WHERE search_term_concatenated LIKE CONCAT(${concatenatedQuery}, '%') -- Concatenated match
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from concatenated results
                    AND NOT (${likeConditions}) -- Exclude partial matches containing all words
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, '' AS search_term_concatenated, (${matchCountSql}) AS match_count, 3 AS relevance_score
                    FROM used_product_listing_search_queries 
                    WHERE (${levenshteinSql}) -- Levenshtein distance match for misspelled words
                    AND search_term NOT LIKE CONCAT(${escapedQuery}, '%') -- Exclude exact matches from Levenshtein results
                    AND popularity > 10  -- Ensure popularity is greater than 10
                    ORDER BY popularity DESC
                )
                UNION ALL
                (
                    SELECT search_term, popularity, search_term_concatenated, 0 AS match_count, 4 AS relevance_score
                    FROM used_product_listing_search_queries 
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

module.exports = UsedProductListingModel;