const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const LocalJobModel = require('../models/LocalJobModel');


exports.getLocalJobsForUser = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id;
        const { s, page, last_timestamp, last_total_relevance } = req.query;

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;


        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const result = await LocalJobModel.getLocalJobsForUser(user_id, decodedQuery, queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Local jobs retrieved successfully", result);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.guestGetLocalJobs = async (req, res) => {

    try {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const { user_id, s, page, last_timestamp, last_total_relevance, latitude, longitude} = req.query;

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;

        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const coordinates = latitude && longitude && latitude!=null && longitude!=null ? {latitude, longitude} : null


        const result = await LocalJobModel.guestGetLocalJobs(user_id, decodedQuery, 
            queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance, coordinates);
 
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Seconds retrieved successfully", result);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
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

        const images = req.files['images[]']; // This will contain the uploaded images
        const user_id = req.user.user_id; // This will contain the uploaded images

        const keepImageIdsArray =  keep_image_ids?  keep_image_ids.map(id => Number(id))
        : [];


        const result = await LocalJobModel.createOrUpdateLocalJob(user_id, title, description, company, age_min,
            age_max, marital_statuses, salary_unit, salary_min, salary_max, country, state, images, location, keepImageIdsArray, local_job_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish service");
        }

        return sendJsonResponse(res, 200, "Local job updated successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }


};

exports.getPublishedLocalJobs = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; 

        const result = await LocalJobModel.getPublishedLocalJobs(user_id)


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve local jobs");
        }
       
        return sendJsonResponse(res, 200, "Published local jobs retrieved successfully", result);

      
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};


exports.getLocalJobApplicants = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; 

        const {local_job_id} = req.params;


        const {page, last_timestamp } = req.query;

        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const PAGE_SIZE = 30;

        const result = await LocalJobModel.getLocalJobApplicants(user_id, local_job_id, queryPage, PAGE_SIZE, queryLastTimestamp)


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve local job applicants");
        }
       
        return sendJsonResponse(res, 200, "Local job applicants retrieved successfully", result);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};


exports.markAsReviewedLocalJob= async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id;
        const { local_job_id, applicant_id } = req.body;
        const result = await LocalJobModel.markAsReviewed(user_id, local_job_id, applicant_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to mark as reviewed local job");
        }

        return sendJsonResponse(res, 200, "Successfully local job maked as reviewed");
    } catch (error) {
        console.log(error);
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
        const result = await LocalJobModel.unmarkAsReviewed(user_id, local_job_id, applicant_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to unmark reviewed local job");
        }

        return sendJsonResponse(res, 200, "Successfully local job unmarked as reviewed");
    } catch (error) {
        console.log(error);
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
        const result = await LocalJobModel.applyLocalJob(user_id, local_job_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to apply local job");
        }
        
        return sendJsonResponse(res, 200, "Local job applied successfully");
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};


exports.bookmarkLocalJob= async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; 
            return sendErrorResponse(res, 400, firstError, errors.array());
        }
        
        const user_id = req.user.user_id;
        const { local_job_id } = req.body;
        const result = await LocalJobModel.bookmarkLocalJob(user_id, local_job_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark local job");
        }

        return sendJsonResponse(res, 200, "Seconds bookmarked successfully");
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.removeBookmarkLocalJob= async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id;
        const { local_job_id } = req.body;
        const result = await LocalJobModel.removeBookmarkLocalJob(user_id, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }

        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.localJobsSearchQueries = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        // const user_id = req.user.user_id; // This will contain the uploaded images
        const query = req.query.query; // This will contain the uploaded images

        
        const result = await LocalJobModel.LocalJobsSearchQueries(query)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }

        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.deleteLocalJob = async (req, res) => {



    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { local_job_id } = req.params;
        const result = await LocalJobModel.deleteLocalJob(user_id, local_job_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete local job");
        }

        return sendJsonResponse(res, 200, "Local job deleted successfully");

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);

    }


};



