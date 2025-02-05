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


// app.use('/media/:folder/services', express.static(path.join(__dirname, 'media')));

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

            res.status(500).send('Error fetching file');
        });
    });


});



// app.get('/media/:folderName/*', (req, res, next) => {

//     const { folderName } = req.params; // Get the folder name dynamically
//     const filePath = path.join(MEDIA_ROOT_PATH, 'media', folderName, req.params[0]); // Get the file path


//     // Check if the file exists and get file stats (like size)
//     fs.stat(filePath, (err, stats) => {
//         if (err) {
//             if (err.code === 'ENOENT') { // 'ENOENT' error code means "file not found"
//                 return res.status(404).send('File not found'); // Return 404 if file doesn't exist
//             }
//             return next(err);  // Pass other errors (e.g., permission errors) to the error handler
//         }

//         // Use sendFile to send the file with appropriate headers automatically
//         res.sendFile(filePath, {
//             headers: {
//                 'Content-Type': 'application/octet-stream', // Set MIME type for binary files
//                 'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`, // Force download with the correct filename
//                 'Content-Length': stats.size, // Send the content length header
//                 'Cache-Control': 'no-store', // Prevent caching of the file
//                 'Pragma': 'no-cache',
//                 'Expires': '0'
//             }
//         }, (err) => {
//             if (err) {
//                 console.error('Error sending the file: ' + err);
//                 // Don't send a response if the connection is already closed
//                 if (res.headersSent) {
//                     return; // Headers already sent, so don't send anything further
//                 }
//                 res.status(500).send('Server error');
//             } else {

//             }
//         });

//         // Handle the case where the client cancels the request (or connection is closed)
//         req.on('close', () => {
//             // If the client cancels or closes the connection, we should stop streaming the file
//             res.end(); // End the response to clean up
//         });
//     });
// });



app.get('/uploads/:folder/*', (req, res, next) => {

    try {
        const { folder } = req.params; // Get the folder name dynamically

        const s3Key = `uploads/${folder}/${req.params[0]}`;


        
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
                res.status(500).send('Error fetching file');
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
