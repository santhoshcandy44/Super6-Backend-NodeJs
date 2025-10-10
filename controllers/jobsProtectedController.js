const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const ApplicantProfile = require('../models/ApplicantProfile');
const Job = require('../models/Job');
const JobIndustries = require('../models/JobIndustries');
const User = require('../models/User');

exports.getJobListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { s, s_latitude, s_longitude, page_size, next_token, work_modes, salary_min, salary_max } = req.query;
        const querySearch = !s ? '' : s;

        let industries = await JobIndustries.getIndustries(user_id);
        industries = industries.filter((value) => 
            value.is_selected
        )
        if (!querySearch && (!industries || industries.length === 0)) {
            return sendErrorResponse(
                res,
                400,
                'Industries cannot be empty',
                null,
                'EMPTY_JOB_INDUSTRIES');
        }

        const queryNextToken = !next_token ? null : next_token;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const VALID_WORK_MODES = ['remote', 'office', 'hybrid', 'flexible'];
        const workModesArray = Array.isArray(work_modes)
            ? work_modes
            : typeof work_modes === 'string'
                ? work_modes.split(',')
                : [];
        const normalizedWorkModes = workModesArray
            .map(mode => mode.trim().toLowerCase())
            .filter(mode => VALID_WORK_MODES.includes(mode));

        const countryCode = req.headers['x-country-code'];
        const salaryMin = salary_min !== undefined ? salary_min : -1;
        const salaryMax = salary_max !== undefined ? salary_max : -1;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await Job.getJobPostings(user_id, decodedQuery, s_latitude, s_longitude, PAGE_SIZE, queryNextToken, normalizedWorkModes, salaryMin, salaryMax);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve jobs");
        }
        return sendJsonResponse(res, 200, "Jobs retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getGuestJobListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { s, s_latitude, s_longitude, latitude, longitude, industries, page_size, next_token, work_modes, salary_min, salary_max } = req.query;

        const querySearch = !s ? '' : s;
        const queryNextToken = !next_token ? null : next_token;
        const queryIndustries = !industries ? [] : industries;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const VALID_WORK_MODES = ['remote', 'office', 'hybrid', 'flexible'];
        const workModesArray = Array.isArray(work_modes)
            ? work_modes
            : typeof work_modes === 'string'
                ? work_modes.split(',')
                : [];
        const normalizedWorkModes = workModesArray
            .map(mode => mode.trim().toLowerCase())
            .filter(mode => VALID_WORK_MODES.includes(mode));

        const countryCode = req.headers['x-country-code'];
        const salaryMin = salary_min !== undefined ? salary_min : -1;
        const salaryMax = salary_max !== undefined ? salary_max : -1;
        const PAGE_SIZE = page_size ? page_size : 20;
        const coordinates = latitude && longitude && latitude != null && longitude != null ? { latitude, longitude } : null;
        const result = await Job.getGuestJobPostings(user_id, decodedQuery, s_latitude, s_longitude, coordinates, queryIndustries, PAGE_SIZE, queryNextToken, normalizedWorkModes, salaryMin, salaryMax);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve jobs");
        }
        return sendJsonResponse(res, 200, "Jobs retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getSavedJobs = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const {page_size, next_token} = req.query;
        const nextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 30;
        const result = await Job.getSavedJobs(user_id, PAGE_SIZE, nextToken);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve saved jobs");
        }
        return sendJsonResponse(res, 200, "Jobs retrieved successfully", result)
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error.message)
    }
}

exports.bookmarkJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { job_id } = req.body;
        const result = await Job.bookmarkJob(user_id, job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark local job");
        }
        return sendJsonResponse(res, 200, "Loclal job bookmarked successfully");
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.removeBookmarkJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { job_id } = req.body;
        const result = await Job.removeBookmarkJob(user_id, job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }
        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.searchLocationSuggestions = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const query = req.query.query;
        const result = await Job.searchLocationSuggestions(query)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }
        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.searchRoleSuggestions = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        // const user_id = req.user.user_id;
        const query = req.query.query;
        const result = await Job.searchRoleSuggestions(query)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }
        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.applyJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { job_id } = req.body;
        const result = await Job.applyJob(user_id, job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to apply job");
        }
        return sendJsonResponse(res, 200, result.is_profile_completed && result.is_applied ? "Job applied successfully" : "Failed to apply job", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

//Profile

exports.getApplicantProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.params.user_id;
        const user = req.user
        if (userId != user.user_id) {
            return sendErrorResponse(res, 400, 'Access forbidden');
        }
        const result = await ApplicantProfile.getApplicantUserProfile(userId);
        if (!result) {
            return sendErrorResponse(res, 404, 'User profile not exist');
        }
        return sendJsonResponse(res, 200, "Profile fetched successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result) === 6 ? -1 : getNextIncompleteStep(result)
        });
    } catch (err) {
        return sendErrorResponse(res, 500, 'Internal Server error', err.message);
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const jobProfessionalInfo = req.body;
        const userId = req.user.user_id;
        const profilePic = req.file;
        const result = await ApplicantProfile.updateOrCreateUserProfile(userId, jobProfessionalInfo, profilePic);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update personal information");
        }

        return sendJsonResponse(res, 200, "Personal information updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        console.log(error)
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateEducation = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const applicantEducationInfo = req.body;
        if (!applicantEducationInfo) {
            return sendErrorResponse(res, 400, "Missing  education info");
        }
        const userId = req.user.user_id;
        const result = await ApplicantProfile.updateOrCreateEducationInfo(userId, applicantEducationInfo);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update education information");
        }
        return sendJsonResponse(res, 200, "Education info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateExperience = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const applicantExperienceInfo = req.body;
        if (!applicantExperienceInfo) {
            return sendErrorResponse(res, 400, "Missing experience Info");
        }
        const userId = req.user.user_id;
        const result = await ApplicantProfile.updateOrCreateExperienceInfo(userId, applicantExperienceInfo);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update experience information");
        }
        return sendJsonResponse(res, 200, "Experience info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateNoExperience = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const result = await ApplicantProfile.updateExperienceAsNone(userId);

        if (!result) {
            return sendErrorResponse(res, 400, 'Failed to update no experience information');
        }

        return sendJsonResponse(res, 200, 'No exeperince updated successfully', {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });

    } catch (error) {
        return sendErrorResponse(res, 500, 'Internal Server Error', error.message);
    }
};

exports.updateSkill = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const applicantSkillInfo = req.body;
        if (!applicantSkillInfo) {
            return sendErrorResponse(res, 400, "Missing  skills info");
        }
        const userId = req.user.user_id;
        const result = await ApplicantProfile.updateOrCreateSkillInfo(userId, applicantSkillInfo);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update skills information");
        }
        return sendJsonResponse(res, 200, "Skill info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateLanguage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());

        }
        const applicantLanguageInfo = req.body;
        if (!applicantLanguageInfo || applicantLanguageInfo.length === 0) {
            return sendErrorResponse(res, 400, "Missing language");
        }
        const userId = req.user.user_id;
        const result = await ApplicantProfile.updateOrCreateLanguageInfo(userId, applicantLanguageInfo);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update language information");
        }
        return sendJsonResponse(res, 200, "Language info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateResume = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const resume = req.file;
        const result = await ApplicantProfile.updateOrCreateUserResume(userId, resume);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update resume");
        }
        return sendJsonResponse(res, 200, "Resume info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const applicantCertificateInfo = req.body.applicantCertificateInfo;

        const userId = req.user.user_id;
        const certificates = applicantCertificateInfo.map((cert, index) => {
            const id = cert.id;
            const fieldName = `certificates-new-${index}`;
            const file = req.files?.find(f => f.fieldname === fieldName);
            let image;
            if (id === -1) {
                if (!file) {
                    throw new Error('Missing image for new certificate');
                }
                image = file;
            } else {
                image = file ? file : cert.image;
            }
            return {
                id,
                issuedBy: cert.issued_by,
                fileName: cert.file_name,
                fileSize: cert.file_size,
                type: cert.type,
                image,
            };
        });
        const result = await ApplicantProfile.updateOrCreateUserCertificates(userId, certificates);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update certificates");
        }
        return sendJsonResponse(res, 200, "Certificate info updated successfully", {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_educations: result.educationList,
            applicant_experiences: result.experienceList,
            applicant_skills: result.skillsList,
            applicant_languages: result.languagesList,
            applicant_certificates: result.certificateList,
            applicant_resume: result.resume ? {
                resume: result.resume.resume_download_url,
                file_name: result.resume.file_name,
                file_size: result.resume.resume_size,
                type: result.resume.resume_type,
                last_used: result.resume.last_used
            } : null,
            next_complete_step: getNextIncompleteStep(result)
        });
    } catch (error) {
        console.error(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

function getNextIncompleteStep(result) {
    if (!(result.first_name && result.last_name && result.gender && result.email && result.intro)) {
        return 0;
    }
    if (!result.educationList || result.educationList.length === 0) {
        return 1;
    }
    if (!result.experienceList || result.experienceList.length === 0) {
        return 2;
    }
    if (!result.skillsList || result.skillsList.length === 0) {
        return 3;
    }
    if (!result.languagesList || result.languagesList.length === 0) {
        return 4;
    }
    if (!result.resume) {
        return 5;
    }

    if (!result.certificateList || result.certificateList.length === 0) {
        return 6;
    }

    return -1;
}

exports.getIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { user_id } = req.query;
        const userIdProtected = req.user.user_id;
        const userExists = await User.findUserById(userIdProtected);
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const industries = await JobIndustries.getIndustries(userIdProtected);
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

exports.getGuestIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendErrorResponse(res, 400, "User id is required", errors.array());
        }
        const { user_id } = req.query;
        const industries = await JobIndustries.getGuestIndustries();
        return sendJsonResponse(res, 200, "Industries retrived successfully", industries);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

exports.updateIndustries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }

        const { user_id } = req.body;
        const userIdProtected = req.user.user_id;
        const industriesArray = JSON.parse(req.body.industries);
        const userExists = await User.findUserById(userIdProtected);
        if (!userExists) {
            return sendErrorResponse(res, 403, "User not exist");
        }
        const industries = await JobIndustries.updateIndustries(user_id, industriesArray);
        return sendJsonResponse(res, 200, "Industries updated successfully", industries);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};