const sharp = require('sharp');
const path = require('path'); 
const db = require('../config/lts360JobsDatabase.js')
const { generateShortEncryptedUrl, verifyShortEncryptedUrl } = require('../utils/authUtils.js');
const User = require('./User.js');
const { PROFILE_BASE_URL, MEDIA_BASE_URL } = require('../config/config.js');
const { uploadToS3, deleteFromS3} = require('../config/awsS3.js')

class ApplicantProfile {
    static async getApplicantUserProfile(userId) {
        const [profile] = await db.query(
            `SELECT id, first_name, last_name, gender, email, phone, intro, profile_picture 
             FROM applicant_profile 
             WHERE external_user_id = ?`,
            [userId]
        );
        if (!profile) return null;
        const userProfileId = profile.id;
        const [experienceRows] = await db.query(
            `SELECT organization, job_title, employment_type, location, start_date, end_date, current_working_here, experienced
             FROM applicant_profile_experience 
             WHERE applicant_id = ?`,
            [userProfileId]
        );
        let experienceList = [];
        if (experienceRows.length === 0) {
            experienceList = [];
        } else {
            const hasExperience = Boolean(experienceRows[0]?.experienced);
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

        const [educationRows] = await db.query(
            `SELECT organization_name AS institution, field_of_study, start_date, end_date, grade, currently_studying 
             FROM applicant_profile_education_info 
             WHERE applicant_id = ?`,
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

        const [languageRows] = await db.query(
            `SELECT language, language_code, proficiency, proficiency_code 
             FROM applicant_profile_language 
             WHERE applicant_id = ?`,
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

        const [skillRows] = await db.query(
            `SELECT skill, skill_code 
             FROM applicant_profile_skill 
             WHERE applicant_id = ?`,
            [userProfileId]
        );

        const skillsList = skillRows.map(row => ({
            skill: row.skill,
            skill_code: row.skill_code
        }));

        const [certificateRows] = await db.query(
            `SELECT id, issued_by, certificate_download_url AS image, certificate_file_name AS fileName, certificate_size AS fileSize, certificate_type AS type
             FROM applicant_profile_certificate
             WHERE applicant_id = ?`,
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

        const [resumeRows] = await db.query(
            `SELECT resume_file_name, resume_download_url, resume_size, resume_type, last_used 
             FROM applicant_profile_resume 
             WHERE applicant_id = ? 
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
            const [rows] = await db.query("SELECT id FROM applicant_profile WHERE id = ? LIMIT 1", [id]);
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
            `SELECT profile_picture FROM applicant_profile WHERE external_user_id = ?`,
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
                        await deleteFromS3(path);
                    }
                }
            }

            await uploadToS3(compressedImageBuffer, s3Key, 'image/jpeg');
            profilePicUrl = generateShortEncryptedUrl(s3Key);
        } else if (existingProfile?.profile_picture) {
            profilePicUrl = existingProfile.profile_picture;
        }

        const unique_user_id = await this.generateUnique11DigitId()
        const query = `
            INSERT INTO applicant_profile (applicant_id, external_user_id, first_name, last_name, email, gender, intro, profile_picture, is_verified, created_at, updated_at)
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
        return await ApplicantProfile.getApplicantUserProfile(userId);
    }

    static async updateOrCreateEducationInfo(userId, educationList = []) {
        await db.query(
            'DELETE FROM applicant_profile_education_info WHERE applicant_id = (SELECT id FROM applicant_profile WHERE external_user_id = ?)',
            [userId]
        );
        const insertEducationQuery = `
            INSERT INTO applicant_profile_education_info (
                applicant_id, organization_name, field_of_study, start_date, end_date, grade, currently_studying
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [userProfile] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
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
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }

    static async updateOrCreateExperienceInfo(userId, experienceList = []) {
        await db.query(
            'DELETE FROM applicant_profile_experience WHERE applicant_id = (SELECT id FROM applicant_profile WHERE external_user_id = ?)',
            [userId]
        );

        const insertExperienceQuery = `
            INSERT INTO applicant_profile_experience (
                applicant_id, organization, job_title, employment_type, location,
                start_date, end_date, current_working_here, experienced
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [[userProfile]] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
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
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }

    static async updateExperienceAsNone(userId) {
        await db.query(
            `DELETE FROM applicant_profile_experience
           WHERE applicant_id = (
             SELECT id FROM applicant_profile WHERE external_user_id = ?
           )`,
            [userId]
        );

        const [[userProfile]] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
            [userId]
        );

        if (!userProfile) return null;

        await db.query(
            `INSERT INTO applicant_profile_experience (
              applicant_id, organization, job_title, employment_type, location,
              start_date, end_date, current_working_here, experienced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userProfile.id,
                null, 
                null, 
                null,
                null, 
                null,
                null, 
                false,
                false 
            ]
        );

        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }

    static async updateOrCreateSkillInfo(userId, skillList = []) {
        await db.query(
            'DELETE FROM applicant_profile_skill WHERE applicant_id = (SELECT id FROM applicant_profile WHERE external_user_id = ?)',
            [userId]
        );

        const insertSkillQuery = `
            INSERT INTO applicant_profile_skill (
                applicant_id, skill, skill_code
            )
            VALUES (?, ?, ?)
        `;

        const [[userProfile]] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
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

        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }

    static async updateOrCreateLanguageInfo(userId, languageList = []) {
        await db.query(
            'DELETE FROM applicant_profile_language WHERE applicant_id = (SELECT id FROM applicant_profile WHERE external_user_id = ?)',
            [userId]
        );

        const [[userProfile]] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
            [userId]
        );

        if (!userProfile) return null;

        const insertLanguageQuery = `
            INSERT INTO applicant_profile_language (
                applicant_id, language, language_code, proficiency, proficiency_code
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
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }


    static async updateOrCreateUserResume(userId, file) {
        const user = await User.getUserMedia(userId);
        if (!user) return null; 

        const mediaId = user.media_id;
        const allowedTypes = ["PDF", "DOC", "DOCX"];
        const fileType = file.mimetype.split('/')[1].toUpperCase(); 
        if (!allowedTypes.includes(fileType)) return null; 

        const [[userProfile]] = await db.query(
            `SELECT id FROM applicant_profile WHERE external_user_id = ?`,
            [userId]
        );

        if (!userProfile) return null; 

        const [[exisitngResume]] = await db.query(
            'SELECT resume_download_url FROM applicant_profile_resume WHERE  applicant_id =  ?',
            [userProfile.id]
        );

        if (exisitngResume?.resume_download_url) {
            const oldResumePath = exisitngResume.resume_download_url;
            if (oldResumePath) {
                await deleteFromS3(oldResumePath);
            }
        }

        const fileName = file.originalname;
        const s3Key = `media/${mediaId}/careers/resume/${fileName}`;
        await uploadToS3(file.buffer, s3Key, fileType);

        const resumeDownloadUrl = s3Key;
        const insertResumeQuery = `
            INSERT INTO applicant_profile_resume 
            (applicant_id, resume_file_name, resume_download_url, resume_size, resume_type)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                resume_file_name = VALUES(resume_file_name),
                resume_download_url = VALUES(resume_download_url),
                resume_size = VALUES(resume_size),
                resume_type = VALUES(resume_type)
                `;
        await db.query(insertResumeQuery, [userProfile.id, fileName, resumeDownloadUrl, file.size, fileType]);
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }

    static async updateOrCreateUserCertificates(userId, certificates) {
        const user = await User.getUserMedia(userId);
        if (!user) {
            throw new Error("Access forbidden");
        }
        const [[userProfile]] = await db.query(
            'SELECT id FROM applicant_profile WHERE external_user_id = ?',
            [userId]
        );
        if (!userProfile) return null;

        const userProfileId = userProfile.id;
        const mediaId = user.media_id;
        const allowedTypes = ["JPG", "PNG"];

        const [existingCertificates] = await db.query(
            `SELECT id, certificate_download_url FROM applicant_profile_certificate WHERE applicant_id = ?`,
            [userProfileId]
        );

        const existingIds = existingCertificates.map(cert => cert.id);
        const incomingIds = certificates.map(cert => cert.id).filter(id => id !== -1);

        const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

        if (idsToDelete.length > 0) {
            const s3KeysToDelete = existingCertificates
                .filter(cert => idsToDelete.includes(cert.id))
                .map(cert => cert.certificate_download_url);
            await db.query(
                `DELETE FROM applicant_profile_certificate WHERE id IN (?) AND applicant_id = ?`,
                [idsToDelete, userProfileId]
            );

            for (const s3Key of s3KeysToDelete) {
                await deleteFromS3(s3Key);
            }
        }

        for (const cert of certificates) {
            const { id, issuedBy, image, fileSize, type } = cert;

            if (!issuedBy || !image) {
                throw new Error("Missing required certificate data (issuedBy or image)");
            }

            if (!allowedTypes.includes(type)) {
                throw new Error(`Unsupported certificate file type: ${type}`);
            }

            if (image.mimetype && image.mimetype.startsWith('image/')) {
                const compressedImageBuffer = await sharp(image.buffer)
                    .jpeg({ quality: 80 }) 
                    .toBuffer();
                const fileName = image.originalname;
                const newFileName = `${path.parse(fileName).name}.jpg`;
                const s3Key = `media/${mediaId}/careers/certificates/${newFileName}`;
                await uploadToS3(compressedImageBuffer, s3Key, image.mimetype);
                if (id === -1) {
                    await db.query(
                        `INSERT INTO applicant_profile_certificate 
                         (applicant_id, issued_by, certificate_download_url, certificate_file_name, certificate_size, certificate_type) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [userProfileId, issuedBy, s3Key, newFileName, fileSize, type]
                    );
                } else {
                    const cert = existingCertificates.find(c => c.id === id);
                    if (cert) {
                        const downloadUrl = cert.certificate_download_url;
                        await deleteFromS3(downloadUrl)
                    }
                    await db.query(
                        `UPDATE applicant_profile_certificate 
                         SET issued_by = ?, certificate_download_url = ?, certificate_file_name = ?, certificate_size = ?, certificate_type = ? 
                         WHERE id = ? AND applicant_id = ?`,
                        [issuedBy, s3Key, newFileName, fileSize, type, id, userProfileId]
                    );
                }
            } else {
                await db.query(
                    `UPDATE applicant_profile_certificate 
                     SET issued_by = ? 
                     WHERE id = ? AND applicant_id = ?`,
                    [issuedBy, id, userProfileId]
                );
            }
        }
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        return result;
    }
}

module.exports = ApplicantProfile;