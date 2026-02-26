const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { URL } = require("url");
const { buildPublicFileUrl } = require("./publicFileUrl");

const deleteS3ObjectFromUrl = async (fileUrl) => {
  const awsRegion = process.env.AWS_REGION;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;

  if (!awsRegion || !bucketName || !endpoint) {
    console.error(
      "R2 Delete Error: Missing required environment variables (AWS_REGION, R2_BUCKET_NAME, R2_ENDPOINT)"
    );
    return;
  }

  if (!fileUrl || typeof fileUrl !== "string") {
    console.warn("R2 Delete Warning: Invalid or missing URL provided.");
    return;
  }

  try {
    const normalizedFileUrl = buildPublicFileUrl(fileUrl);
    const parsed = new URL(normalizedFileUrl);
    const key = parsed.pathname
      .replace(`/${bucketName}/`, "")
      .replace(/^\//, "");

    if (!key) {
      console.warn(
        `R2 Delete Warning: Could not parse object key from URL: ${fileUrl}`
      );
      return;
    }

    const s3Client = new S3Client({
      region: awsRegion,
      endpoint: endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const deleteParams = {
      Bucket: bucketName,
      Key: key,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);
    console.log(`✅ Deleted ${key} from R2 bucket ${bucketName}`);
  } catch (err) {
    console.error(`❌ Error deleting object from R2 (URL: ${fileUrl}):`, err);
  }
};

module.exports = { deleteS3ObjectFromUrl };
