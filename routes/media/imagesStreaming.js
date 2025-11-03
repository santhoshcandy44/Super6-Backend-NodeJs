const express = require('express');
const router = express.Router();
const { verifyShortEncryptedUrl } = require('../utils/authUtils');
const { streamS3File } = require('../config/awsS3.js');

router.get('/', async (req, res) => {
    try {
        const { q: token } = req.query;
        if (!token) {
            return res.status(400).send('Bad Request: Missing token');
        }
        const extractedData = verifyShortEncryptedUrl(token);
        if (!extractedData) {
            return res.status(403).send('Forbidden: Invalid token');
        }
        const { path } = extractedData;
        const s3Key = path;
        await streamS3File(s3Key, res);
    } catch (error) {
        console.log(err);
        res.status(500).send('Error fetching file');
    }
});

module.exports = router;