const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');

const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, FCM_TOKEN_SECRET, PROFILE_PIC_MEDIA_ENCRYPTION, APP_NAME,
    OAUTH_GOOGLE_WEB_CLIENT_ID, OAUTH_GOOGLE_ANDROID_CLIENT_ID,
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASSWORD } = require('../config/config')

const webClientId = OAUTH_GOOGLE_WEB_CLIENT_ID;
const androidClientId = OAUTH_GOOGLE_ANDROID_CLIENT_ID;

async function verifyIdToken(idToken) {
    try {
        const client = new OAuth2Client(webClientId);
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: [webClientId, androidClientId],
        });
        const payload = ticket.getPayload();
        if (!payload) {
            throw new Error('Invalid token payload');
        }
        return payload;
    } catch (error) {
        throw new Error('Failed to verify ID Token');
    }
}

const generatePepper = async () => {
    const pepper = crypto.randomBytes(16).toString('hex');
    return pepper;
}

const generateSalt = async () => {
    const saltRounds = 10;
    return await bcrypt.genSalt(saltRounds);
};

const hashPassword = async (password, salt) => {
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

function generateForgotPasswordToken(userId, email) {
    return jwt.sign({ userId, email },
        ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
    );
}

function decodeForgotPasswordToken(token) {
    let decodedToken;
    try {
        decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET); 
    } catch (error) {
        return sendErrorResponse(res, 401, 'Invalid or expired token');
    }
    return decodedToken;
}

function generateTokens(userId, email, signUpMethod, lastSignInTimestamp, role = 'User') {
    const payload = {
        sub: userId,           
        userId: userId,        
        email: email,         
        lastSignIn: lastSignInTimestamp,
        signUpMethod: signUpMethod, 
        role: role        
    };
    const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '90d' });
    return { accessToken, refreshToken };
};

const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(FCM_TOKEN_SECRET.padEnd(32, '0').slice(0, 32)); 
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'binary');
    encrypted += cipher.final('binary');
    return iv.toString('hex') + ':' + Buffer.from(encrypted, 'binary').toString('hex')
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex'); 
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const key = Buffer.from(FCM_TOKEN_SECRET.padEnd(32, '0').slice(0, 32));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'binary', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted; 
}

const transporter = nodemailer.createTransport({
    host: SMTP_HOST, 
    port: 587,
    secure: true, 
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
    },
    tls: {
        ciphers: 'SSLv3'
    },
    debug: false
});

async function sendOtpEmail(email, otp) {
    const currentYear = new Date().getFullYear(); 
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
        return { success: false, message: 'Failed to send OTP email', error };
    }
};

function generateShortEncryptedUrl(path) {
    try {
        const key = Buffer.from(PROFILE_PIC_MEDIA_ENCRYPTION.padEnd(32, '0').slice(0, 32));
        const timestamp = Date.now(); 
        const data = JSON.stringify({ path, timestamp });

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const token = `${iv.toString('base64')}:${encrypted}`;
        return `images?q=${encodeURIComponent(token)}`;
    } catch (error) {
        return null; 
    }
}

function verifyShortEncryptedUrl(token) {
    if (!token) {
        return null;  
    }
    const [ivBase64, encryptedData] = token.split(':');
    if (!ivBase64 || !encryptedData) {
        return null; 
    }
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');

    try {
        const key = Buffer.from(PROFILE_PIC_MEDIA_ENCRYPTION.padEnd(32, '0').slice(0, 32));
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv); 
        let decrypted = decipher.update(encryptedBuffer, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        const extractedData = JSON.parse(decrypted);
        return extractedData; 
    } catch (error) {
        return null;  
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



