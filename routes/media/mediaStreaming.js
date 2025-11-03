const express = require('express');
const router = express.Router();
const { streamS3File } = require('../config/awsS3.js');

router.get('/:folder/services/*', async (req, res) => {
    const { folder } = req.params;
    const s3Key = `media/${folder}/services/${req.params[0]}`;
    await streamS3File(s3Key, res);
});

router.get('/:folder/used-product-listings/*', async (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/used-product-listings/${req.params[0]}`;
    await streamS3File(s3Key, res);
});

router.get('/:folder/local-jobs/*', async (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/local-jobs/${req.params[0]}`;
    await streamS3File(s3Key, res);
});

router.get('/:folder/careers/*', async (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/careers/${req.params[0]}`;
    await streamS3File(s3Key, res);
});

module.exports = router;