// Destination: src/lib/feedback/storage.ts
// TIER 2 (screenshots) only — delete if you skip screenshot support.
// Generic S3-compatible presign helpers (AWS S3, Cloudflare R2, Railway
// Storage Buckets, MinIO...).
//
// ADAPT: if the project already has an S3 client/presign module, delete this
// file and re-point the imports in the two API routes at it instead.
//
// Dependencies: pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ADAPT: env var names to match your deployment.
const BUCKET_NAME = process.env.S3_BUCKET ?? "";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT, // leave unset for real AWS S3
  forcePathStyle: true, // required by R2 / MinIO / most S3-compatibles; harmless elsewhere
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

export async function getUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getObjectBytes(key: string): Promise<{
  bytes: Uint8Array;
  contentType?: string;
}> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  if (!resp.Body) {
    throw new Error(`Empty body for object ${key}`);
  }
  const bytes = await resp.Body.transformToByteArray();
  return { bytes, contentType: resp.ContentType };
}
