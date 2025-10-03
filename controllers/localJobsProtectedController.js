const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const LocalJob = require('../models/LocalJob');

exports.getLocalJobsForUser = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { s, page, last_timestamp, last_total_relevance } = req.query;
        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;
        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;
        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = 30;
        const result = await LocalJob.getLocalJobsForUser(user_id, decodedQuery, queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve local jobs");
        }
        console.log(result);
        return sendJsonResponse(res, 200, "Local jobs retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.guestGetLocalJobs = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { user_id, s, page, last_timestamp, last_total_relevance, latitude, longitude} = req.query;
        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;
        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;
        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = 30;
        const coordinates = latitude && longitude && latitude!=null && longitude!=null ? {latitude, longitude} : null
        const result = await LocalJob.guestGetLocalJobs(user_id, decodedQuery, 
            queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance, coordinates);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Seconds retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.createOrUpdateLocalJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0].msg;
            return sendErrorResponse(res, 400,firstError, errors.array());
        }
        const {local_job_id, title, description, company, age_min, age_max, marital_statuses, salary_unit, salary_min, salary_max, location, country, state, keep_image_ids } = req.body; 
        const images = req.files['images[]']; 
        const user_id = req.user.user_id;
        const keepImageIdsArray =  keep_image_ids?  keep_image_ids.map(id => Number(id))
        : [];
        const result = await LocalJob.createOrUpdateLocalJob(user_id, title, description, company, age_min,
            age_max, marital_statuses, salary_unit, salary_min, salary_max, country, state, images, location, keepImageIdsArray, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish service");
        }
        return sendJsonResponse(res, 200, "Local job updated successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getPublishedLocalJobs = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id; 
        const { user_id: userId } = req.params;
        if(userId != user_id) return sendErrorResponse(res, 400, "Access forbidden to retrieve local jobs");
        const { page, page_size, last_timestamp } = req.query;
        const queryPage = page ? page : 1;
        const PAGE_SIZE = page_size ? page_size : 20;
        const queryLastTimestamp = last_timestamp ? last_timestamp : null;
        const result = await LocalJob.getPublishedLocalJobs(user_id, queryPage, PAGE_SIZE, queryLastTimestamp)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve local jobs");
        }
        return sendJsonResponse(res, 200, "Published local jobs retrieved successfully", result);      
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.getLocalJobApplications = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id; 
        const { local_job_id } = req.params;
        const { page, page_size, last_timestamp } = req.query;
        const queryPage = page ? page : 1;
        const queryLastTimestamp = last_timestamp ? last_timestamp : null;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await LocalJob.getLocalJobApplications(user_id, local_job_id, queryPage, PAGE_SIZE, queryLastTimestamp)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve local job applicants");
        }
        return sendJsonResponse(res, 200, "Local job applicants retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.markAsReviewedLocalJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { local_job_id, applicant_id } = req.body;
        const result = await LocalJob.markAsReviewed(user_id, local_job_id, applicant_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to mark as reviewed local job");
        }
        return sendJsonResponse(res, 200, "Successfully local job maked as reviewed");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.unmarkReviewedLocalJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());
        }
        const user_id = req.user.user_id;
        const { local_job_id,  applicant_id} = req.body;
        const result = await LocalJob.unmarkAsReviewed(user_id, local_job_id, applicant_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to unmark reviewed local job");
        }
        return sendJsonResponse(res, 200, "Successfully local job unmarked as reviewed");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.applyLocalJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id;
        const { local_job_id } = req.body;
        const result = await LocalJob.applyLocalJob(user_id, local_job_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to apply local job");
        }
        
        return sendJsonResponse(res, 200, "Local job applied successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }

};

exports.bookmarkLocalJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { local_job_id } = req.body;
        const result = await LocalJob.bookmarkLocalJob(user_id, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark local job");
        }
        return sendJsonResponse(res, 200, "Loclal job bookmarked successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.removeBookmarkLocalJob= async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { local_job_id } = req.body;
        const result = await LocalJob.removeBookmarkLocalJob(user_id, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }
        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.localJobsSearchQueries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.message, errors.array());
        }
        // const user_id = req.user.user_id; 
        const query = req.query.query;
        const result = await LocalJob.LocalJobsSearchQueries(query);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }
        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.deleteLocalJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id; 
        const { local_job_id } = req.params;
        const result = await LocalJob.deleteLocalJob(user_id, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete local job");
        }
        return sendJsonResponse(res, 200, "Local job deleted successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};