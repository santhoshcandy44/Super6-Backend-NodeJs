const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const profileProtectedAppRoutes = require('./routes/profileProtectedAppRoutes');
const protectedAppRoutes = require('./routes/appProtectedRoutes');
const serviceProtectedAppRoutes = require('./routes/serviceProtectedAppRoutes');
const usedProtectProtectedAppRoutes = require('./routes/usedProductsProtectedAppRoutes');
const localJobProtectedAppRoutes = require('./routes/localJobsProtectedAppRoutes.js');
const jobProtectedAppRoutes = require('./routes/jobProtectedAppRoutes');

const accountSettingsProtectedRoutes = require('./routes/accountSettingsProtectedAppRoutes');
const industriesSettingsProtectedRoutes = require('./routes/industriesSettingsProtectedAppRoutes');
const boardsSettingsProtectedRoutes = require('./routes/boardsSettingsProtectedAppRoutes');
const chatProtectedAppRoutes = require('./routes/chatProtectedAppRoutes');

const { MEDIA_ROOT_PATH, S3_BUCKET_NAME } = require('./config/config');

const { verifyShortEncryptedUrl } = require('./utils/authUtils')
const { awsS3Bucket } = require('./config/awsS3.js')

const { sendJsonResponse } = require('./helpers/responseHelper.js');

const app = express();
const port = 3000;

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const allowedOrigins = [
    'https://api.lts360.com',
    'https://ucontent.lts360.com',
    'http://localhost:3000',
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10, 
    message: 'Too many requests from this IP, please try again after a minute',
    headers: true,
});
app.use('/api/auth-app/ip-country', limiter);
app.get('/api/auth-app/ip-country', async (req, res) => {
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

app.use('/api/auth', authRoutes);
app.use('/api/app/serve/services', serviceProtectedAppRoutes); 
app.use('/api/app/serve/used-product-listings', usedProtectProtectedAppRoutes); 
app.use('/api/app/serve/local-jobs', localJobProtectedAppRoutes); 
app.use('/api/app/serve/jobs', jobProtectedAppRoutes); 
app.use('/api/serve/profile', profileProtectedAppRoutes);
app.use('/api/app/serve', protectedAppRoutes);
app.use('/api/app/serve/account-settings', accountSettingsProtectedRoutes); 
app.use('/api/app/serve/industries-settings', industriesSettingsProtectedRoutes);
app.use('/api/app/serve/boards-settings', boardsSettingsProtectedRoutes);
app.use('/api/app/serve/chat', chatProtectedAppRoutes); 

app.get('/media/:folder/services/*', (req, res) => {
    const { folder } = req.params;
    const s3Key = `media/${folder}/services/${req.params[0]}`;
    const s3Params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
    };

    awsS3Bucket.headObject(s3Params, (err, metadata) => {
        if (err) {
            return res.status(500).send('Error fetching file');
        }
        const contentType = metadata.ContentType;
        const contentLength = metadata.ContentLength;
        res.setHeader('Content-Type', contentType); 
        res.setHeader('Content-Length', contentLength); 
        const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();
        s3Stream.pipe(res);
        s3Stream.on('error', (streamError) => {
            if (res.headersSent) {
                return; 
            }
            res.status(500).send('Error fetching file');
        });
    });
});

app.get('/media/:folder/used-product-listings/*', (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/used-product-listings/${req.params[0]}`;
    const s3Params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
    };
    awsS3Bucket.headObject(s3Params, (err, metadata) => {
        if (err) {
            return res.status(500).send('Error fetching file');
        }
        const contentType = metadata.ContentType;
        const contentLength = metadata.ContentLength;
        res.setHeader('Content-Type', contentType); 
        res.setHeader('Content-Length', contentLength);
        const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();
        s3Stream.pipe(res);
        s3Stream.on('error', (streamError) => {
            if (res.headersSent) {
                return;
            }
            res.status(500).send('Error fetching file');
        });
    });
});

app.get('/media/:folder/local-jobs/*', (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/local-jobs/${req.params[0]}`;
    const s3Params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
    };
    awsS3Bucket.headObject(s3Params, (err, metadata) => {
        if (err) {
            return res.status(500).send('Error fetching file');
        }
        const contentType = metadata.ContentType;
        const contentLength = metadata.ContentLength;
        res.setHeader('Content-Type', contentType); 
        res.setHeader('Content-Length', contentLength);
        const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();
        s3Stream.pipe(res);
        s3Stream.on('error', (streamError) => {
            if (res.headersSent) {
                return;
            }
            res.status(500).send('Error fetching file');
        });
    });
});

app.get('/uploads/:folder/*', (req, res, next) => {
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

app.get('/media/:folder/careers/*', (req, res) => {
    const { folder } = req.params; 
    const s3Key = `media/${folder}/careers/${req.params[0]}`;
    const s3Params = {
        Bucket: S3_BUCKET_NAME, 
        Key: s3Key,
    };
    awsS3Bucket.headObject(s3Params, (err, metadata) => {
        if (err) {
            return res.status(500).send('Error fetching file');
        }
        const contentType = metadata.ContentType;
        const contentLength = metadata.ContentLength;
        res.setHeader('Content-Type', contentType); 
        res.setHeader('Content-Length', contentLength);
        const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();
        s3Stream.pipe(res);
        s3Stream.on('error', (streamError) => {
            if (res.headersSent) {
                return;
            }
            res.status(500).send('Error fetching file');
        });
    });
});

app.get('/images', async (req, res) => {
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
        const s3Params = {
            Bucket: S3_BUCKET_NAME,
            Key: s3Key,
        };
        awsS3Bucket.headObject(s3Params, (err, metadata) => {
            if (err) {
                return res.status(500).send('Error fetching file');
            }
            const contentType = metadata.ContentType;
            const contentLength = metadata.ContentLength;
            res.setHeader('Content-Type', contentType); 
            res.setHeader('Content-Length', contentLength);
            const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();
            s3Stream.pipe(res);
            s3Stream.on('error', (streamError) => {
                if (res.headersSent) {
                    return;
                }
                res.status(500).send('Error fetching file');
            });
        });

    } catch (error) {
        console.log(err);
        res.status(500).send('Error fetching file');
    }
});

app.get('/', (req, res) => {
    res.send('Lts360 API Gateway');
});

app.listen(port, async () => {
    console.log(`Server is running on http://localhost:${port}`);
});