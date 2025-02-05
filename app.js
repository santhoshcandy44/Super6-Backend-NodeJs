const express = require('express');
const app = express();
const port = 3000;
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/authRoutes');
const profileProtectedAppRoutes = require('./routes/profileProtectedAppRoutes');
const protectedAppRoutes = require('./routes/appProtectedRoutes');
const serviceProtectedAppRoutes = require('./routes/serviceProtectedAppRoutes');
const accountSettingsProtectedRoutes = require('./routes/accountSettingsProtectedAppRoutes');
const IndustriesSettingsProtectedRoutes = require('./routes/industriesSettingsProtectedAppRoutes');
const chatProtectedAppRoutes = require('./routes/chatProtectedAppRoutes');
const { MEDIA_ROOT_PATH, S3_BUCKET_NAME } = require('./config/config');
const { verifyShortEncryptedUrl } = require('./utils/authUtils')

const axios = require('axios');
const authenticateToken = require('./middlewares/authMiddleware'); // Import the auth middleware



// Set up session middleware
app.use(session({
    secret: 'your-secret-key', // Change this to a strong secret
    resave: false, // Do not save session if unmodified
    saveUninitialized: true, // Save new sessions

    cookie: {
        secure: process.env.NODE_ENV === 'production', // Set to true for HTTPS
        httpOnly: true,        // Prevent access to cookies via JavaScript (good security practice)
        // maxAge: 24 * 60 * 60 * 1000  // Remove maxAge to make the session persistent
    }

}));


app.use(express.urlencoded({ extended: true }));
// Middleware for parsing JSON
app.use(express.json());

// Use the routes
app.use('/api/auth', authRoutes); // Add authentication routes
app.use('/api/app/serve/services', serviceProtectedAppRoutes); // All protected routes prefixed with /api/protected
app.use('/api/serve/profile', profileProtectedAppRoutes); // All protected routes prefixed with /api/protected
// Use the routes
app.use('/api/app/serve', protectedAppRoutes); // All protected routes prefixed with /api/protected
app.use('/api/app/serve/account-settings', accountSettingsProtectedRoutes); // All protected routes prefixed with /api/protected
app.use('/api/app/serve/industries-settings', IndustriesSettingsProtectedRoutes); // All protected routes prefixed with /api/protected
app.use('/api/app/serve/chat', chatProtectedAppRoutes); // All protected routes prefixed with /api/protected

const { awsS3Bucket } = require('./config/awsS3.js')

const ogs = require('open-graph-scraper');

app.get('/open-graph-scraper', async (req, res) => {

    const options = { url: 'https://google.com' };
    try {
        const data = await ogs(options)

        const { error, html, result, response } = data;
        res.json(result);

    } catch (error) {
        res.json({ error: true, data: null, errorDetails: error });
    }


});





//Handling dynamic file request for a folder
app.get('/media/:folder/services/*', (req, res) => {
    const { folder } = req.params; // Capture the folder parameter

    const s3Key = `media/${folder}/services/${req.params[0]}`;


    // Get the file from S3
    const s3Params = {
        Bucket: S3_BUCKET_NAME, // Your S3 bucket name
        Key: s3Key,
    };


    // Get the metadata of the object (including Content-Type and Content-Length)
    awsS3Bucket.headObject(s3Params, (err, metadata) => {
        if (err) {

            return res.status(500).send('Error fetching file');
        }

        // Extract Content-Type and Content-Length from metadata
        const contentType = metadata.ContentType;
        const contentLength = metadata.ContentLength;


        // Set the correct headers before streaming the file
        res.setHeader('Content-Type', contentType); // Set the content type
        res.setHeader('Content-Length', contentLength); // Set the content length

        // Create a stream and pipe the S3 file directly to the response
        const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();

        // Pipe the S3 file stream directly to the response
        s3Stream.pipe(res);

        // Handle any errors in the stream
        s3Stream.on('error', (streamError) => {
            if (res.headersSent) {
                return; // Headers already sent, so don't send anything further
            }
            res.status(500).send('Error fetching file');
        });
    });


});


app.get('/uploads/:folder/*', authenticateToken, (req, res, next) => {
    try {
        const { folder } = req.params; // Get the folder name dynamically

        const paths = path.join('uploads', folder, req.params[0]);
        const filePath = path.join(MEDIA_ROOT_PATH, paths); // Get the file path
        
        // Check if the file exists and get file stats (like size)
        fs.stat(filePath, (err, stats) => {
            if (err) {
                if (err.code === 'ENOENT') { // 'ENOENT' error code means "file not found"
                    return res.status(404).send('File not found'); // Return 404 if file doesn't exist
                }
                return next(err);  // Pass other errors (e.g., permission errors) to the error handler
            }


            // Stream the file to the user
            const readStream = fs.createReadStream(filePath);

            // Use pipe to send the file data to the response
            readStream.pipe(res);

            // Set appropriate headers
            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
                'Content-Length': stats.size,
                'Cache-Control': 'no-store',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            // When the file stream finishes, delete the file
            readStream.on('end', () => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting the file: ' + err);
                    } 
                });
            });

            // Handle any errors during streaming
            readStream.on('error', (err) => {
                if (res.headersSent) {
                    return; // Headers already sent, so don't send anything further
                }
                res.status(500).send('Server error');
            });

            // Handle the case where the client cancels the request
            req.on('close', () => {
                readStream.destroy(); // Stop reading the file if the client cancels the download
                res.end(); // End the response
            });

        });
    } catch (error) {
        res.status(500).send('Error fetching file');
    }
});



app.get('/images', async (req, res) => {



    try {

        const { q: token } = req.query;

        if (!token) {
            return res.status(400).send('Bad Request: Missing token');
        }

        // Verify and extract the mediaId and filename from the token
        const extractedData = verifyShortEncryptedUrl(token);


        if (!extractedData) {
            return res.status(403).send('Forbidden: Invalid token');
        }

        const { mediaId, filename } = extractedData;



        // Construct the S3 URL
        const s3Key = `media/${mediaId}/profile-pic/${filename}`;


        // Get the file from S3
        const s3Params = {
            Bucket: S3_BUCKET_NAME, // Your S3 bucket name
            Key: s3Key,
        };

        // Get the metadata of the object (including Content-Type and Content-Length)
        awsS3Bucket.headObject(s3Params, (err, metadata) => {
            if (err) {
                return res.status(500).send('Error fetching file');
            }

            // Extract Content-Type and Content-Length from metadata
            const contentType = metadata.ContentType;
            const contentLength = metadata.ContentLength;


            // Set the correct headers before streaming the file
            res.setHeader('Content-Type', contentType); // Set the content type
            res.setHeader('Content-Length', contentLength); // Set the content length

            // Create a stream and pipe the S3 file directly to the response
            const s3Stream = awsS3Bucket.getObject(s3Params).createReadStream();

            // Pipe the S3 file stream directly to the response
            s3Stream.pipe(res);

            // Handle any errors in the stream
            s3Stream.on('error', (streamError) => {
                if (res.headersSent) {
                    return; // Headers already sent, so don't send anything further
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
    res.send('Super6!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
