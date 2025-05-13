const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const ServiceModel = require('../models/ServiceModel '); // Assuming this is the user model
const UsedProductListingModel = require('../models/UsedProdctListingModel');



exports.getUsedProductListingsForUser = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { s, page, last_timestamp, last_total_relevance } = req.query;

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;


        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const result = await UsedProductListingModel.getUsedProductListingsForUser(user_id, decodedQuery, queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Seconds retrieved successfully", result);

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.guestGetUsedProductListings = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());
        }


        
        const { user_id, s, page, industries, last_timestamp, last_total_relevance, latitude, longitude} = req.query;

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;




        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const coordinates = latitude && longitude && latitude!=null && longitude!=null ? {latitude, longitude} : null


        const result = await UsedProductListingModel.guestGetUsedProductListings(user_id, decodedQuery, 
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



exports.getUserPublishedUsedProductListingsFeedGuest = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const {user_id} = req.params; // This will contain the uploaded images


        const result = await ServiceModel.getUserPublishedServices(user_id)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }



        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.getPublishedUsedProductListingsFeedUser = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const userId = req.user.user_id;
        const {user_id} =  req.params;


        const result = await ServiceModel.getUserPublishedServicesFeedUser(userId, user_id)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }


        
        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.getPublishedUsedProductListings = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; 

        const result = await UsedProductListingModel.getPublishedUsedProductListings(user_id)


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve products");
        }
       
        return sendJsonResponse(res, 200, "Published products retrieved successfully", result);

      
    } catch (error) {

        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};


exports.createOrUpdateUsedProductListing = async (req, res) => {

    try {


        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0].msg; // Get the first error
            return sendErrorResponse(res, 400,firstError, errors.array());
        }


        // Read values from req.body
        const {product_id, name, description, price, price_unit, location, country, state, keep_image_ids } = req.body;  // keepImageIds comes from req.body
        // Access uploaded images
        const images = req.files['images[]']; // This will contain the uploaded images
        const user_id = req.user.user_id; // This will contain the uploaded images
        const keepImageIdsArray = keep_image_ids? keep_image_ids.map(id => Number(id)): [];


        const result = await UsedProductListingModel.createOrUpdateUsedProductListing(user_id, name, description, price, price_unit, country, state, images, location, keepImageIdsArray, product_id);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish service");
        }

        return sendJsonResponse(res, 200, "Used product updated successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }


};

exports.bookmarkUsedProductListing = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id;
        const { product_id } = req.body;
        const result = await UsedProductListingModel.bookmarkUsedProductListing(user_id, product_id);


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark service");
        }

        return sendJsonResponse(res, 200, "Seconds bookmarked successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.removeBookmarkUsedProductListing = async (req, res) => {



    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const user_id = req.user.user_id;
        const { product_id } = req.body;
        const result = await UsedProductListingModel.removeBookmarkUsedProductListing(user_id, product_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }

        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.usedProductListingsSearchQueries = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        // const user_id = req.user.user_id; // This will contain the uploaded images
        const query = req.query.query; // This will contain the uploaded images

        
        const result = await UsedProductListingModel.usedProductListingsSearchQueries(query)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }

        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.deleteUsedProductListing = async (req, res) => {



    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { product_id } = req.params;
        const result = await UsedProductListingModel.deleteUsedProductListing(user_id, product_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete used product");
        }

        return sendJsonResponse(res, 200, "Used product deleted successfully");

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);

    }


};



