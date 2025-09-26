const { 
  S3_BUCKET_NAME, 
  S3_BUCKET_REGION, 
  S3_BUCKET_ACCESS_KEY, 
  S3_BUCKET_SECRET_KEY 
} = require("./config");

const { S3Client, PutBucketVersioningCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, HeadObjectCommand, GetObjectCommand} = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: S3_BUCKET_REGION,
  credentials: {
    accessKeyId: S3_BUCKET_ACCESS_KEY,
    secretAccessKey: S3_BUCKET_SECRET_KEY,
  },
});

const enableVersioning = async (bucketName) => {
  const params = {
    Bucket: bucketName,
    VersioningConfiguration: {
      Status: "Enabled",
    },
  };

  try {
    const command = new PutBucketVersioningCommand(params);
    await s3Client.send(command);
    console.log("S3 bucket versioning enabled.");
  } catch (error) {
    console.error("Error enabling S3 versioning:", error);
  }
};

enableVersioning(S3_BUCKET_NAME);

function buildS3Url(key) {
  return `https://${S3_BUCKET_NAME}.s3.${S3_BUCKET_REGION}.amazonaws.com/${key}`;
}

async function uploadToS3(buffer, key, contentType) {
  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    return {
      Location:buildS3Url(key),
      Key: key
    };
  } catch (error) {
    throw new Error("Error uploading to S3: " + error.message);
  }
}

async function deleteFromS3(key) {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (error) {
    throw new Error("Error deleting from S3: " + error.message);
  }
}

async function deleteDirectoryFromS3(s3Key) {
    try {
        const listParams = {
            Bucket: S3_BUCKET_NAME,
            Prefix: s3Key
        };

        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
            const deleteParams = {
                Bucket: S3_BUCKET_NAME,
                Delete: {
                    Objects: listedObjects.Contents.map(obj => ({ Key: obj.Key }))
                }
            };

            await s3Client.send(new DeleteObjectsCommand(deleteParams));
        }
    } catch (error) {
        console.error("Error deleting S3 directory:", error.message);
    }
}

async function streamS3File(key, res) {
  try {
    const headResult = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
    );

    res.setHeader("Content-Type", headResult.ContentType || "application/octet-stream");
    if (headResult.ContentLength) {
      res.setHeader("Content-Length", headResult.ContentLength.toString());
    }
    if (headResult.CacheControl) {
      res.setHeader("Cache-Control", headResult.CacheControl);
    }

    const getObjectResponse = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    if (getObjectResponse.Body) {
      (getObjectResponse.Body).pipe(res);
    } else {
      res.status(404).send("File not found");
    }
  } catch (err) {
    console.error("S3 streaming error:", err);
    if (!res.headersSent) {
      res.status(500).send("Error fetching file");
    }
  }
}

module.exports = { s3Client, PutObjectCommand, buildS3Url, uploadToS3, deleteFromS3, deleteDirectoryFromS3, streamS3File};