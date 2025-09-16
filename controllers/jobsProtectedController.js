const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const JobUser = require('../models/JobUser');
const Job = require('../models/Job');

exports.getJobListingsForUser = async (req, res) => {
    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { s, page, last_timestamp, last_total_relevance, work_modes, salary_min, salary_max } = req.query;

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;


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

        const countryCode = req.headers['x-country-code']; // 👈 get it from headers


        const salaryMin = salary_min !== undefined ? salary_min : -1;
        const salaryMax = salary_max !== undefined ? salary_max : -1;

       
        const PAGE_SIZE = 1;

        const result = await Job.getJobPostingsUser(user_id, decodedQuery, queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance, normalizedWorkModes, salaryMin, salaryMax);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve jobs");
        }

        console.log(result);

        return sendJsonResponse(res, 200, "Jobs retrieved successfully", result);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};


exports.applyJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id;
        const { job_id } = req.body;
        const result = await Job.applyJob(user_id, job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to apply job");
        }
        return sendJsonResponse(res, 200, "Job apply status", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.getApplicantProfile = async (req, res) => {
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0]; // Get the first error
        return sendErrorResponse(res, 400, firstError, errors.array());
    }

    try {

        const userId = req.params.user_id;
        const user = req.user

        if (userId != user.user_id) {
            return sendErrorResponse(res, 400, 'Access forbidden');
        }

        // Call getApplicantUserProfile to fetch the profile data
        const result = await JobUser.getApplicantUserProfile(userId);

        if (!result) {
            return sendErrorResponse(res, 404, 'User profile not found');
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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

function getNextIncompleteStep(result) {
    // Check if profile information is missing
    if (!(result.first_name && result.last_name && result.gender && result.email && result.intro)) {
        return 0; // Profile information is incomplete
    }

    // Check if education information is missing
    if (!result.educationList || result.educationList.length === 0) {
        return 1; // Education information is incomplete
    }

    // Check if experience information is missing
    if (!result.experienceList || result.experienceList.length === 0) {
        return 2; // Experience information is incomplete
    }

    // Check if skills information is missing
    if (!result.skillsList || result.skillsList.length === 0) {
        return 3; // Skills information is incomplete
    }


    // Check if languages information is missing
    if (!result.languagesList || result.languagesList.length === 0) {
        return 4; // Languages information is incomplete
    }

    // Check if resume is missing
    if (!result.resume) {
        return 5; // Resume is missing
    }

    //Certificate step
    if (!result.certificateList || result.certificateList.length === 0) {
        return 6; // Skip step 4
    }

    return -1; // All steps are complete
}

exports.updateProfile = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());

        }

        const jobProfessionalInfoJson = req.body.applicantProfessionalInfo;

        if (!jobProfessionalInfoJson) {
            return res.status(400).json({ error: 'Missing jobProfessionalInfo part' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        const jobProfessionalInfo = JSON.parse(jobProfessionalInfoJson);

        // Access the uploaded profilePic if it exists
        const profilePic = req.file;

        const result = await JobUser.updateOrCreateUserProfile(userId, jobProfessionalInfo, profilePic);


        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update personal information");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.updateEducation = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }

        const applicantEducationInfo = req.body;

        if (!applicantEducationInfo) {
            return res.status(400).json({ error: 'Missing  jobProfessionalInfo' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        const result = await JobUser.updateOrCreateEducationInfo(userId, applicantEducationInfo);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update personal information");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.updateExperience = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const applicantExperienceInfo = req.body;

        if (!applicantExperienceInfo) {
            return res.status(400).json({ error: 'Missing  jobProfessionalInfo' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        const result = await JobUser.updateOrCreateExperienceInfo(userId, applicantExperienceInfo);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update personal information");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.updateNoExperience = async (req, res) => {
    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }


        const userId = req.user.user_id;

        const result = await JobUser.updateExperienceAsNone(userId);

        if (!result) {
            return sendErrorResponse(res, 500, 'Failed to update personal information');
        }

        return sendJsonResponse(res, 200, 'Profile fetched successfully', {
            applicant_professional_info: {
                first_name: result.first_name,
                last_name: result.last_name,
                email: result.email,
                gender: result.gender,
                intro: result.intro,
                profile_pic_url: result.profile_picture
            },
            applicant_education: result.educationList,
            applicant_experience: result.experienceList,
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, 'Internal Server Error', error.toString());
    }
};

exports.updateSkill = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const applicantSkillInfo = req.body;

        if (!applicantSkillInfo) {
            return res.status(400).json({ error: 'Missing  skills' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user



        const result = await JobUser.updateOrCreateSkillInfo(userId, applicantSkillInfo);


        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update skills information");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.updateCertificate = async (req, res) => {
    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const applicantCertificateInfoJson = req.body.applicantCertificateInfo;

        if (!applicantCertificateInfoJson) {
            return res.status(400).json({ error: 'Missing applicantCertificateInfo part' });
        }

        const applicantCertificateInfo = JSON.parse(applicantCertificateInfoJson);

        // 🔒 Limit max 5 certificates
        if (applicantCertificateInfo.length > 5) {
            return res.status(400).json({ error: 'You can only upload up to 5 certificates.' });
        }

        const userId = req.user.user_id;

        const certificates = applicantCertificateInfo.map((cert) => {
            const id = cert.id;
            const fieldName = id === -1 ? 'certificates-new' : `certificates-${id}`;
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

        const result = await JobUser.updateOrCreateUserCertificates(userId, certificates);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update certificates");
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
            applicant_education: result.educationList,
            applicant_experience: result.experienceList,
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.updateLanguage = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const applicantLanguageInfo = req.body;

        if (!applicantLanguageInfo || applicantLanguageInfo.length === 0) {
            return res.status(400).json({ error: 'Missing  languages' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user
        const result = await JobUser.updateOrCreateLanguageInfo(userId, applicantLanguageInfo);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update skills information");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.updateResume = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const applicantResumeInfoJson = req.body.applicantResumeInfo;

        if (!applicantResumeInfoJson) {
            return res.status(400).json({ error: 'Missing applicantResumeInfo part' });
        }

        const userId = req.user.user_id; // Assuming `authenticateToken` sets req.user

        const applicantResumeInfo = JSON.parse(applicantResumeInfoJson);

        // Access the uploaded profilePic if it exists
        const resume = req.file;



        const result = await JobUser.updateOrCreateUserResume(userId, resume);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update resume");
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
            applicant_education: result.educationList, // <-- return education list here
            applicant_experience: result.experienceList, // <-- return education list here
            applicant_skill: result.skillsList,
            applicant_language: result.languagesList,
            applicant_certificate: result.certificateList,
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
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};