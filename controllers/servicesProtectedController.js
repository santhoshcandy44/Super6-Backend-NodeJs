const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const { MEDIA_BASE_URL } = require('../config/config');
const Service = require('../models/Service');
const Industries = require('../models/Industries');

exports.getServices = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { s, page_size, next_token } = req.query;
        const querySearch = !s ? '' : s;
        let industries = await Industries.getIndustries(user_id);
        industries = industries.filter((value) => 
            value.is_selected
        )
        if (!querySearch && (!industries || industries.length === 0)) {
            return sendErrorResponse(
                res,
                400,
                'Industries cannot be empty',
                null,
                'EMPTY_SERVICE_INDUSTRIES');
        }
        const queryNextToken = !next_token ? null : next_token;
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await Service.getServices(user_id, decodedQuery, PAGE_SIZE, queryNextToken);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Services retrieved successfully", result);
    } catch (error) {
        console.log(error)
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getGuestServices = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { user_id, s, latitude, longitude, industries, page_size, next_token} = req.query;
        const querySearch = !s ? '' : s;
        const queryNextToken = !next_token ? null : next_token;
        const queryIndustries = !industries ? [] : industries;
        if (!querySearch && (!queryIndustries || queryIndustries.length === 0)) {
            return sendErrorResponse(
                res,
                400,
                'Industries cannot be empty',
                null,
                'EMPTY_SERVICE_INDUSTRIES');
        }
        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));
        const PAGE_SIZE = page_size ? page_size : 20;
        const coordinates = latitude && longitude && latitude != null && longitude != null ? { latitude, longitude } : null;
        const result = await Service.getGuestServices(user_id, decodedQuery, coordinates, queryIndustries, PAGE_SIZE, queryNextToken);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Services retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getFeedUserPublishedServices = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const userId = req.user.user_id;
        const { user_id } = req.params;
        const { page_size, next_token } = req.query;
        const queryNextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await Service.getFeedUserPublishedServices(userId, user_id, PAGE_SIZE, queryNextToken)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getGuestFeedUserPublishedServices = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { user_id } = req.params;
        const { page_size, next_token } = req.query;
        const queryNextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await Service.getGuestFeedUserPublishedServices(user_id, PAGE_SIZE, queryNextToken)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.getPublishedServices = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { user_id: userId } = req.params;
        if (userId != user_id) return sendErrorResponse(res, 400, "Access forbidden to retrieve services");
        const {page_size, next_token} = req.query;
        const queryNextToken = next_token ? next_token : null;
        const PAGE_SIZE = page_size ? page_size : 20;
        const result = await Service.getUserPublishedServices(user_id, PAGE_SIZE, queryNextToken)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }
        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);
    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateServiceInfo = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array())
        }
        const user_id = req.user.user_id;
        const { title, short_description, long_description, industry } = req.body;
        const { service_id } = req.params;
        const result = await Service.updateServiceDetails(service_id, user_id, title, short_description, long_description, industry);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service info");
        }
        return sendJsonResponse(res, 200, "Service info updated successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateServicePlans = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { plans } = req.body;
        const { service_id } = req.params;
        if(plans.)
        const result = await Service.updateServicePlans(service_id, plans);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update plans");
        }
        return sendJsonResponse(res, 200, "Plans updated successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateServiceLocation = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const { longitude, latitude, geo, location_type } = req.body;
        const result = await Service.updateOrInsertLocation(service_id, longitude, latitude, geo, location_type);
        if (!result && !result.isUpdated && !result.isNewInsert) {
            return sendErrorResponse(res, 400, "Failed to update location");
        }
        return sendJsonResponse(res, 200, "Location updated successfully", {
            service_id: service_id,
            latitude: result.updatedRow.latitude,
            longitude: result.updatedRow.longitude,
            geo: result.updatedRow.geo,
            location_type: result.updatedRow.location_type
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.uploadServiceImage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const { image_id } = req.body;
        const file = req.file;
        if (!file) {
            return sendErrorResponse(res, 404, "No file found");
        }
        const result = await Service.uploadImage(user_id, service_id, file);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update service image");
        }
        return sendJsonResponse(res, 200, "Service image uploaded successfully", {
            image_id: result.id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL + "/" + result.image_url,
            width: result.width,
            height: result.height,
            size: result.size,
            format: result.format
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.updateServiceImage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const { image_id } = req.body;
        const file = req.file;
        if (!file) {
            return sendErrorResponse(res, 404, "No file found");
        }
        const result = await Service.updateImage(user_id, service_id, image_id, file);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update service image");
        }
        return sendJsonResponse(res, 200, "Service image updated successfully", {
            image_id: result.id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL + "/" + result.image_url,
            width: result.width,
            height: result.height,
            size: result.size,
            format: result.format
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.deleteServiceImage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const { image_id } = req.query;
        const result = await Service.deleteImage(service_id, image_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete service");
        }
        return sendJsonResponse(res, 200, "Service image deleted successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};


exports.updateServiceTumbnail = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const { image_id } = req.body;
        const file = req.file;
        if (!file) {
            return sendErrorResponse(res, 400, "No file found");
        }
        const result = await Service.updateThumbnail(user_id, service_id, image_id, file);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service image");
        }
        return sendJsonResponse(res, 200, "Service thumbnail updated successfully", {
            image_id: result.thumbnail_id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL + "/" + result.image_url,
            width: result.width,
            height: result.height,
            size: result.size,
            format: result.format
        });
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.createService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const { title, long_description, short_description, industry, plans, location, country, state } = req.body;
        const images = req.files['images[]'];
        const user_id = req.user.user_id;
        const thumbnail = req.files['thumbnail'][0];
        const result = await Service.createService(user_id, title, short_description, long_description, industry, country, state, thumbnail, plans, images, location);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish service");
        }
        return sendJsonResponse(res, 200, "Service created successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.bookmarkService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.body;
        const result = await Service.bookmarkService(user_id, service_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark service");
        }
        return sendJsonResponse(res, 200, "Service bookmarked successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.removeBookmarkService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.body;
        const result = await Service.removeBookmarkService(user_id, service_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }
        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.searchSuggestions = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const query = req.query.query;
        const result = await Service.searchQueries(query)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }
        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};

exports.deleteService = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return sendErrorResponse(res, 400, firstError.msg, errors.array());
        }
        const user_id = req.user.user_id;
        const { service_id } = req.params;
        const result = await Service.deleteService(user_id, service_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete service");
        }
        return sendJsonResponse(res, 200, "Service deleted successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
};