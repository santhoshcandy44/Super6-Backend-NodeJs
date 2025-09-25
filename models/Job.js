const db = require('../config/lts360JobsDatabase.js')
const rootDb = require('../config/database.js')
const { MEDIA_BASE_URL } = require('../config/config.js');
const moment = require('moment');

class Job {
  static async getJobPostingsUser(userId, queryParam,
    latitudeParam,
    longitudeParam,
    page,
    pageSize, lastTimeStamp, lastTotalRelevance = null,
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
                    j.industry_type,
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
                    j.company_id,
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

        if (lastTimeStamp != null) {
          query += ` AND j.posted_at < ?`;
          params.push(lastTimeStamp);
        } else {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        }

        if (lastTotalRelevance !== null) {
          query += ` GROUP BY j.id HAVING
                    distance < ? AND (
                        title_relevance > 0 OR
                        description_relevance > 0
                    ) AND (
                        (total_relevance = ? AND distance <= ?) OR
                        (total_relevance < ? AND distance <= ?)
                    )`;
          params.push(radius, lastTotalRelevance, radius, lastTotalRelevance, radius);
        } else {
          query += ` GROUP BY j.job_id HAVING
                    distance < ? AND (
                        title_relevance > 0 OR
                        description_relevance > 0
                    )`;
          params.push(radius);
        }

        query += `
          ORDER BY
              distance ASC,
              total_relevance DESC
          LIMIT ? OFFSET ?
      `;
        const offset = (page - 1) * pageSize;
        params.push(pageSize, offset);

      }
      else {
        query = `
        SELECT
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
            j.industry_type,
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
            j.company_id,
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

            -- Currency
            c.currency_type AS salary_currency,
                CURRENT_TIMESTAMP AS initial_check_at,

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
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180
            AND ? BETWEEN -90 AND 90
            AND ? BETWEEN -180 AND 180`;

        params = [
          userLon,
          userLat,
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

        if (!lastTimeStamp) {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        } else {
          query += ` AND j.posted_at < ?`;
          params.push(lastTimeStamp);
        }

        query += `
              GROUP BY j.job_id
              HAVING distance < ?
              ORDER BY distance ASC, j.posted_at DESC
              LIMIT ? OFFSET ?
          `;

        params.push(radius);

        const offset = (page - 1) * pageSize;
        params.push(pageSize, offset);

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
                    j.industry_type,
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
                    j.company_id,
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

        if (lastTimeStamp != null) {
          query += ` AND j.posted_at < ?`;
          params.push(lastTimeStamp);
        } else {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        }

        if (lastTotalRelevance !== null) {
          query += ` GROUP BY j.id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      ) AND (
                          (total_relevance = ?) OR
                          (total_relevance < ? )
                      )`;
          params.push(lastTotalRelevance, lastTotalRelevance);
        } else {
          query += ` GROUP BY j.job_id HAVING (
                          title_relevance > 0 OR
                          description_relevance > 0
                      )`;
        }

        query += `
          ORDER BY
              total_relevance DESC
          LIMIT ? OFFSET ?
      `;

        const offset = (page - 1) * pageSize;
        params.push(pageSize, offset);
      }
      else {
        query = `
        SELECT
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
            j.industry_type,
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
            j.company_id,
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

            -- Currency
            c.currency_type AS salary_currency,
                CURRENT_TIMESTAMP AS initial_check_at

        FROM jobs AS j

        LEFT JOIN organization_profiles o ON j.organization_id = o.organization_id
        LEFT JOIN recruiter_profiles u ON j.posted_by_id = u.id
        LEFT JOIN recruiter_settings c ON j.posted_by_id = c.user_id
        LEFT JOIN cities ci ON j.city_id = ci.id
        LEFT JOIN applicant_profiles ap ON ap.external_user_id = ?
        LEFT JOIN user_bookmark_jobs ub ON j.job_id = ub.job_id AND ub.external_user_id = ?
        LEFT JOIN applications a ON j.job_id = a.job_id AND a.applicant_id = ap.applicant_id
        WHERE
            ci.latitude BETWEEN -90 AND 90
            AND ci.longitude BETWEEN -180 AND 180`;

        params = [userId, userId];

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

        if (!lastTimeStamp) {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        } else {
          query += ` AND j.posted_at < ?`;
          params.push(lastTimeStamp);
        }

        query += `
    GROUP BY j.job_id
    ORDER BY j.posted_at DESC
    LIMIT ? OFFSET ?
`;

        const offset = (page - 1) * pageSize;
        params.push(pageSize, offset);

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
          return await this.getJobPostingsUser(userId,
            queryParam,
            latitudeParam,
            longitudeParam,
            page, pageSize, lastTimeStamp, lastTotalRelevance, filterWorkModes, salaryMin, salaryMax, radius)
        }
      }
    }

    const jobs = {};
    await (async () => {
      for (const row of results) {
        const job_id = row.id;
        const formattedDate = moment(row.initial_check_at).format('YYYY-MM-DD HH:mm:ss');
        if (!jobs[job_id]) {
          try {
            jobs[job_id] = {
              id: row.id,
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
              industry_type: row.industry_type,
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

              company_id: row.company_id,

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
              is_applied: row.is_applied,
              is_bookmarked: row.is_bookarked,
              initial_check_at: formattedDate,
              total_relevance: row.total_relevance ? row._total_relevance : null
            };
          } catch (error) {
            throw new Error("Error processing job posting data");
          }
        }
      }
    })();

    await rootDbconnection.release();
    await connection.release();
    return Object.values(jobs);
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

  static async applyJob(userId, jobId) {
    let connection;
    try {
      connection = await db.getConnection();
      const [jobCheckResult] = await connection.query(
        'SELECT posted_by_id, title FROM jobs WHERE job_id = ?',
        [jobId]
      );
      if (jobCheckResult.length === 0) {
        throw new Error('Job not exist');
      }
      const createdBy = jobCheckResult[0].posted_by_id;
      const title = jobCheckResult[0].title;

      applicant_profile = await ApplicantProfile.getApplicantUserProfile(userId)
      is_profile_completed = await this.isProfileCompleted(applicant_profile)

      if (!is_profile_completed) {
        return {
          is_profile_completed: false,
          is_applied: false
        }
      }
      const [userResult] = await connection.execute(
        `SELECT applcant_id from applicant_profile where external_user_id = ?`,
        [userId]
      );
      const userProfileId = userResult[0].id;

      const [existing] = await connection.execute(
        `SELECT 1 FROM applications WHERE applicant_id = ? AND job_listing_id = ? LIMIT 1`,
        [userProfileId, jobId]
      );

      if (existing.length > 0) {
        throw new Error("You have already applied for this job");
      }

      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `INSERT INTO applications (applicant_id, job_id, applied_at, status, is_rejected, is_top_applicant, reviewed_at, updated_at ) VALUES (?, ?, NOW(), 'pending', FALSE, FALSE, NULL, NOW())`,
        [userProfileId, jobId]
      );
      if (rows.affectedRows === 0) {
        throw new Error('Error on inserting job');
      }
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