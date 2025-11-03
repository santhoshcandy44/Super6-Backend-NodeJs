const express = require('express');
const router = express.Router();
const { sendJsonResponse } = require('./helpers/responseHelper.js');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { sendErrorResponse } = require('./helpers/responseHelper');


const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10, 
    message: 'Too many requests from this IP, please try again after a minute',
    headers: true,
});

router.use(limiter);
router.get('/', async (req, res) => {
    try {
        const ip =
            req.headers['cf-connecting-ip'] || r
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.socket?.remoteAddress ||
            '';
        const response = await fetch(`https://ipwho.is/${ip}`);
        const data = await response.json();
        if (data.success) {
            const result = {
                code: data.country_code,
                name: data.country
            };
            return sendJsonResponse(res, 200, "Country retrieved successfully", result);
        } else {
            return sendErrorResponse(res, 500, "Failed to get country info from IP");
        }
    } catch (error) {
        return sendErrorResponse(res, 500, "Internal Server Error", error.message);
    }
});

module.exports = router;