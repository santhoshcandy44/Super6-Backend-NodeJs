const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { MEDIA_ROOT_PATH } = require('../config/config');

router.get('/:folder/*', (req, res, next) => {
    const { folder } = req.params;
    const filePath = path.join(MEDIA_ROOT_PATH, 'uploads', folder, req.params[0]); 
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') { 
                return res.status(404).send('File not found'); 
            }
            return next(err); 
        }
        res.sendFile(filePath, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
                'Content-Length': stats.size, 
                'Cache-Control': 'no-store', 
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        }, (err) => {
            if (err) {
                if (res.headersSent) {
                    return;
                }
                res.status(500).send('Server error');
            }
        });
        req.on('close', () => {
            res.end(); 
        });
    });
});

module.exports = router;