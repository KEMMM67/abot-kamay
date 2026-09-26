// apps/api/src/media/storage/s3-media-storage.ts
//
// MediaStorage on Amazon S3 or any S3-compatible store (Cloudflare R2, MinIO via MEDIA_S3_ENDPOINT).
// Credentials come from the standard AWS chain: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on Render
// or Railway (for R2, the R2 API token's key pair), a task role on ECS, a profile locally.
//
// requestChecksumCalculation: 'WHEN_REQUIRED' stops the SDK from adding its own CRC32 checksum of an
// empty body to presigned URLs, which would make every browser upload fail. The SHA-256 the client
// declared is signed as a header instead, and storage verifies the uploaded bytes against it (R2 has
// verified sha256 checksums on PutObject since June 2023). responseChecksumValidation: 'WHEN_REQUIRED'
// keeps downloads working on stores that report checksums differently; the media worker verifies the
// SHA-256 of every file it reads itself.
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { MediaBucket, UploadBucket } from '../media-policy.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  type PresignedUpload,
  type StoredObject,
} from './media-storage.js';

/** Fails a stream once more than maxBytes have passed through it. */
function byteLimit(maxBytes: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (seen > maxBytes) callback(new Error(`Object is larger than the ${maxBytes}-byte limit`));
      else callback(null, chunk);
    },
  });
}

export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly client: S3Client,
    private readonly buckets: Readonly<Partial<Record<MediaBucket, string>>>,
  ) {}

  private bucketName(bucket: MediaBucket): string {
    const name = this.buckets[bucket];
    if (!name) throw new Error(`The ${bucket} media bucket is not configured`);
    return name;
  }

  async presignUpload(input: {
    bucket: UploadBucket;
    key: string;
    contentType: string;
    byteSize: number;
    sha256Base64: string;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    // Encryption at rest comes from each bucket's default (SSE-KMS on an S3 restricted bucket; R2
    // encrypts every object), so the browser never has to send encryption headers.
    const command = new PutObjectCommand({
      Bucket: this.bucketName(input.bucket),
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.byteSize,
      ChecksumSHA256: input.sha256Base64,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
      unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
    });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'x-amz-checksum-sha256': input.sha256Base64 },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  presignDownload(input: { bucket: UploadBucket; key: string; expiresInSeconds: number }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName(input.bucket), Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async head(input: { bucket: MediaBucket; key: string }): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName(input.bucket),
          Key: input.key,
          ChecksumMode: 'ENABLED',
        }),
      );
      return { byteSize: result.ContentLength ?? 0, sha256Base64: result.ChecksumSHA256 ?? null };
    } catch (error) {
      if (error instanceof NotFound) return null;
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async downloadToFile(input: {
    bucket: MediaBucket;
    key: string;
    filePath: string;
    maxBytes: number;
  }): Promise<void> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName(input.bucket), Key: input.key }),
    );
    if (!(result.Body instanceof Readable)) throw new Error(`No readable body for ${input.key}`);
    if ((result.ContentLength ?? 0) > input.maxBytes) {
      result.Body.destroy();
      throw new Error(`${input.key} is larger than the ${input.maxBytes}-byte limit`);
    }
    await pipeline(result.Body, byteLimit(input.maxBytes), createWriteStream(input.filePath));
  }

  async uploadFile(input: {
    bucket: MediaBucket;
    key: string;
    filePath: string;
    contentType: string;
    cacheControl: string;
  }): Promise<void> {
    // A stream body needs an explicit length; public copies are well under the 5 GB single-PUT limit.
    const { size } = await stat(input.filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(input.bucket),
        Key: input.key,
        Body: createReadStream(input.filePath),
        ContentLength: size,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
  }
}

/** One S3 client configuration for the API and the media worker. */
export function createS3Client(config: ConfigService<Env, true>): S3Client {
  const endpoint = config.get('MEDIA_S3_ENDPOINT', { infer: true });
  return new S3Client({
    region: config.get('MEDIA_S3_REGION', { infer: true }),
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: config.get('MEDIA_S3_FORCE_PATH_STYLE', { infer: true }),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Null until both upload buckets are configured: upload routes then answer 503 instead of failing later. */
export const mediaStorageProvider: Provider = {
  provide: MEDIA_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): MediaStorage | null => {
    const quarantine = config.get('MEDIA_QUARANTINE_BUCKET', { infer: true });
    const restricted = config.get('MEDIA_RESTRICTED_BUCKET', { infer: true });
    if (!quarantine || !restricted) {
      new Logger('MediaStorage').warn(
        'MEDIA_QUARANTINE_BUCKET / MEDIA_RESTRICTED_BUCKET are not set: uploads are disabled (503).',
      );
      return null;
    }
    const publicBucket = config.get('MEDIA_PUBLIC_BUCKET', { infer: true });
    return new S3MediaStorage(createS3Client(config), {
      quarantine,
      restricted,
      ...(publicBucket ? { public: publicBucket } : {}),
    });
  },
};
