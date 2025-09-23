const AWS = require('aws-sdk');
const { S3_BUCKET_NAME, S3_BUCKET_REGION, S3_BUCKET_ACCESS_KEY, S3_BUCKET_SECRET_KEY } = require('./config');

AWS.config.update({
  region: S3_BUCKET_REGION, 
  accessKeyId: S3_BUCKET_ACCESS_KEY,
  secretAccessKey: S3_BUCKET_SECRET_KEY 
});

const awsS3Bucket = new AWS.S3();

const enableVersioning = async (bucketName) => {
  const params = {
    Bucket: bucketName,
    VersioningConfiguration: {
      Status: 'Enabled' 
    }
  };
 
  try {
    await awsS3Bucket.putBucketVersioning(params).promise();
    console.log("AWS s3 connected.");
  } catch (error) {
    console.error("Error on conncting aws s3:", error);
  }
};

enableVersioning(S3_BUCKET_NAME);

module.exports = {awsS3Bucket}