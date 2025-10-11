const db = require('../config/lts360JobsDatabase.js')
const rootDb = require('../config/database.js')
const { MEDIA_BASE_URL } = require('../config/config.js');
const ApplicantProfile = require('./ApplicantProfile.js');
const { decodeCursor, encodeCursor } = require('./utils/pagination/cursor.js');

class Job {
  static async getJobPostings(userId,
    queryParam,
    latitudeParam,
    longitudeParam,
    pageSize, nextToken,
    filterWorkModes, salaryMin, salaryMax,
    initialRadius = 50) {

    const rootDbconnection = await rootDb.getConnection();
    const [userCoords] = await rootDbconnection.execute(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
      [userId]
    );
    const connection = await db.getConnection();
    const userCoordsData = userCoords[0];
    let query, params = [];
    var radius = initialRadius;
    const payload = nextToken ? decodeCursor(nextToken) : null;

    const { latitude: userLat, longitude: userLon } =
      latitudeParam && longitudeParam
        ? { latitude: latitudeParam, longitude: longitudeParam }
        : userCoordsData || {};

    if (userLat && userLon) {

      if (queryParam) {
        // if (initialRadius == 50) {
        //   const searchTermConcatenated = queryParam.replace(/\s+/g, '');

        //   // Insert or update search term popularity
        //   await db.execute(
        //     `INSERT INTO job_search_queries (search_term, popularity, last_searched, search_term_concatenated)
        //              VALUES (?, 1, NOW(), ?)
        //              ON DUPLICATE KEY UPDATE
        //                  popularity = popularity + 1,
        //                  last_searched = NOW();`,
        //     [queryParam, searchTermConcatenated]
        //   );
        // }

        query = `SELECT
                    j.id,
                    j.job_id,
                    j.title,
                    j.work_mode,
                    j.city_id,
                    j.description,
                    j.education,
                    j.experience_type,
                    j.experience_range_min,
                    j.experience_range_max,
                    j.experience_fixed,
                    j.salary_min,
                    j.salary_max,
                    j.salary_not_disclosed,
                    j.must_have_skills,
                    j.good_to_have_skills,
                    j.industry_id,
                    ji.industry_name AS industry,
                    j.department,
                    j.role,
                    j.employment_type,
                    j.vacancies,
                    j.highlights,
                    j.posted_at,
                    j.organization_id,
                    j.expiry_date,
                    j.status,
                    j.approval_status,
                    j.slug,
                    j.posted_by_id,
        
                  
            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

              CASE WHEN ub.job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
CASE WHEN a.applicant_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,
        
                    c.currency_type AS salary_currency,
        
                    -- Distance in kilometers
                    ST_Distance_Sphere(
                        POINT(?, ?),
                        POINT(ci.longitude, ci.latitude)
                    ) * 0.001 AS distance,
        
                    -- Full-text relevance scoring
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
        
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
        
                FROM jobs j
        
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
        LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
        LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id

        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180

                    AND ? BETWEEN -90 AND 90
                    AND ? BETWEEN -180 AND 180
        `;

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

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        if (payload?.total_relevance) {
          query += ` GROUP BY j.job_id HAVING
                    distance < ? AND (
                        title_relevance > 0 OR
                        description_relevance > 0
                    ) AND (
                        (total_relevance = ? AND distance <= ?) OR
                        (total_relevance < ? AND distance <= ?)
                    )`;
          params.push(radius, payload.total_relevance, radius, payload.total_relevance, radius);
        } else {
          query += ` GROUP BY j.job_id HAVING
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
                  OR (distance = ? AND total_relevance = ? AND j.posted_at < ?) 
                  OR (distance = ? AND total_relevance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.distance,
            payload.distance,
            payload.total_relevance,
            payload.distance,
            payload.total_relevance,
            payload.posted_at,
            payload.distance,
            payload.total_relevance,
            payload.posted_at,
            payload.id
          );
        }


        query += ` ORDER BY
              distance ASC,
              total_relevance DESC,
              j.posted_at DESC,
              j.id
          LIMIT ?`;
        params.push(pageSize);

      }
      else {
        query = `
        SELECT
            j.id,
            j.job_id,
            j.title,
            j.city_id,
            j.work_mode,
            j.description,
            j.education,
            j.experience_type,
            j.experience_range_min,
            j.experience_range_max,
            j.experience_fixed,
            j.salary_min,
            j.salary_max,
            j.salary_not_disclosed,
            j.must_have_skills,
            j.good_to_have_skills,
            j.industry_id,
            ji.industry_name AS industry,
            j.department,
            j.role,
            j.employment_type,
            j.vacancies,
            j.highlights,
            j.organization_id,
            j.expiry_date,
            j.status,
            j.approval_status,
            j.slug,
            j.posted_by_id,
            j.posted_at,

            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

              CASE WHEN ub.job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
CASE WHEN a.applicant_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

            -- Currency
            c.currency_type AS salary_currency,
            
            -- Distance Calculation
            ST_Distance_Sphere(
                POINT(?, ?),
                POINT(ci.longitude, ci.latitude)
            ) * 0.001 AS distance

        FROM jobs AS j
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
        LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
        LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180
            AND ? BETWEEN -90 AND 90
            AND ? BETWEEN -180 AND 180
            AND ((SELECT COUNT(*) FROM user_job_industries ui WHERE ui.external_user_id = ? ) = 0  
      OR j.industry_id IN (SELECT ui.industry_id FROM user_job_industries ui WHERE ui.external_user_id = ?))
            `;

        params = [
          userLon,
          userLat,
          userId,
          userId,
          userLat,
          userLon,
          userId,
          userId
        ];

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        query += ` GROUP BY j.job_id HAVING distance < ?`;
        params.push(radius);


        if (payload) {
          query += ` AND (
                  distance > ? 
                  OR (distance = ? AND j.posted_at < ?) 
                  OR (distance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.distance,
            payload.distance,
            payload.posted_at,
            payload.distance,
            payload.posted_at,
            payload.id
          );
        }

        query += ` ORDER BY distance ASC, j.posted_at DESC, j.id ASC LIMIT ?`;

        params.push(pageSize);
      }
    } else {
      if (queryParam) {
        // if (initialRadius == 50) {
        //   const searchTermConcatenated = queryParam.replace(/\s+/g, '');

        //   // Insert or update search term in the query history table
        //   await connection.execute(
        //     `INSERT INTO used_job_search_queries (search_term, popularity, last_searched, search_term_concatenated)
        //           VALUES (?, 1, NOW(), ?)
        //           ON DUPLICATE KEY UPDATE
        //               popularity = popularity + 1,
        //               last_searched = NOW();`,
        //     [queryParam, searchTermConcatenated]
        //   );
        // }


        query = `SELECT
                    j.id,
                    j.job_id,
                    j.title,
                    j.work_mode,
                    j.city_id,
                    j.description,
                    j.education,
                    j.experience_type,
                    j.experience_range_min,
                    j.experience_range_max,
                    j.experience_fixed,
                    j.salary_min,
                    j.salary_max,
                    j.salary_not_disclosed,
                    j.must_have_skills,
                    j.good_to_have_skills,
                    j.industry_id,
                    ji.industry_name as industry,
                    j.department,
                    j.role,
                    j.employment_type,
                    j.vacancies,
                    j.highlights,
                    j.organization_id,
                    j.expiry_date,
                    j.status,
                    j.approval_status,
                    j.slug,
                    j.posted_by_id,
                    j.posted_at,        
                  
            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

              CASE WHEN ub.job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
CASE WHEN a.applicant_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,
        
                    c.currency_type AS salary_currency,
        
                  
                    -- Full-text relevance scoring
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
        
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
        
                FROM jobs j
        
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
        LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
        LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id

        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180
        `;

        params = [
          queryParam,
          queryParam,
          queryParam,
          queryParam,
          userId,
          userId
        ];

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }



        if (payload?.total_relevance) {
          query += ` GROUP BY j.job_id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      ) AND (
                          (total_relevance = ?) OR
                          (total_relevance < ? )
                      )`;
          params.push(payload.total_relevance, payload.total_relevance);
        } else {
          query += ` GROUP BY j.job_id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      )`;
        }

        if (payload) {
          query += `
              AND (
                  total_relevance < ? 
                  OR (total_relevance = ? AND j.posted_at < ?) 
                  OR (total_relevance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.total_relevance,
            payload.total_relevance,
            payload.posted_at,
            payload.total_relevance,
            payload.posted_at,
            payload.id
          );
        }


        query += `
          ORDER BY
              total_relevance DESC,
              j.posted_at DESC,
              j.id ASC
          LIMIT ?
      `;
        params.push(pageSize);
      }
      else {
        query = `
        SELECT
            j.id,
            j.job_id,
            j.title,
            j.city_id,
            j.work_mode,
            j.description,
            j.education,
            j.experience_type,
            j.experience_range_min,
            j.experience_range_max,
            j.experience_fixed,
            j.salary_min,
            j.salary_max,
            j.salary_not_disclosed,
            j.must_have_skills,
            j.good_to_have_skills,
            j.industry_id,
            ji.industry_name as industry,
            j.department,
            j.role,
            j.employment_type,
            j.vacancies,
            j.highlights,
            j.organization_id,
            j.expiry_date,
            j.status,
            j.approval_status,
            j.slug,
            j.posted_by_id,
            j.posted_at,

            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

              CASE WHEN ub.job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,
CASE WHEN a.applicant_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

            -- Currency
            c.currency_type AS salary_currency

        FROM jobs AS j

        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
        LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
        LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180 
            AND ((SELECT COUNT(*) FROM user_job_industries ui WHERE ui.external_user_id = ? ) = 0  
      OR j.industry_id IN (SELECT ui.industry_id FROM user_job_industries ui WHERE ui.external_user_id = ?))
            `;

        params = [userId, userId, userId, userId];

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        if (payload) {
          query += `
              AND (
                  j.posted_at < ?
                  OR (j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.posted_at,
            payload.posted_at,
            payload.id
          );
        }


        query += `
    GROUP BY j.job_id
    ORDER BY j.posted_at DESC,
    j.id ASC
    LIMIT ?
`;
        params.push(pageSize);

      }
    }

    const [results] = await connection.execute(query, params);

    if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
      const availableResults = results.length;
      if (availableResults < pageSize) {
        if (radius < 500) {
          radius += 30;
          await connection.release();
          await rootDbconnection.release();
          return await this.getJobPostings(userId,
            queryParam,
            latitudeParam,
            longitudeParam,
            pageSize, nextToken, filterWorkModes, salaryMin, salaryMax, radius)
        }
      }
    }

    const jobs = {};
    let lastItem = null;
    await (async () => {
      for (let index = 0; index < results.length; index++) {
        const row = results[index];
        const job_id = row.job_id;
        if (!jobs[job_id]) {
          try {
            jobs[job_id] = {
              id: row.id,
              job_id: row.job_id,
              title: row.title,
              work_mode: row.work_mode,
              location: row.location,
              description: row.description,
              education: row.education,
              experience_type: row.experience_type,
              experience_range_min: row.experience_range_min,
              experience_range_max: row.experience_range_max,
              experience_fixed: row.experience_fixed,

              salary_min: row.salary_min,
              salary_max: row.salary_max,
              salary_min_formatted: await this.formatSalaryWithSettings(row.salary_min, row.salary_currency, row.currencySymbol),
              salary_max_formatted: await this.formatSalaryWithSettings(row.salary_max, row.salary_currency, row.currencySymbol),
              salary_not_disclosed: Boolean(row.salary_not_disclosed),

              salary_currency: row.salary_currency,
              must_have_skills: (() => {
                try {
                  const parsed = JSON.parse(row.must_have_skills);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              good_to_have_skills: (() => {
                try {
                  const parsed = JSON.parse(row.good_to_have_skills);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              industry_type: row.industry,
              department: row.department,
              role: row.role,
              employment_type: row.employment_type,
              vacancies: row.vacancies,
              highlights: (() => {
                try {
                  const parsed = JSON.parse(row.highlights);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              posted_by: row.posted_by_id,
              posted_at: row.posted_at,
              expiry_date: row.expiry_date,
              // status: row.status,
              // approval_status: row.approval_status,
              slug: MEDIA_BASE_URL + '/job/' + row.slug,

              organization_id: row.organization_id,

              organization: {
                id: row.organization_id,
                name: row.organization_name,
                logo: row.organization_logo,
                email: row.organization_email,
                address: row.organization_address,
                website: row.website,
                country: row.country,
                state: row.state,
                city: row.city,
                postal_code: row.postal_code,
              },

              recruiter: {
                id: row.posted_by_id,
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.recruiter_email,
                role: row.recruiter_role,
                company: row.company,
                phone: row.phone,
                profile_picture: row.profile_picture,
                bio: row.bio,
                years_of_experience: row.years_of_experience,
                is_verified: !!row.is_verified,
              },
              is_applied: !!row.is_applied,
              is_bookmarked: !!row.is_bookmarked
            };
          } catch (error) {
            throw new Error("Error processing job posting data");
          }
        }

        if (index == results.length - 1) lastItem = {
          distance: row.distance ? row.distance : null,
          total_relevance: row.total_relevance ? row.total_relevance : null,
          posted_at: row.posted_at,
          id: row.id
        }
      }
    })();

    await connection.release();
    await rootDbconnection.release();
    
    const allItems = Object.values(jobs)
    const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
    const hasPreviousPage = payload != null;
    const payloadToEncode = hasNextPage && lastItem ? {
        distance: lastItem.distance ? lastItem.distance : null,
        total_relevance: lastItem.total_relevance ? lastItem.total_relevance : null,
        posted_at: lastItem.posted_at,
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

  static async getGuestJobPostings(userId,
    queryParam,
    latitudeParam,
    longitudeParam,
    coordinates,
    industryIds,
    pageSize, nextToken,
    filterWorkModes, salaryMin, salaryMax,
    initialRadius = 50) {

    const rootDbconnection = await rootDb.getConnection();
    const connection = await db.getConnection();
    const userCoordsData = coordinates;
    let query, params = [];
    var radius = initialRadius;
    const payload = nextToken ? decodeCursor(nextToken) : null;

    const { latitude: userLat, longitude: userLon } =
      latitudeParam && longitudeParam
        ? { latitude: latitudeParam, longitude: longitudeParam }
        : userCoordsData || {};

    // if (userLat && userLon) {
      if (false) {

      if (queryParam) {
        // if (initialRadius == 50) {
        //   const searchTermConcatenated = queryParam.replace(/\s+/g, '');

        //   // Insert or update search term popularity
        //   await db.execute(
        //     `INSERT INTO job_search_queries (search_term, popularity, last_searched, search_term_concatenated)
        //              VALUES (?, 1, NOW(), ?)
        //              ON DUPLICATE KEY UPDATE
        //                  popularity = popularity + 1,
        //                  last_searched = NOW();`,
        //     [queryParam, searchTermConcatenated]
        //   );
        // }

        query = `SELECT
                    j.id,
                    j.job_id,
                    j.title,
                    j.work_mode,
                    j.city_id,
                    j.description,
                    j.education,
                    j.experience_type,
                    j.experience_range_min,
                    j.experience_range_max,
                    j.experience_fixed,
                    j.salary_min,
                    j.salary_max,
                    j.salary_not_disclosed,
                    j.must_have_skills,
                    j.good_to_have_skills,
                    j.industry_id,
                    ji.industry_name AS industry,
                    j.department,
                    j.role,
                    j.employment_type,
                    j.vacancies,
                    j.highlights,
                    j.posted_at,
                    j.organization_id,
                    j.expiry_date,
                    j.status,
                    j.approval_status,
                    j.slug,
                    j.posted_by_id,
        
                  
            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

        
                    c.currency_type AS salary_currency,
        
                    -- Distance in kilometers
                    ST_Distance_Sphere(
                        POINT(?, ?),
                        POINT(ci.longitude, ci.latitude)
                    ) * 0.001 AS distance,
        
                    -- Full-text relevance scoring
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
        
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
        
                FROM jobs j
        
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id

        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180

                    AND ? BETWEEN -90 AND 90
                    AND ? BETWEEN -180 AND 180
        `;

        params = [
          userLon,
          userLat,
          queryParam,
          queryParam,
          queryParam,
          queryParam,
          userLat,
          userLon
        ];

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        if (payload?.total_relevance) {
          query += ` GROUP BY j.job_id HAVING
                    distance < ? AND (
                        title_relevance > 0 OR
                        description_relevance > 0
                    ) AND (
                        (total_relevance = ? AND distance <= ?) OR
                        (total_relevance < ? AND distance <= ?)
                    )`;
          params.push(radius, payload.total_relevance, radius, payload.total_relevance, radius);
        } else {
          query += ` GROUP BY j.job_id HAVING
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
                  OR (distance = ? AND total_relevance = ? AND j.posted_at < ?) 
                  OR (distance = ? AND total_relevance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.distance,
            payload.distance,
            payload.total_relevance,
            payload.distance,
            payload.total_relevance,
            payload.posted_at,
            payload.distance,
            payload.total_relevance,
            payload.posted_at,
            payload.id
          );
        }


        query += ` ORDER BY
              distance ASC,
              total_relevance DESC,
              j.posted_at DESC,
              j.id
          LIMIT ?`;
        params.push(pageSize);

      }
      else {
        query = `
        SELECT
            j.id,
            j.job_id,
            j.title,
            j.city_id,
            j.work_mode,
            j.description,
            j.education,
            j.experience_type,
            j.experience_range_min,
            j.experience_range_max,
            j.experience_fixed,
            j.salary_min,
            j.salary_max,
            j.salary_not_disclosed,
            j.must_have_skills,
            j.good_to_have_skills,
            j.industry_id,
            ji.industry_name AS industry,
            j.department,
            j.role,
            j.employment_type,
            j.vacancies,
            j.highlights,
            j.organization_id,
            j.expiry_date,
            j.status,
            j.approval_status,
            j.slug,
            j.posted_by_id,
            j.posted_at,

            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,


            -- Currency
            c.currency_type AS salary_currency,
            
            -- Distance Calculation
            ST_Distance_Sphere(
                POINT(?, ?),
                POINT(ci.longitude, ci.latitude)
            ) * 0.001 AS distance

        FROM jobs AS j
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180
            AND ? BETWEEN -90 AND 90
            AND ? BETWEEN -180 AND 180
            `;

        params = [
          userLon,
          userLat,
          userLat,
          userLon
        ];

        if (industryIds && industryIds.length > 0) {
          const industryList = industryIds.join(', ');
          query += ` AND j.industry_id IN (${industryList})`;
      }

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        query += ` GROUP BY j.job_id HAVING distance < ?`;
        params.push(radius);


        if (payload) {
          query += ` AND (
                  distance > ? 
                  OR (distance = ? AND j.posted_at < ?) 
                  OR (distance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.distance,
            payload.distance,
            payload.posted_at,
            payload.distance,
            payload.posted_at,
            payload.id
          );
        }

        query += ` ORDER BY distance ASC, j.posted_at DESC, j.id ASC LIMIT ?`;

        params.push(pageSize);
      }
    } else {
      if (queryParam) {
        // if (initialRadius == 50) {
        //   const searchTermConcatenated = queryParam.replace(/\s+/g, '');

        //   // Insert or update search term in the query history table
        //   await connection.execute(
        //     `INSERT INTO used_job_search_queries (search_term, popularity, last_searched, search_term_concatenated)
        //           VALUES (?, 1, NOW(), ?)
        //           ON DUPLICATE KEY UPDATE
        //               popularity = popularity + 1,
        //               last_searched = NOW();`,
        //     [queryParam, searchTermConcatenated]
        //   );
        // }


        query = `SELECT
                    j.id,
                    j.job_id,
                    j.title,
                    j.work_mode,
                    j.city_id,
                    j.description,
                    j.education,
                    j.experience_type,
                    j.experience_range_min,
                    j.experience_range_max,
                    j.experience_fixed,
                    j.salary_min,
                    j.salary_max,
                    j.salary_not_disclosed,
                    j.must_have_skills,
                    j.good_to_have_skills,
                    j.industry_id,
                    ji.industry_name as industry,
                    j.department,
                    j.role,
                    j.employment_type,
                    j.vacancies,
                    j.highlights,
                    j.organization_id,
                    j.expiry_date,
                    j.status,
                    j.approval_status,
                    j.slug,
                    j.posted_by_id,
                    j.posted_at,        
                  
            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,
        
                    c.currency_type AS salary_currency,
        
                  
                    -- Full-text relevance scoring
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
        
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
        
                FROM jobs j
        
        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id

        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180
        `;

        params = [
          queryParam,
          queryParam,
          queryParam,
          queryParam
        ];

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }



        if (payload?.total_relevance) {
          query += ` GROUP BY j.job_id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      ) AND (
                          (total_relevance = ?) OR
                          (total_relevance < ? )
                      )`;
          params.push(payload.total_relevance, payload.total_relevance);
        } else {
          query += ` GROUP BY j.job_id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      )`;
        }

        if (payload) {
          query += `
              AND (
                  total_relevance < ? 
                  OR (total_relevance = ? AND j.posted_at < ?) 
                  OR (total_relevance = ? AND j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.total_relevance,
            payload.total_relevance,
            payload.posted_at,
            payload.total_relevance,
            payload.posted_at,
            payload.id
          );
        }


        query += `
          ORDER BY
              total_relevance DESC,
              j.posted_at DESC,
              j.id ASC
          LIMIT ?
      `;
        params.push(pageSize);
      }
      else {
        query = `
        SELECT
            j.id,
            j.job_id,
            j.title,
            j.city_id,
            j.work_mode,
            j.description,
            j.education,
            j.experience_type,
            j.experience_range_min,
            j.experience_range_max,
            j.experience_fixed,
            j.salary_min,
            j.salary_max,
            j.salary_not_disclosed,
            j.must_have_skills,
            j.good_to_have_skills,
            j.industry_id,
            ji.industry_name as industry,
            j.department,
            j.role,
            j.employment_type,
            j.vacancies,
            j.highlights,
            j.organization_id,
            j.expiry_date,
            j.status,
            j.approval_status,
            j.slug,
            j.posted_by_id,
            j.posted_at,

            -- Organization Info
            o.organization_name,
            o.logo AS organization_logo,
            o.email AS organization_email,
            o.organization_address,
            o.website,
            o.country,
            o.state,
            o.city,
            o.postal_code,

            -- Recruiter Info
            u.first_name,
            u.last_name,
            u.email AS recruiter_email,
            u.role AS recruiter_role,
            u.company,
            u.phone,
            u.profile_picture,
            u.bio,
            u.years_of_experience,
            u.is_verified,

            -- location
            ci.name as location,
            ci.latitude,
            ci.longitude,

            -- Currency
            c.currency_type AS salary_currency

        FROM jobs AS j

        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180 
          
            `;

        params = [];

        if (industryIds && industryIds.length > 0) {
          const industryList = industryIds.join(', ');
          query += ` AND j.industry_id IN (${industryList})`;
      }

        if (filterWorkModes.length > 0) {
          const placeholders = filterWorkModes.map(() => `?`).join(', ');
          query += ` AND LOWER(j.work_mode) IN (${placeholders})`;
          params.push(...filterWorkModes.map(mode => mode.toLowerCase()));
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ? AND j.salary_max <= ?`;
          params.push(salaryMin, salaryMax);
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ?`;
          params.push(salaryMin);
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ?`;
          params.push(salaryMax);
        }

        if (payload) {
          query += `
              AND (
                  j.posted_at < ?
                  OR (j.posted_at = ? AND j.id > ?)
              )
          `;

          params.push(
            payload.posted_at,
            payload.posted_at,
            payload.id
          );
        }


        query += `
    GROUP BY j.job_id
    ORDER BY j.posted_at DESC,
    j.id ASC
    LIMIT ?
`;
        params.push(pageSize);

      }
    }

    const [results] = await connection.execute(query, params);

    if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
      const availableResults = results.length;
      if (availableResults < pageSize) {
        if (radius < 500) {
          radius += 30;
          await connection.release();
          await rootDbconnection.release();
          return await this.getGuestJobPostings(userId,
            queryParam,
            latitudeParam,
            longitudeParam,
            coordinates,
            industryIds,
            pageSize, nextToken, filterWorkModes, salaryMin, salaryMax, radius)
        }
      }
    }

    const jobs = {};
    let lastItem = null;
    await (async () => {
      for (let index = 0; index < results.length; index++) {
        const row = results[index];
        const job_id = row.job_id;
        if (!jobs[job_id]) {
          try {
            jobs[job_id] = {
              id: row.id,
              job_id: row.job_id,
              title: row.title,
              work_mode: row.work_mode,
              location: row.location,
              description: row.description,
              education: row.education,
              experience_type: row.experience_type,
              experience_range_min: row.experience_range_min,
              experience_range_max: row.experience_range_max,
              experience_fixed: row.experience_fixed,

              salary_min: row.salary_min,
              salary_max: row.salary_max,
              salary_min_formatted: await this.formatSalaryWithSettings(row.salary_min, row.salary_currency, row.currencySymbol),
              salary_max_formatted: await this.formatSalaryWithSettings(row.salary_max, row.salary_currency, row.currencySymbol),
              salary_not_disclosed: Boolean(row.salary_not_disclosed),

              salary_currency: row.salary_currency,
              must_have_skills: (() => {
                try {
                  const parsed = JSON.parse(row.must_have_skills);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              good_to_have_skills: (() => {
                try {
                  const parsed = JSON.parse(row.good_to_have_skills);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              industry_type: row.industry,
              department: row.department,
              role: row.role,
              employment_type: row.employment_type,
              vacancies: row.vacancies,
              highlights: (() => {
                try {
                  const parsed = JSON.parse(row.highlights);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
              posted_by: row.posted_by_id,
              posted_at: row.posted_at,
              expiry_date: row.expiry_date,
              // status: row.status,
              // approval_status: row.approval_status,
              slug: MEDIA_BASE_URL + '/job/' + row.slug,

              organization_id: row.organization_id,

              organization: {
                id: row.organization_id,
                name: row.organization_name,
                logo: row.organization_logo,
                email: row.organization_email,
                address: row.organization_address,
                website: row.website,
                country: row.country,
                state: row.state,
                city: row.city,
                postal_code: row.postal_code,
              },

              recruiter: {
                id: row.posted_by_id,
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.recruiter_email,
                role: row.recruiter_role,
                company: row.company,
                phone: row.phone,
                profile_picture: row.profile_picture,
                bio: row.bio,
                years_of_experience: row.years_of_experience,
                is_verified: !!row.is_verified,
              },
              is_applied: !!row.is_applied,
              is_bookmarked: !!row.is_bookmarked
            };
          } catch (error) {
            throw new Error("Error processing job posting data");
          }
        }

        if (index == results.length - 1) lastItem = {
          distance: row.distance ? row.distance : null,
          total_relevance: row.total_relevance ? row.total_relevance : null,
          posted_at: row.posted_at,
          id: row.id
        }
      }
    })();

    await connection.release();
    await rootDbconnection.release();
    
    const allItems = Object.values(jobs)
    const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
    const hasPreviousPage = payload != null;
    const payloadToEncode = hasNextPage && lastItem ? {
        distance: lastItem.distance ? lastItem.distance : null,
        total_relevance: lastItem.total_relevance ? lastItem.total_relevance : null,
        posted_at: lastItem.posted_at,
        id: lastItem.id
    } : null;

    console.log(lastItem);

    return {
        data: allItems,
        next_token: payloadToEncode ? encodeCursor(
            payloadToEncode
        ) : null,
        previous_token: hasPreviousPage ? nextToken : null
    };
  }

  static async bookmarkJob(userId, jobId) {
    let connection;
    try {
      connection = await db.getConnection();

      await connection.beginTransaction();

      const [rows] = await connection.execute(
        "INSERT INTO user_bookmark_jobs (external_user_id, job_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [userId, jobId]
      );

      if (rows.affectedRows === 0) throw new Error('Error on inserting bookmark');
      await connection.commit();
      return rows.insertId;
    } catch (error) {
      (await connection).rollback();
      throw new Error('Failed to create bookmark: ' + error.message);
    } finally {
      (await connection).release;
    }
  }

  static async removeBookmarkJob(userId, jobId) {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const [result] = await connection.execute(
        "DELETE FROM user_bookmark_jobs WHERE external_user_id = ? AND job_id = ?",
        [userId, jobId]
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

  static async searchLocationSuggestions(query) {
    let connection;
    try {
      const trimmedQuery = query.trim();
      const cleanQuery = trimmedQuery.replace(/\s+/g, ' ');
      const lowercaseQuery = cleanQuery.toLowerCase();

      connection = await db.getConnection();

      const sql = `
            SELECT id,
                   name, 
                   state_id,
                   country_id,
                   CAST(latitude AS DOUBLE) AS latitude,
                   CAST(longitude AS DOUBLE) AS longitude
            FROM cities
            WHERE country_id = ?
              AND name LIKE CONCAT('%', ?, '%')
            ORDER BY 
                name LIKE CONCAT(?, '%') DESC, 
                name ASC
            LIMIT 5;
        `;

      const [results] = await connection.execute(sql, [101, lowercaseQuery, lowercaseQuery]);
      return results;

    } catch (error) {
      throw error;
    } finally {
      if (connection) {
        (await connection).release();
      }
    }
  }

  static async searchRoleSuggestions(query) {
    let connection;
    try {
      connection = await db.getConnection();

      const trimmedQuery = query.trim();
      const cleanQuery = trimmedQuery.replace(/\s+/g, ' ');
      const lowercaseQuery = cleanQuery.toLowerCase();
      const words = cleanQuery.split(' ');

      const likeConditions = words
        .map(() => `name LIKE CONCAT('%', ?, '%')`)
        .join(' AND ');


      const maxWords = 10;
      const levenshteinConditions = [];
      const matchCounts = [];

      for (const _ of words) {
        const levenshteinCondition = [];
        const matchCountCondition = [];

        for (let i = 1; i <= maxWords; i++) {
          levenshteinCondition.push(
            `levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(name, ' ', ${i}), ' ', -1), ?) < 3`
          );
          matchCountCondition.push(
            `IF(levenshtein(SUBSTRING_INDEX(SUBSTRING_INDEX(name, ' ', ${i}), ' ', -1), ?) < 3, 1, 0)`
          );
        }

        levenshteinConditions.push(`(${levenshteinCondition.join(' OR ')})`);
        matchCounts.push(`(${matchCountCondition.join(' OR ')})`);
      }

      const levenshteinSql = levenshteinConditions.join(' OR ');
      const matchCountSql = matchCounts.join(' + ');

      const sql = `
                      (
                          SELECT name, popularity, 0 AS match_count, 0 AS relevance_score
                          FROM job_roles 
                          WHERE name LIKE CONCAT(?, '%')
                          AND popularity > 10
                          ORDER BY popularity DESC
                      )
                      UNION ALL
                      (
                          SELECT name, popularity, 0 AS match_count, 1 AS relevance_score
                          FROM job_roles 
                          WHERE ${likeConditions}
                          AND name NOT LIKE CONCAT(?, '%')
                          AND popularity > 10
                          ORDER BY popularity DESC
                      )
                     
                      UNION ALL
                      (
                          SELECT name, popularity, (${matchCountSql}) AS match_count, 3 AS relevance_score
                          FROM job_roles 
                          WHERE (${levenshteinSql})
                          AND name NOT LIKE CONCAT(?, '%')
                          AND NOT (${likeConditions})
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

      // Parameters for levenshtein
      for (const word of words) {
        for (let i = 0; i < maxWords; i++) params.push(word);
        for (let i = 0; i < maxWords; i++) params.push(word);
      }
      params.push(lowercaseQuery);
      for (const word of words) params.push(word);


      const [results] = await connection.execute(sql, params);

      return results;
    } catch (error) {
      throw error;
    } finally {
      if (connection) (await connection).release();
    }
  }

  static async isProfileCompleted(result) {
    return !!(
      result.first_name &&
      result.last_name &&
      result.gender &&
      result.email &&
      result.intro &&
      result.educationList?.length >= 1 &&
      result.experienceList?.length >= 1 &&
      result.skillsList?.length >= 1 &&
      result.languagesList?.length >= 1 &&
      result.resume
    );
  }

  static async generateUniqueApplicationId() {
    let id, exists = true;
    let digitLength = 8;

    while (exists) {
      const min = Math.pow(10, digitLength - 1);
      const max = Math.pow(10, digitLength) - 1;

      id = Math.floor(min + Math.random() * (max - min + 1));

      const [rows] = await db.query(
        "SELECT application_id FROM applications WHERE application_id = ? LIMIT 1",
        [id]
      );

      exists = rows.length > 0;

      if (exists && digitLength < 12) {
        const [countRows] = await db.query("SELECT COUNT(*) as total FROM applications");
        if (countRows[0].total >= (max - min + 1)) {
          digitLength++;
        }
      }
    }
    return id;
  }

  static async applyJob(userId, jobId) {
    let connection;
    try {
      connection = await db.getConnection();
      const [jobCheckResult] = await connection.query(
        'SELECT posted_by_id, title FROM jobs WHERE job_id = ?',
        [jobId]
      );
      if (jobCheckResult.length === 0) new Error('Job not exist');
      const createdBy = jobCheckResult[0].posted_by_id;
      const title = jobCheckResult[0].title;

      const applicant_profile = await ApplicantProfile.getApplicantUserProfile(userId)
      const is_profile_completed = await this.isProfileCompleted(applicant_profile)
      if (!is_profile_completed) {
        return {
          is_profile_completed: false,
          is_applied: false
        }
      }
      const [[userResult]] = await connection.execute(
        `SELECT applicant_id from applicant_profiles where external_user_id = ?`,
        [userId]
      );

      if (!userResult) throw Error("Applicant profile not exist")

      const userProfileId = userResult.applicant_id;

      const [existing] = await connection.execute(
        `SELECT 1 FROM applications WHERE applicant_id = ? AND job_id = ? LIMIT 1`,
        [userProfileId, jobId]
      );

      if (existing.length > 0) throw new Error("You have already applied for this job");

      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `INSERT INTO applications (application_id, applicant_id, job_id, applied_at, status, is_rejected, is_top_applicant, reviewed_at, updated_at )
         VALUES (?, ?, ?, NOW(), 'pending', FALSE, FALSE, NULL, NOW())`,
        [await this.generateUniqueApplicationId(), userProfileId, jobId]
      );
      if (rows.affectedRows === 0) throw new Error('Error on inserting application');
      await connection.commit();

      // const kafkaKey = `${localJobId}:${createdBy}:${userId}`

      // sendLocalJobApplicantAppliedNotificationToKafka(kafkaKey, {
      //   user_id: createdBy,
      //   candidate_id: userId,
      //   local_job_title: localJobTitle,
      //   applicant_id: rows.insertId
      // })

      return {
        is_profile_completed: true,
        is_applied: true
      };
    } catch (error) {
      (await connection).rollback();
      throw new Error('Failed to apply job: ' + error.message);
    } finally {
      (await connection).release;
    }
  }

  static async getSavedJobs(userId, pageSize, nextToken) {
    let query = `SELECT
     j.id,
     j.job_id,
     j.title,
     j.city_id,
     j.work_mode,
     j.description,
     j.education,
     j.experience_type,
     j.experience_range_min,
     j.experience_range_max,
     j.experience_fixed,
     j.salary_min,
     j.salary_max,
     j.salary_not_disclosed,
     j.must_have_skills,
     j.good_to_have_skills,
     j.industry_id,
     ji.industry_name as industry,
     j.department,
     j.role,
     j.employment_type,
     j.vacancies,
     j.highlights,
     j.organization_id,
     j.expiry_date,
     j.status,
     j.approval_status,
     j.slug,
     j.posted_by_id,
     j.posted_at,

     -- Organization Info
     o.organization_name,
     o.logo AS organization_logo,
     o.email AS organization_email,
     o.organization_address,
     o.website,
     o.country,
     o.state,
     o.city,
     o.postal_code,

     -- Recruiter Info
     u.first_name,
     u.last_name,
     u.email AS recruiter_email,
     u.role AS recruiter_role,
     u.company,
     u.phone,
     u.profile_picture,
     u.bio,
     u.years_of_experience,
     u.is_verified,

     -- location
     ci.name as location,
     ci.latitude,
     ci.longitude,

     CASE WHEN ub.job_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_bookmarked,

    ub.created_at As bookmarked_at,

CASE WHEN a.applicant_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_applied,

     -- Currency Info
     c.currency_type AS salary_currency

 FROM jobs AS j

 LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
 LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
 LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
 LEFT JOIN cities ci ON j.city_id = ci.id
 LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
 LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
 LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
 LEFT JOIN job_industries ji ON ji.industry_id = j.industry_id

 WHERE ub.external_user_id = ? GROUP BY j.job_id `

    const params = [userId, userId, userId]
    const payload = nextToken ? decodeCursor(nextToken) : null;
    if (payload) {
      query += ' HAVING (bookmarked_at < ? OR (bookmarked_at = ? AND j.id > ?))';
      params.push(payload.bookmarked_at, payload.bookmarked_at, payload.id);
    }

    query += ` ORDER BY
  bookmarked_at DESC, j.id ASC
LIMIT ?`;

    params.push(pageSize);

    const [results] = await db.execute(query, params);

    const jobs = {};
    let lastItem = null
    await (async () => {
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const job_id = row.id;
        if (!jobs[job_id]) {
          jobs[job_id] = {
            job_id: row.job_id,
            title: row.title,
            work_mode: row.work_mode,
            location: row.location,
            description: row.description,
            education: row.education,
            experience_type: row.experience_type,
            experience_range_min: row.experience_range_min,
            experience_range_max: row.experience_range_max,
            experience_fixed: row.experience_fixed,

            salary_min: row.salary_min,
            salary_max: row.salary_max,
            salary_min_formatted: await this.formatSalaryWithSettings(row.salary_min, row.salary_currency, row.currencySymbol),
            salary_max_formatted: await this.formatSalaryWithSettings(row.salary_max, row.salary_currency, row.currencySymbol),
            salary_not_disclosed: Boolean(row.salary_not_disclosed),

            salary_currency: row.salary_currency,
            must_have_skills: (() => {
              try {
                const parsed = JSON.parse(row.must_have_skills);
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })(),
            good_to_have_skills: (() => {
              try {
                const parsed = JSON.parse(row.good_to_have_skills);
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })(),
            industry_type: row.industry,
            department: row.department,
            role: row.role,
            employment_type: row.employment_type,
            vacancies: row.vacancies,
            highlights: (() => {
              try {
                const parsed = JSON.parse(row.highlights);
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })(),
            posted_by: row.posted_by_id,
            posted_at: row.posted_at,
            expiry_date: row.expiry_date,
            // status: row.status,
            // approval_status: row.approval_status,
            slug: MEDIA_BASE_URL + '/job/' + row.slug,

            organization_id: row.organization_id,

            organization: {
              id: row.organization_id,
              name: row.organization_name,
              logo: row.organization_logo,
              email: row.organization_email,
              address: row.organization_address,
              website: row.website,
              country: row.country,
              state: row.state,
              city: row.city,
              postal_code: row.postal_code,
            },

            recruiter: {
              id: row.posted_by_id,
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.recruiter_email,
              role: row.recruiter_role,
              company: row.company,
              phone: row.phone,
              profile_picture: row.profile_picture,
              bio: row.bio,
              years_of_experience: row.years_of_experience,
              is_verified: !!row.is_verified,
            },
            is_applied: !!row.is_applied,
            is_bookmarked: !!row.is_bookmarked
          };
        }
        if (i == results.length - 1) lastItem = {
          bookmarked_at: row.bookmarked_at,
          id: row.id
        }
      }
    })();

    const allItems = Object.values(jobs)
    const hasNextPage = allItems.length > 0 && allItems.length == pageSize && lastItem;
    const hasPreviousPage = payload != null;
    const payloadToEncode = hasNextPage && lastItem ? {
      bookmarked_at: lastItem.bookmarked_at,
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

  static async formatSalaryWithSettings(salary, currencyType = 'INR', currencySymbol = '₹') {
    if (!salary || isNaN(salary)) return `${currencySymbol}0`;
    currencyType = currencyType.toUpperCase();
    if (currencyType === 'INR') {
      if (salary >= 10000000) {
        return `${currencySymbol}${(salary / 10000000).toFixed(2)} Cr`;
      } else if (salary >= 100000) {
        return `${currencySymbol}${(salary / 100000).toFixed(2)} Lakh`;
      } else {
        return `${currencySymbol}${salary}`;
      }
    } else {
      if (salary >= 1000000) {
        return `${currencySymbol}${(salary / 1000000).toFixed(2)}M`;
      } else if (salary >= 1000) {
        return `${currencySymbol}${(salary / 1000).toFixed(2)}K`;
      } else {
        return `${currencySymbol}${salary}`;
      }
    }
  }
}

module.exports = Job;