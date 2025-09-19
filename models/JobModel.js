const db = require('../config/lts360JobsDatabase.js')
const rootDb = require('../config/database.js')
const { MEDIA_BASE_URL } = require('../config/config.js');
const moment = require('moment');

class JobModel {
  static async getJobPostingsUser(userId, queryParam, page,
    pageSize, lastTimeStamp, lastTotalRelevance = null,
    filterWorkModes, salaryMin, salaryMax, initialRadius = 50) {

    const rootDbconnection = await rootDb.getConnection();
    const [userCoords] = await rootDbconnection.execute(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
      [userId]
    );
    const connection = await db.getConnection();
    const userCoordsData = null;
    let query, params = [];
    var radius = initialRadius;

    if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
      const userLat = userCoordsData.latitude;
      const userLon = userCoordsData.longitude;

      if (queryParam) {
        if (initialRadius == 50) {
          const searchTermConcatenated = queryParam.replace(/\s+/g, '');

          // Insert or update search term popularity
          await db.execute(
            `INSERT INTO job_search_queries (search_term, popularity, last_searched, search_term_concatenated)
                     VALUES (?, 1, NOW(), ?)
                     ON DUPLICATE KEY UPDATE
                         popularity = popularity + 1,
                         last_searched = NOW();`,
            [queryParam, searchTermConcatenated]
          );
        }

        // Build base query
        query = `
                SELECT
                    j.id,
                    j.title,
                    j.work_mode,
                    j.location,
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
        
                    o.organization_name,
                    o.logo AS organization_logo,
                    o.email AS organization_email,
                    o.organization_address,
                    o.website,
                    o.country,
                    o.state,
                    o.city,
                    o.postal_code,
        
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
        
                    c.currency_type AS salary_currency,
        
                    -- Distance in kilometers
                    ST_Distance_Sphere(
                        POINT(?, ?),
                        POINT(j.longitude, j.latitude)
                    ) * 0.001 AS distance,
        
                    -- Full-text relevance scoring
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
        
                    COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) +
                    COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
        
                FROM lts360_jobs j
        
                LEFT JOIN lts360_jobs_organizations_profile o ON j.organization_id = o.organization_id
                LEFT JOIN recruiter_user_profile u ON j.posted_by_id = u.user_id
                LEFT JOIN lts360_jobs_settings c ON j.posted_by_id = c.user_id
        
                WHERE
                    j.latitude BETWEEN -90 AND 90
                    AND j.longitude BETWEEN -180 AND 180
                    AND ? BETWEEN -90 AND 90
                    AND ? BETWEEN -180 AND 180
            `;

        if (lastTimeStamp != null) {
          query += ` AND j.posted_at < ?`;
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
        } else {
          query += ` GROUP BY j.id HAVING
                    distance < ? AND (
                        title_relevance > 0 OR
                        description_relevance > 0
                    )`;
        }

        query += `
                ORDER BY
                    distance ASC,
                    total_relevance DESC
                LIMIT ? OFFSET ?
            `;

        const offset = (page - 1) * pageSize;

        if (lastTotalRelevance != null && lastTimeStamp != null) {
          params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, lastTimeStamp, radius, lastTotalRelevance, radius, lastTotalRelevance, radius, pageSize, offset];
        } else {
          params = [userLon, userLat, queryParam, queryParam, queryParam, queryParam, userLat, userLon, radius, pageSize, offset];
        }

        const [rows] = await db.execute(query, params);
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

        if (filterWorkModes.length > 0) {
          query += ` AND LOWER(j.work_mode) IN (${filterWorkModes.map(mode => `'${mode.toLowerCase()}'`).join(', ')})`;
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ${salaryMin} AND j.salary_max <= ${salaryMax}`;
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ${salaryMin}`;
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ${salaryMax}`;
        }

        if (!lastTimeStamp) {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        } else {
          query += ` AND j.posted_at < ?`;
        }

        query += `
        GROUP BY j.job_id
        HAVING distance < ?
        ORDER BY distance ASC, j.posted_at DESC
        LIMIT ? OFFSET ?
    `;

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

          // Insert or update search term in the query history table
          await connection.execute(
            `INSERT INTO used_job_listing_search_queries (search_term, popularity, last_searched, search_term_concatenated)
                  VALUES (?, 1, NOW(), ?)
                  ON DUPLICATE KEY UPDATE
                      popularity = popularity + 1,
                      last_searched = NOW();`,
            [queryParam, searchTermConcatenated]
          );
        }


        // SQL query for job search with full-text search and Levenshtein distance logic
        let query = `
              SELECT
                  j.id,
                  j.title,
                  j.work_mode,
                  j.location,
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
                  j.posted_by_id AS posted_by_id,
      
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
      
                  -- Currency Info
                  c.currency_type AS salary_currency,
      
                  -- Full-text search relevance scores
                  COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS title_relevance,
                  COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS description_relevance,
      
                  -- Total relevance score
                  COALESCE(MATCH(j.title) AGAINST(? IN NATURAL LANGUAGE MODE), 0) + 
                  COALESCE(MATCH(j.description) AGAINST(? IN NATURAL LANGUAGE MODE), 0) AS total_relevance
      
              FROM
                  lts360_jobs j
              LEFT JOIN
                  lts360_jobs_organizations_profile o ON j.organization_id = o.organization_id
              LEFT JOIN
                  recruiter_user_profile u ON j.posted_by_id = u.user_id
              LEFT JOIN
                  lts360_jobs_settings c ON j.posted_by_id = c.user_id
              WHERE
                  j.location IS NOT NULL AND
                  o.country = ? AND
                  o.state = ?`;



        if (lastTimeStamp != null) {
          query += ` AND j.posted_at < ?`;
        } else {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        }

        if (lastTotalRelevance !== null) {
          query += ` GROUP BY j.id HAVING
                  (
                      title_relevance > 0 OR
                      description_relevance > 0
                  ) AND (
                      (total_relevance = ?) 
                      OR (total_relevance < ?)
                  )`;
        } else {
          query += ` GROUP BY j.id HAVING
                  (
                      title_relevance > 0 OR
                      description_relevance > 0
                  )`;
        }

        query += ` ORDER BY total_relevance DESC
              LIMIT ? OFFSET ?`;

        const offset = (page - 1) * pageSize; // Calculate the offset for pagination

        // Set parameters for the query execution
        let params = [
          queryParam, queryParam, queryParam, queryParam, country, state
        ];

        if (lastTimeStamp != null && lastTotalRelevance != null) {
          params = [...params, lastTimeStamp, lastTotalRelevance, lastTotalRelevance, pageSize, offset];
        } else {
          params = [...params, pageSize, offset];
        }


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

        if (filterWorkModes.length > 0) {
          query += ` AND LOWER(j.work_mode) IN (${filterWorkModes.map(mode => `'${mode.toLowerCase()}'`).join(', ')})`;
        }

        if (salaryMin !== -1 && salaryMax !== -1) {
          query += ` AND j.salary_min >= ${salaryMin} AND j.salary_max <= ${salaryMax}`;
        } else if (salaryMin !== -1) {
          query += ` AND j.salary_min >= ${salaryMin}`;
        } else if (salaryMax !== -1) {
          query += ` AND j.salary_max <= ${salaryMax}`;
        }

        if (!lastTimeStamp) {
          query += ` AND j.posted_at < CURRENT_TIMESTAMP`;
        } else {
          query += ` AND j.posted_at < ?`;
        }

        query += `
        GROUP BY j.job_id
        ORDER BY j.posted_at DESC
        LIMIT ? OFFSET ?
    `;
        const offset = (page - 1) * pageSize;
        if (lastTimeStamp) {
          params = [userId, userId,lastTimeStamp, pageSize, offset];
        } else {
          params = [userId, userId, pageSize, offset];
        }
      }
    }

    const [results] = await connection.execute(query, params);
    if (userCoordsData && userCoordsData.latitude && userCoordsData.longitude) {
      const availableResults = results.length;
      if (availableResults < pageSize) {
        if (radius < 500) {
          radius += 30;
          console.log(`Only ${availableResults} results found. Increasing distance to ${radius} km.`);
          await connection.release();
          await rootDbconnection.release();
          return await this.getJobPostingsUser(userId, queryParam, page, pageSize, lastTimeStamp, lastTotalRelevance, filterWorkModes, salaryMin, salaryMax, radius)
        } else {
          console.log("Reached maximum distance limit. Returning available results.");
          // Process available results as needed, limited to requestedLimit
          // const limitedResults = results.slice(0, requestedLimit);
          // console.log("Fetched Results:", limitedResults);
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
            // Handle the error if the async operation fails
            console.error(error);
            throw new Error("Error processing job posting data");
          }
        }
      }

    })();

    await rootDbconnection.release();
    await connection.release();
    return Object.values(jobs);
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
      const createdBy = jobCheckResult[0].created_by;
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

module.exports = JobModel;