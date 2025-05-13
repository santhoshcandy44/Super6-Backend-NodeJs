// authUtils.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, FCM_TOKEN_SECRET, PROFILE_PIC_MEDIA_ENCRYPTION, APP_NAME, 
    OAUTH_GOOGLE_WEB_CLIENT_ID, OAUTH_GOOGLE_ANDROID_CLIENT_ID,
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASSWORD} = require('../config/config')


const { OAuth2Client } = require('google-auth-library');


// Initialize the OAuth2 client with your web client ID
const webClientId = OAUTH_GOOGLE_WEB_CLIENT_ID; // Replace with your Web Client ID
const androidClientId = OAUTH_GOOGLE_ANDROID_CLIENT_ID; // Replace with your Android Client ID



async function verifyIdToken(idToken) {
    const client = new OAuth2Client(webClientId);
    try {


        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: [webClientId, androidClientId], // Specify both CLIENT_IDs
        });
        const payload = ticket.getPayload();

        if (!payload) {
            throw new Error('Invalid token payload');
        }

        return payload;
    } catch (error) {
        console.log(error);
        throw new Error('Failed to verify ID Token');
    }
}




const generatePepper = async () => {
    const pepper = crypto.randomBytes(16).toString('hex'); // Generates a random 16-byte salt
    return pepper;
}
// Function to generate a salt
const generateSalt = async () => {
    const saltRounds = 10; // You can adjust this for more or less security
    return await bcrypt.genSalt(saltRounds);
};

// Function to hash the password with a given salt
const hashPassword = async (password, salt) => {
    return await bcrypt.hash(password, salt);
};

// Function to compare a plain password with a hashed password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

function generateForgotPasswordToken(userId, email) {
    return jwt.sign({ userId, email },
        ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' } // 15 minutes expiration
    );
}


function decodeForgotPasswordToken(token) {
    let decodedToken;

    try {
        decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET); // Decode the token
    } catch (error) {
        return sendErrorResponse(res, 401, 'Invalid or expired token');
    }
    return decodedToken;
}


// Method to generate access and refresh tokens
function generateTokens(userId, email, signUpMethod, lastSignInTimestamp, role = 'User') {
    const payload = {
        sub: userId,            // Subject (user's unique identifier)
        userId: userId,         // User's unique identifier (redundant with 'sub')
        email: email,           // User's email
        lastSignIn: lastSignInTimestamp, // Last sign-in timestamp from the database
        signUpMethod: signUpMethod, // Method used for signup (e.g., 'google', 'legacy_email')
        role: role              // User's role (e.g., 'user', 'admin')
    };

    const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '90d' });
    return { accessToken, refreshToken };
};




// Your FCM token secret (ensure it's stored securely)
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(FCM_TOKEN_SECRET.padEnd(32, '0').slice(0, 32)); // Ensure key length is 32 bytes
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'binary');
    encrypted += cipher.final('binary');

    // Return both iv and encrypted data as hex
    return iv.toString('hex') + ':' + Buffer.from(encrypted, 'binary').toString('hex')
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex'); // Extract the IV from the text
    const encryptedText = Buffer.from(parts.join(':'), 'hex'); // Combine the rest as encrypted text
    const key = Buffer.from(FCM_TOKEN_SECRET.padEnd(32, '0').slice(0, 32)); // Ensure key length is 32 bytes
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedText, 'binary', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted; // Return the decrypted text as a string
}



// Create a transporter using SMTP configuration
const transporter = nodemailer.createTransport({
    host: SMTP_HOST, // Specify your SMTP server
    port: 587, // Specify the SMTP port
    secure: false, // Enable SSL
    auth: {
        user: SMTP_USER, // SMTP username
        pass: SMTP_PASSWORD// SMTP password
    },
    tls: {
        ciphers: 'SSLv3' // Specify the cipher you want to use
    },
    debug: true
});

// Function to send OTP verification email
async function sendOtpEmail(email, otp) {


    const currentYear = new Date().getFullYear();  // Get the current year

    const mailOptions = {
        from: 'noreply-verification@lts360.com',
        to: email,
        subject: 'OTP Verification',
        html: `
        <html>
            <head>
                <style>
                    body {
                        font-family: 'Helvetica', 'Arial', sans-serif;
                        background-color: #f7f7f7;
                        margin: 0;
                        padding: 0;
                        color: #333;
                    }
                    .email-wrapper {
                        width: 100%;
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #007bff;
                        color: #ffffff;
                        text-align: center;
                        padding: 20px;
                        border-radius: 8px 8px 0 0;
                        font-size: 24px;
                        font-weight: 600;
                    }
                    .content {
                        padding: 30px;
                        text-align: center;
                        font-size: 14px;
                        color: #555;
                    }
                
                    .otp-code {
                        font-size: 32px;
                        font-weight: bold;
                        color: #ffffff;
                        background-color: #007bff;
                        padding: 15px 25px;
                        border-radius: 8px;
                        display: inline-block;
                        margin-top: 20px;
                    }
                    .footer {
                        text-align: center;
                        font-size: 12px;
                        color: #999;
                        padding: 20px 0;
                    }
                    .footer a {
                        color: #007bff;
                        text-decoration: none;
                    }
                </style>
            </head>
            <body>
                <div class="email-wrapper">
                    <div class="header">
                        OTP Verification
                    </div>
                    <div class="content">
                    <p><span style="font-size: 24px; font-weight: bold;">Hello from, </span> 
   <span style="font-size: 28px; font-weight: bold; color: #007bff;">${APP_NAME}</span>
</p>

                        <p>We received a request to verify your account. Please use the following OTP code to complete your verification:</p>
                        <div class="otp-code">${otp}</div>
                        <p>The OTP will expire in 15 minutes.</p>
                        <p>If you did not request this, please ignore this email.</p>
                    </div>
                    <div class="footer" style="padding:8px">
                        <p>For any issues, please contact us at <a href="mailto:support@lts360.com">support@lts360.com</a></p>
                        <p>&copy; ${currentYear} ${APP_NAME}. All Rights Reserved.</p>
                    </div>
                </div>
            </body>
        </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, message: 'OTP sent successfully', info };
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Failed to send OTP email', error };
    }
};



// Function to generate short encrypted token
function generateShortEncryptedUrl(path) {
    try {
        // Ensure the key length is 32 bytes (pad if needed and slice to exactly 32 bytes)
        const key = Buffer.from(PROFILE_PIC_MEDIA_ENCRYPTION.padEnd(32, '0').slice(0, 32));


        const timestamp = Date.now(); // Current timestamp
        const data = JSON.stringify({ path, timestamp });

        // Generate a random initialization vector (IV) for AES encryption (16 bytes for AES)
        const iv = crypto.randomBytes(16);

        // Create AES cipher using the secret key and IV in AES-256-CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);

        // Encrypt the data (converting to base64)
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Return the IV and encrypted data as a base64-encoded token (URL-safe)
        const token = `${iv.toString('base64')}:${encrypted}`;
        return `images?q=${encodeURIComponent(token)}`;
    } catch (error) {
        console.error('Error during encryption:', error);
        return null; // Return null if there is an error
    }
}


// Function to verify and decrypt the token
function verifyShortEncryptedUrl(token) {
    if (!token) {
        return null;  // No token provided, return null
    }

    // Split the token to get IV and encrypted data
    const [ivBase64, encryptedData] = token.split(':');
    if (!ivBase64 || !encryptedData) {
        return null;  // Invalid token format, return null
    }

    // Decode the IV and encrypted data from base64
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');

    try {
        // Ensure the key length is 32 bytes (pad if needed and slice to exactly 32 bytes)
        const key = Buffer.from(PROFILE_PIC_MEDIA_ENCRYPTION.padEnd(32, '0').slice(0, 32));

        // Create AES decipher using the secret key and IV
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);  // AES-256-CTR mode
        let decrypted = decipher.update(encryptedBuffer, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        // Parse the decrypted data into an object
        const extractedData = JSON.parse(decrypted);

        return extractedData;  // Return the extracted mediaId and filename
    } catch (error) {
        return null;  // Return null if any error occurs
    }
}



module.exports = {
    verifyIdToken,
    generateSalt,
    generatePepper,
    hashPassword,
    comparePassword,
    generateTokens,
    sendOtpEmail,
    generateForgotPasswordToken,
    decodeForgotPasswordToken,
    encrypt,
    decrypt,
    generateShortEncryptedUrl,
    verifyShortEncryptedUrl
};



