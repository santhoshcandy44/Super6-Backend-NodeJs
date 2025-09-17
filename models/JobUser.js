// User.js
const sharp = require('sharp');
const path = require('path'); 
const moment = require('moment');
const db = require('../config/jobDatabase.js')
const User = require('./User.js');
const { generateShortEncryptedUrl, verifyShortEncryptedUrl } = require('../utils/authUtils.js');
const { S3_BUCKET_NAME, PROFILE_BASE_URL, MEDIA_BASE_URL } = require('../config/config.js');
const { awsS3Bucket } = require('../config/awsS3.js');

const formatToMySQLDate = (millis) => {
    if (!millis) return null; // If no date provided, return null for MySQL
    return moment(millis).format('YYYY-MM-DD'); // Convert to 'YYYY-MM-DD' format
};

class JobUser {
    static async getApplicantUserProfile(userId) {
        const [profile] = await db.query(
            `SELECT id, first_name, last_name, gender, email, phone, intro, profile_picture 
             FROM user_profile 
             WHERE external_user_id = ?`,
            [userId]
        );

        if (!profile) return null;

        const userProfileId = profile.id;

        
        const [experienceRows] = await db.query(
            `SELECT organization, job_title, employment_type, location, start_date, end_date, current_working_here, experienced
             FROM user_profile_experience 
             WHERE user_profile_id = ?`,
            [userProfileId]
        );

        let experienceList = [];

        if (experienceRows.length === 0) {
            // If there are no experience rows, return an empty array
            experienceList = [];
        } else {
            // Check if there's experience data in the first row
            const hasExperience = Boolean(experienceRows[0]?.experienced);

            // If there's experience, map through the experience rows and format them
            experienceList = !hasExperience
                ? [{
                    company_name: '',
                    job_title: '',
                    employment_type: '',
                    location: '',
                    start_date: 0,
                    end_date: 0,
                    is_current_job: false,
                    experienced: false
                }]
                : experienceRows.map(exp => ({
                    company_name: exp.organization || '',
                    job_title: exp.job_title || '',
                    employment_type: exp.employment_type || '',
                    location: exp.location || '',
                    start_date: exp.start_date ? moment(exp.start_date).valueOf() : 0,
                    end_date: exp.end_date ? moment(exp.end_date).valueOf() : 0,
                    is_current_job: Boolean(exp.current_working_here),
                    experienced: true
                }));
        }

       // Education
        const [educationRows] = await db.query(
            `SELECT organization_name AS institution, field_of_study, start_date, end_date, grade, currently_studying 
             FROM user_profile_education_info 
             WHERE user_profile_id = ?`,
            [userProfileId]
        );

        const educationList = educationRows.map(edu => ({
            institution: edu.institution,
            field_of_study: edu.field_of_study,
            start_year: edu.start_date ? moment(edu.start_date).valueOf() : 0,
            end_year: edu.end_date ? moment(edu.end_date).valueOf() : 0,
            grade: edu.grade,
            currently_studying: Boolean(edu.currently_studying)
        }));

        // Languages
        const [languageRows] = await db.query(
            `SELECT language, language_code, proficiency, proficiency_code 
             FROM user_profile_language 
             WHERE user_profile_id = ?`,
            [userProfileId]
        );

        const languagesList = languageRows.map(lang => ({
            language: {
                name: lang.language,
                code: lang.language_code
            },
            proficiency: {
                name: lang.proficiency,
                value: lang.proficiency_code
            }
        }));

        // Skills
        const [skillRows] = await db.query(
            `SELECT skill, skill_code 
             FROM user_profile_skill 
             WHERE user_profile_id = ?`,
            [userProfileId]
        );

        const skillsList = skillRows.map(row => ({
            skill: row.skill,
            skill_code: row.skill_code
        }));

        // Certificates
        const [certificateRows] = await db.query(
            `SELECT id, issued_by, certificate_download_url AS image, certificate_file_name AS fileName, certificate_size AS fileSize, certificate_type AS type
             FROM user_profile_certificate
             WHERE user_profile_id = ?`,
            [userProfileId]
        );

        const certificateList = certificateRows.map(row => ({
            id: row.id,
            issued_by: row.issued_by,
            image: MEDIA_BASE_URL + "/" + row.image,
            file_name: row.fileName,
            file_size: row.fileSize,
            type: row.type
        }));

        // Resume
        const [resumeRows] = await db.query(
            `SELECT resume_file_name, resume_download_url, resume_size, resume_type, last_used 
             FROM user_profile_resume 
             WHERE user_profile_id = ? 
             LIMIT 1`,
            [userProfileId]
        );

        const resumeData = resumeRows.length > 0 ? resumeRows[0] : null;

        return {
            first_name: profile.first_name,
            last_name: profile.last_name,
            gender: profile.gender,
            email: profile.email,
            phone: profile.phone,
            intro: profile.intro,
            profile_picture: PROFILE_BASE_URL + "/" + profile.profile_picture,
            experienceList,
            educationList,
            skillsList,
            certificateList,
            resume: resumeData ? {
                file_name: resumeData.resume_file_name,
                resume_download_url: resumeData.resume_download_url,
                resume_size: resumeData.resume_size,
                resume_type: resumeData.resume_type,
                last_used: resumeData.last_used || null
            } : null,
            languagesList
        };
    }

    static async generateUnique11DigitId() {
        let id, exists = true;
        while (exists) {
            id = Math.floor(10000000000 + Math.random() * 90000000000);
            const [rows] = await db.query("SELECT id FROM user_profile WHERE id = ? LIMIT 1", [id]);
            exists = rows.length > 0;
        }
        return id;
    }

    static async updateOrCreateUserProfile(userId, jobProfessionalInfo, profilePic) {
        const { first_name, last_name, email, gender, intro } = jobProfessionalInfo;
        let profilePicUrl = null;
        const user = await User.getUserMedia(userId);
        if (!user) throw new Error("Access forbidden");
        const mediaId = user.media_id;
        const [[existingProfile]] = await db.query(
            `SELECT profile_picture FROM user_profile WHERE external_user_id = ?`,
            [userId]
        );
        if (profilePic) {
            const buffer = profilePic.buffer;
            const compressedImageBuffer = await sharp(buffer)
                .resize(512, 512)
                .jpeg({ quality: 80 })
                .toBuffer();
            const fileName = profilePic.originalname;
            const newFileName = `${path.parse(fileName).name}.jpg`;
            const s3Key = `media/${mediaId}/careers/applicant/profile/${newFileName}`;
            if (existingProfile?.profile_picture) {
                const token = existingProfile.profile_picture.split('q=')[1];
                const decodedToken = decodeURIComponent(token);
                if (token) {
                    const extractedData = verifyShortEncryptedUrl(decodedToken);
                    if (extractedData) {
                        const { path } = extractedData;
                        await this.deleteS3Keys([path]);
                    }
                }
            }

            await this.uploadToS3(compressedImageBuffer, s3Key, 'image/jpeg');
            profilePicUrl = generateShortEncryptedUrl(s3Key);
        } else if (existingProfile?.profile_picture) {
            profilePicUrl = existingProfile.profile_picture;
        }

        const unique_user_id = await this.generateUnique11DigitId()
        const query = `
            INSERT INTO user_profile (id, external_user_id, first_name, last_name, email, gender, intro, profile_picture, is_verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
            ON DUPLICATE KEY UPDATE
                id = VALUES(id),
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                email = VALUES(email),
                gender = VALUES(gender),
                intro = VALUES(intro),
                profile_picture = VALUES(profile_picture),
                is_verified = VALUES(is_verified),
              updated_at = VALUES(updated_at)
        `;
        await db.query(query, [
            unique_user_id,
            userId,
            first_name,
            last_name,
            email,
            gender,
            intro,
            profilePicUrl,
            false,
            new Date(),
            new Date()
        ]);
        return await JobUser.getApplicantUserProfile(userId);
    }

    static async updateOrCreateEducationInfo(userId, educationList = []) {
        await db.query(
            'DELETE FROM user_profile_education_info WHERE user_profile_id = (SELECT id FROM user_profile WHERE external_user_id = ?)',
            [userId]
        );
        const insertEducationQuery = `
            INSERT INTO user_profile_education_info (
                user_profile_id, organization_name, field_of_study, start_date, end_date, grade, currently_studying
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (userProfile && educationList.length > 0) {
            for (const edu of educationList) {
                const {
                    institution,
                    field_of_study,
                    start_year,
                    end_year,
                    grade,
                    currently_studying
                } = edu;

                console.log(edu);

                const startDate = formatToMySQLDate(start_year); 
                const endDate = currently_studying ? null : formatToMySQLDate(end_year);
                await db.query(insertEducationQuery, [
                    userProfile.id,
                    institution,
                    field_of_study,
                    startDate,
                    endDate,
                    grade,
                    currently_studying
                ]);
            }
        }
        const result = await JobUser.getApplicantUserProfile(userId);
        return result;
    }

    static async updateOrCreateExperienceInfo(userId, experienceList = []) {
        await db.query(
            'DELETE FROM user_profile_experience WHERE user_profile_id = (SELECT id FROM user_profile WHERE external_user_id = ?)',
            [userId]
        );

        const insertExperienceQuery = `
            INSERT INTO user_profile_experience (
                user_profile_id, organization, job_title, employment_type, location,
                start_date, end_date, current_working_here, experienced
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (userProfile && experienceList.length > 0) {
            for (const exp of experienceList) {
                const {
                    company_name,
                    job_title,
                    employment_type,
                    location,
                    start_date,
                    end_date,
                    is_current_job,
                    experienced
                } = exp;

                const startDate = formatToMySQLDate(start_date);
                const endDate = is_current_job ? null : formatToMySQLDate(end_date);

                await db.query(insertExperienceQuery, [
                    userProfile.id,
                    company_name,
                    job_title,
                    employment_type,
                    location,
                    startDate,
                    endDate,
                    is_current_job,
                    experienced
                ]);
            }
        }
        const result = await JobUser.getApplicantUserProfile(userId);
        return result;
    }

    static async updateExperienceAsNone(userId) {
        // 1. Delete all existing experiences for the user
        await db.query(
            `DELETE FROM user_profile_experience
           WHERE user_profile_id = (
             SELECT id FROM user_profile WHERE external_user_id = ?
           )`,
            [userId]
        );

        // 2. Get the user's profile ID
        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (!userProfile) return;

        // 3. Insert a new row indicating no experience
        await db.query(
            `INSERT INTO user_profile_experience (
              user_profile_id, organization, job_title, employment_type, location,
              start_date, end_date, current_working_here, experienced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userProfile.id,
                null, // organization
                null, // job_title
                null, // employment_type
                null, // location
                null, // start_date
                null, // end_date
                false, // current_working_here
                false  // experienced
            ]
        );

        // 4. Return the updated profile
        const result = await JobUser.getApplicantUserProfile(userId);
        return result;
    }


    static async updateOrCreateSkillInfo(userId, skillList = []) {
        // 1. Delete existing skill records
        await db.query(
            'DELETE FROM user_profile_skill WHERE user_profile_id = (SELECT id FROM user_profile WHERE external_user_id = ?)',
            [userId]
        );

        // 2. Insert new skill entries
        const insertSkillQuery = `
            INSERT INTO user_profile_skill (
                user_profile_id, skill, skill_code
            )
            VALUES (?, ?, ?)
        `;

        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (userProfile && skillList.length > 0) {
            for (const skill of skillList) {
                const { skill: skillName, skill_code } = skill;

                await db.query(insertSkillQuery, [
                    userProfile.id,
                    skillName,
                    skill_code
                ]);
            }
        }


        const result = await JobUser.getApplicantUserProfile(userId);

        return result;
    }


    static async updateOrCreateLanguageInfo(userId, languageList = []) {
        // 1. Delete existing language records
        await db.query(
            'DELETE FROM user_profile_language WHERE user_profile_id = (SELECT id FROM user_profile WHERE external_user_id = ?)',
            [userId]
        );

        // 2. Get user profile ID
        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (!userProfile) return;

        // 3. Insert new language entries
        const insertLanguageQuery = `
            INSERT INTO user_profile_language (
                user_profile_id, language, language_code, proficiency, proficiency_code
            )
            VALUES (?, ?, ?, ?, ?)
        `;

        for (const item of languageList) {
            const language = item.language;
            const proficiency = item.proficiency;

            await db.query(insertLanguageQuery, [
                userProfile.id,
                language.name,
                language.code,
                proficiency.name,
                proficiency.value
            ]);
        }

        const result = await JobUser.getApplicantUserProfile(userId);

        return result;
    }


    static async updateOrCreateUserResume(userId, file) {


        // 1. Validate user
        const user = await User.getUserMedia(userId);
        if (!user) return; // Skip if user doesn't exist (ignore silently as per your earlier request)

        const mediaId = user.media_id;

        const allowedTypes = ["PDF", "DOC", "DOCX"];
        const fileType = file.mimetype.split('/')[1].toUpperCase(); // Get file type from mimetype
        if (!allowedTypes.includes(fileType)) return; // Skip if the file type is not allowed (ignore silently)

        const [[userProfile]] = await db.query(
            `SELECT id FROM user_profile WHERE external_user_id = ?`,
            [userId]
        );

        if (!userProfile) return; // Skip if user profile doesn't exist (ignore silently)


        // 2. Get user profile from DB
        const [[exisitngResume]] = await db.query(
            'SELECT resume_download_url FROM user_profile_resume WHERE  user_profile_id =  ?',
            [userProfile.id]
        );


        // 3. Delete the old resume if it exists in DB (and potentially in S3)
        if (exisitngResume?.resume_download_url) {
            // Assuming resume_download_url contains the S3 path to the resume file
            const oldResumePath = exisitngResume.resume_download_url; // Extract path from URL
            if (oldResumePath) {
                // Optionally, you can delete the file from S3 as well if desired
                await this.deleteS3Keys([oldResumePath]);
            }
        }

        // 4. Upload new resume to S3
        const fileName = file.originalname; // You should set this from the file object
        const s3Key = `media/${mediaId}/careers/resume/${fileName}`;
        await this.uploadToS3(file.buffer, s3Key, fileType); // Upload the file buffer to S3

        // 5. Save new resume details to DB
        const resumeDownloadUrl = s3Key;
        const insertResumeQuery = `
            INSERT INTO user_profile_resume 
            (user_profile_id, resume_file_name, resume_download_url, resume_size, resume_type)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                resume_file_name = VALUES(resume_file_name),
                resume_download_url = VALUES(resume_download_url),
                resume_size = VALUES(resume_size),
                resume_type = VALUES(resume_type),
                last_used = VALUES(last_used)
        `;
        await db.query(insertResumeQuery, [userProfile.id, fileName, resumeDownloadUrl, file.size, fileType]);

        // 6. Return the updated user profile
        const result = await JobUser.getApplicantUserProfile(userId);
        return result;
    }


    static async updateOrCreateUserCertificates(userId, certificates) {
        // 1. Validate user exists
        const user = await User.getUserMedia(userId);
        if (!user) {
            throw new Error("Access forbidden");
        }

        // 2. Get user profile ID
        const [[userProfile]] = await db.query(
            'SELECT id FROM user_profile WHERE external_user_id = ?',
            [userId]
        );

        if (!userProfile) return;

        const userProfileId = userProfile.id;
        const mediaId = user.media_id;
        const allowedTypes = ["JPG", "PNG"];

        // 3. Fetch existing certificates from DB
        const [existingCertificates] = await db.query(
            `SELECT id, certificate_download_url FROM user_profile_certificate WHERE user_profile_id = ?`,
            [userProfileId]
        );

        const existingIds = existingCertificates.map(cert => cert.id);
        const incomingIds = certificates.map(cert => cert.id).filter(id => id !== -1);

        // 4. Determine certificates to delete (those not present in incoming list)
        const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

        if (idsToDelete.length > 0) {
            // 🔹 Get S3 keys for certs to delete
            const s3KeysToDelete = existingCertificates
                .filter(cert => idsToDelete.includes(cert.id))
                .map(cert => cert.certificate_download_url);

            // 🔹 Delete from DB
            await db.query(
                `DELETE FROM user_profile_certificate WHERE id IN (?) AND user_profile_id = ?`,
                [idsToDelete, userProfileId]
            );

            // 🔹 Delete from S3
            await this.deleteS3Keys(s3KeysToDelete);
        }


        // 5. Upsert certificates
        for (const cert of certificates) {
            const { id, issuedBy, image, fileSize, type } = cert;

            if (!issuedBy || !image) {
                throw new Error("Missing required certificate data (issuedBy or image)");
            }

            if (!allowedTypes.includes(type)) {
                throw new Error(`Unsupported certificate file type: ${type}`);
            }


            if (image.mimetype && image.mimetype.startsWith('image/')) {


                // Compress and convert all images to JPEG
                const compressedImageBuffer = await sharp(image.buffer)
                    .jpeg({ quality: 80 }) // Adjust quality as needed
                    .toBuffer();

                const fileName = image.originalname;

                // Force the file to be saved as a .jpg extension
                const newFileName = `${path.parse(fileName).name}.jpg`;
                const s3Key = `media/${mediaId}/careers/certificates/${newFileName}`;

                await this.uploadToS3(compressedImageBuffer, s3Key, image.mimetype);


                if (id === -1) {
                    // INSERT certificate
                    await db.query(
                        `INSERT INTO user_profile_certificate 
                         (user_profile_id, issued_by, certificate_download_url, certificate_file_name, certificate_size, certificate_type) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [userProfileId, issuedBy, s3Key, newFileName, fileSize, type]
                    );
                } else {

                    //delete old image befroe udpating 
                    const cert = existingCertificates.find(c => c.id === id);
                    if (cert) {
                        const downloadUrl = cert.certificate_download_url;
                        await this.deleteS3Keys([downloadUrl])
                    }

                    // UPDATE certificate with file
                    await db.query(
                        `UPDATE user_profile_certificate 
                         SET issued_by = ?, certificate_download_url = ?, certificate_file_name = ?, certificate_size = ?, certificate_type = ? 
                         WHERE id = ? AND user_profile_id = ?`,
                        [issuedBy, s3Key, newFileName, fileSize, type, id, userProfileId]
                    );
                }
            } else {

                // UPDATE certificate without file
                await db.query(
                    `UPDATE user_profile_certificate 
                     SET issued_by = ? 
                     WHERE id = ? AND user_profile_id = ?`,
                    [issuedBy, id, userProfileId]
                );
            }


        }

        // 6. Return updated user profile
        const result = await JobUser.getApplicantUserProfile(userId);
        return result;
    }

    static async uploadToS3(buffer, key, contentType) {
        const params = {
            Bucket: S3_BUCKET_NAME,
            Key: key,  // The S3 path (folder + filename)
            Body: buffer,
            ContentType: contentType, // MIME type of the file
            ACL: 'public-read' // Optional: make the file public (if needed)
        };

        try {
            const data = await awsS3Bucket.upload(params).promise();
            return data.Location; // This is the public URL to the uploaded file
        } catch (error) {
            throw new Error('Error uploading to S3: ' + error.message);
        }
    }

    static async deleteS3Keys(keys) {
        if (!keys.length) return;
        const params = {
            Bucket: S3_BUCKET_NAME,
            Delete: {
                Objects: keys.map(key => ({ Key: key })),
                Quiet: true,
            }
        };

        await awsS3Bucket.deleteObjects(params).promise();
    }




}


module.exports = JobUser;