const { validationResult } = require('express-validator');
const { sendJsonResponse, sendErrorResponse } = require('../helpers/responseHelper');
const ServiceModel = require('../models/ServiceModel '); // Assuming this is the user model
const { MEDIA_BASE_URL } = require('../config/config');
const Industries = require('../models/Industries');



exports.getServices = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { s, page, last_timestamp, last_total_relevance } = req.query;


        const industries = await Industries.getIndustries(user_id);

        if (!industries || industries.length === 0) {
            return sendErrorResponse(
                res,
                400,
                'Industries cannot be empty',
                null,
                'EMPTY_SERVICE_INDUSTRIES');
        }
        

        const querySearch = !s ? '' : s;
        const queryPage = !page ? 1 : page;

        const queryLastTimestamp = !last_timestamp ? null : last_timestamp;

        const queryLastTotalRelevance = !last_total_relevance ? null : last_total_relevance;


        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const result = await ServiceModel.getServicesForUser(user_id, decodedQuery, queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        console.log(result[0].plans);

        return sendJsonResponse(res, 200, "Services retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};



exports.guestGetServices = async (req, res) => {

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
        const queryIndustries = !industries ? [] :industries;

        if (!querySearch && (!queryIndustries || queryIndustries.length === 0)) {

            return sendErrorResponse(
                res,
                400,
                'Industries cannot be empty',
                null,
                'EMPTY_SERVICE_INDUSTRIES');
        }
        
       


        const decodedQuery = decodeURIComponent(querySearch.replace(/\+/g, ' '));

        const PAGE_SIZE = 30;

        const coordinates = latitude && longitude && latitude!=null && longitude!=null ? {latitude, longitude} : null


        const result = await ServiceModel.getServicesForGuestUser(user_id, decodedQuery, 
            queryPage, PAGE_SIZE, queryLastTimestamp, queryLastTotalRelevance, coordinates, queryIndustries);
 
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Services retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};


exports.getBookmarkedServices = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }
        const user_id = req.user.user_id; // This will contain the uploaded images

        const result = await ServiceModel.getUserBookmarkedServices(user_id)
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }

        return sendJsonResponse(res, 200, "Bookmarked servcies retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }

};


exports.getUserPublishedServicesFeedGuest = async (req, res) => {

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

exports.getPublishedServicesFeedUser = async (req, res) => {

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

exports.getPublishedServices = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; 

        const result = await ServiceModel.getUserPublishedServices(user_id)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to retrieve services");
        }



        return sendJsonResponse(res, 200, "Published services retrieved successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }

};

exports.updateServiceInfo = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const user_id = req.user.user_id; 

        // Process the request if validation passes
        const { title, short_description, long_description, industry } = req.body;
        const { service_id } = req.params;



        const result = await ServiceModel.updateServiceDetails(service_id, user_id, title, short_description, long_description, industry);

        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service info");
        }

        return sendJsonResponse(res, 200, "Service info updated successfully", result);

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }


};

exports.updateServicePlans = async (req, res) => {



    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0].msg; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const user_id = req.user.user_id; 

        const { plans } = req.body;
        const { service_id } = req.params;


        const result = await ServiceModel.updateServicePlans(service_id, plans);


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to update plans");

        }

        return sendJsonResponse(res, 200, "Plans updated successfully", result);


    } catch (error) {


        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.updateServiceLocation = async (req, res) => {

    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const { longitude, latitude, geo, location_type } = req.body;

        const result = await ServiceModel.updateOrInsertLocation(service_id, longitude, latitude, geo, location_type);



        if (!result && !result.isUpdated && !result.isNewInsert) {
            return sendErrorResponse(res, 400, "Failed to update location");
        }


        return sendJsonResponse(res, 200, "Location updated successfully", {
            service_id: service_id,
            latitude: result.updatedRow.latitude,
            longitude: result.updatedRow.longitude,
            geo: result.updatedRow.geo,
            location_type: result.updatedRow.location_type,

        });
    } catch (error) {

        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }

};

exports.deleteServiceImage = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const { image_id } = req.query;

        const result = await ServiceModel.deleteServiceImage(service_id, image_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete service");
        }

        return sendJsonResponse(res, 200, "Service image deleted successfully");

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);

    }


};

exports.uploadServiceImage = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());


        }

        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const { image_id } = req.body;

        const file = req.file;

        if (!file) {
            return sendErrorResponse(res, 500, "No file found");

        }

        const result = await ServiceModel.createImage(user_id, service_id, file);



        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service image");
        }


  

        return sendJsonResponse(res, 200, "Service image uploaded successfully", {
            image_id: result.id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL +"/"+ result.image_url,
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

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const { image_id } = req.body;

        const file = req.file;

        if (!file) {
            return sendErrorResponse(res, 500, "No file found");

        }

        const result = await ServiceModel.updateImage(user_id, service_id, image_id, file);


        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service image");
        }


        return sendJsonResponse(res, 200, "Service image updated successfully", {
            image_id: result.id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL +"/"+ result.image_url,
            width: result.width,
            height: result.height,
            size: result.size,
            format: result.format
        });

    } catch (error) {

        return sendErrorResponse(res, 500, "Internal Server Error", error.message);

    }


};

exports.updateServiceTumbnail = async (req, res) => {

    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());


        }

        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const { image_id } = req.body;




        const file = req.file;

        if (!file) {
            return sendErrorResponse(res, 500, "No file found");

        }

        const result = await ServiceModel.updateThumbnail(user_id, service_id, image_id, file);




        if (!result) {
            return sendErrorResponse(res, 500, "Failed to update service image");
        }


        return sendJsonResponse(res, 200, "Service thumbnail updated successfully", {
            image_id: result.thumbnail_id,
            service_id: result.service_id,
            image_url: MEDIA_BASE_URL +"/"+ result.image_url,
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

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());
        }


        // Read values from req.body
        const { title, long_description, short_description, industry, plans, location, country, state} = req.body;
        // Access uploaded images
        const images = req.files['images[]']; // This will contain the uploaded images
        const user_id = req.user.user_id; // This will contain the uploaded images
        const thumbnail = req.files['thumbnail'][0]; // For single file upload (thumbnail)

        const result = await ServiceModel.createService(user_id, title, short_description, long_description, industry, country, state, thumbnail, plans, images, location);

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to publish service");
        }

        return sendJsonResponse(res, 200, "Service created successfully");

    } catch (error) {
        console.log(error);
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());
    }


};

exports.bookmarkService = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id;
        const { service_id } = req.body;
        const result = await ServiceModel.createBookmarkService(user_id, service_id);


        if (!result) {
            return sendErrorResponse(res, 400, "Failed to bookmark service");
        }

        return sendJsonResponse(res, 200, "Service bookmarked successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.removeBookmarkService = async (req, res) => {



    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error

            return sendErrorResponse(res, 400, firstError, errors.array());

        }

        const user_id = req.user.user_id;
        const { service_id } = req.body;
        const result = await ServiceModel.removeBookmarkService(user_id, service_id);
        if (!result) {
            return sendErrorResponse(res, 400, "Failed to remove bookmark");
        }

        return sendJsonResponse(res, 200, "Bookmark removed successfully");
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.searchSuggestions = async (req, res) => {


    try {

        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());
        }

        // const user_id = req.user.user_id; // This will contain the uploaded images
        const query = req.query.query; // This will contain the uploaded images

        
        const result = await ServiceModel.searchQueries(query)

        if (!result) {
            return sendErrorResponse(res, 400, "Failed to get suggestions");
        }

        return sendJsonResponse(res, 200, "Suggestions retrieved successfully", result);
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.toString());

    }


};

exports.deleteService = async (req, res) => {



    try {
        // Validate the request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0]; // Get the first error
            return sendErrorResponse(res, 400, firstError, errors.array());

        }
        const user_id = req.user.user_id; // This will contain the uploaded images
        const { service_id } = req.params;
        const result = await ServiceModel.deleteService(user_id, service_id);
        if (!result) {
            return sendErrorResponse(res, 500, "Failed to delete service");
        }

        return sendJsonResponse(res, 200, "Service deleted successfully");

    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);

    }


};



