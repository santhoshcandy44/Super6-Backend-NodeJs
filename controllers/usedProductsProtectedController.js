const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const UsedProductListing = require('../models/UsedProdctListing');

exports.getUsedProductListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { s, page_size, next_token } = req.query;
        const querySearch = !s ? '' : s;
        const queryNextToken = !next_token ? null : next_token;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await UsedProductListing.getUsedProductListings(user_id, decodedQuery, PAGE_SIZE, queryNextToken);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Seconds retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getGuestUsedProductListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError, errors.array());
        }
        const { user_id, s, latitude, longitude, next_token, page_size } = req.query;
        const querySearch = !s ? '' : s;
        const queryNextToken = !next_token ? null : next_token;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = page_size ? page_size : 20;
        const coordinates = latitude && longitude && latitude != null && longitude != null ? { latitude, longitude } : null
        const result = await UsedProductListing.getGuestUsedProductListings(user_id, decodedQuery, coordinates, queryNextToken, PAGE_SIZE);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Seconds retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.getUserFeedPublishedUsedProductListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const { user_id } = req.params;
        const { after_id, page_size, last_timestamp } = req.query;
        const queryAfterId = after_id ? after_id : -1;
        const PAGE_SIZE = page_size ? page_size : 20;
        const queryLastTimestamp = last_timestamp ? last_timestamp : null;
        const result = await UsedProductListing.getPublishedUsedProductListings(user_id, queryAfterId, PAGE_SIZE, queryLastTimestamp)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve used product listings");
        }
        return sendJsonResponse(res, 200, "Published used product listings retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.getGuestFeedPublishedUsedProductListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const { user_id } = req.params;
        const { after_id, page_size, last_timestamp } = req.query;
        const queryAfterId = after_id ? after_id : -1;
        const PAGE_SIZE = page_size ? page_size : 20;
        const queryLastTimestamp = last_timestamp ? last_timestamp : null;
        const result = await UsedProductListing.getPublishedUsedProductListings(user_id, queryAfterId, PAGE_SIZE, queryLastTimestamp)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve used product listings");
        }
        return sendJsonResponse(res, 200, "Published used product listings retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.getPublishedUsedProductListings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const { user_id } = req.params;
        if (userId != user_id) return sendErrorResponse(res, 400, "Access forbidden to retrieve used product listings");
        const { page_size, next_token } = req.query;
        const queryNextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 20;
    
        const result = await UsedProductListing.getPublishedUsedProductListings(user_id, 1, queryNextToken)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve used product listings");
        }
        console.log(next_token);
        return sendJsonResponse(res, 200, "Published used product listings retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.createOrUpdateUsedProductListing = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0].msg;
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { product_id, name, description, price, price_unit, location, country, state, keep_image_ids } = req.body;  // keepImageIds comes from req.body
        const images = req.files['images[]'];
        const user_id = req.user.user_id;
        const keepImageIdsArray = keep_image_ids ? keep_image_ids.map(id => Number(id)) : [];
        const result = await UsedProductListing.createOrUpdateUsedProductListing(user_id, name, description, price, price_unit, country, state, images, location, keepImageIdsArray, product_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish used product listing");
        }
        return sendJsonResponse(res, 200, "used product listing updated successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.bookmarkUsedProductListing = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { product_id } = req.body;
        const result = await UsedProductListing.bookmarkUsedProductListing(user_id, product_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark used product listing");
        }
        return sendJsonResponse(res, 200, "Seconds bookmarked successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.removeBookmarkUsedProductListing = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { product_id } = req.body;
        const result = await UsedProductListing.removeBookmarkUsedProductListing(user_id, product_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }
        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.usedProductListingsSearchQueries = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const query = req.query.query;
        const result = await UsedProductListing.usedProductListingsSearchQueries(query)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }
        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }
};

exports.deleteUsedProductListing = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { product_id } = req.params;
        const result = await UsedProductListing.deleteUsedProductListing(user_id, product_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete used product listing");
        }
        return sendJsonResponse(res, 200, "Used product listing deleted successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};