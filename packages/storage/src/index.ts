import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  forcePathStyle?: boolean;
};

export type UploadObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
};

export type ObjectStorage = {
  upload(input: UploadObjectInput): Promise<{ objectKey: string; publicUrl: string }>;
  delete(key: string): Promise<void>;
};

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'us-east-1',
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');

  return {
    async upload(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
        }),
      );

      return {
        objectKey: input.key,
        publicUrl: `${publicBaseUrl}/${encodeObjectKey(input.key)}`,
      };
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
    },
  };
}

function encodeObjectKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}
