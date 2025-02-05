const AWS = require('aws-sdk');
const { S3_BUCKET_NAME } = require('./config');

// Set the region and credentials if not using AWS CLI
AWS.config.update({
  region: 'ap-south-1', // Your region
  accessKeyId: 'AKIAXTORPPCDJ6YIHU6J', // Optional if set via environment variables
  secretAccessKey: 'bNY/7tbRsDA+rciUzV1r2sMqmUl8Tt5WROYE/Ga+' // Optional if set via environment variables
});

const awsS3Bucket = new AWS.S3();

// Enable versioning on the bucket
const enableVersioning = async (bucketName) => {
  const params = {
    Bucket: bucketName,
    VersioningConfiguration: {
      Status: 'Enabled' // Enable versioning
    }
  };

  try {
    const data = await awsS3Bucket.putBucketVersioning(params).promise();
    console.log("Versioning enabled:", data);
  } catch (error) {
    console.error("Error enabling versioning:", error);
  }
};

// Call the function with your bucket name
enableVersioning(S3_BUCKET_NAME); // Replace with your actual bucket name


module.exports = {awsS3Bucket}