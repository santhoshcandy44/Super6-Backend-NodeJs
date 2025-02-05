require('dotenv').config(); // Load environment variables from .env file

module.exports = {
    BASE_URL:process.env.BASE_URL,
    FCM_TOKEN_SECRET:process.env.FCM_TOKEN_SECRET,
    PROFILE_PIC_MEDIA_ENCRYPTION:process.env.PROFILE_PIC_MEDIA_ENCRYPTION,
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
    DB_CONNECTION: process.env.DB_CONNECTION, // Add other configurations as needed
    MEDIA_ROOT_PATH: process.env.MEDIA_ROOT_PATH,
    PROFILE_BASE_URL: process.env.PROFILE_BASE_URL,
    MEDIA_BASE_URL: process.env.MEDIA_BASE_URL,
    S3_BUCKET_NAME:process.env.S3_BUCKET_NAME,
    APP_NAME:process.env.APP_NAME

};
