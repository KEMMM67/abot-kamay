// apps/api/src/media/storage/media-storage.ts
//
// Port for object storage. Browsers upload straight to storage with a presigned PUT (the API has a
// 1 MiB body limit and never proxies media). The signature covers Content-Type, Content-Length and
// x-amz-checksum-sha256, so storage itself rejects a file that differs from what the API recorded.
// The media worker (src/worker.ts) is the only code that reads uploads back and writes public copies.
import type { MediaBucket, UploadBucket } from '../media-policy.js';

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the client must send exactly (Content-Length is set by the browser from the body). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  byteSize: number;
  /** Base64 SHA-256 that storage verified on upload, when it reports one. */
  sha256Base64: string | null;
}

export interface MediaStorage {
  presignUpload(input: {
    bucket: UploadBucket;
    key: string;
    contentType: string;
    byteSize: number;
    sha256Base64: string;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;

  /** Short-lived read link for restricted files (reviewers only; every call is audit-logged). */
  presignDownload(input: { bucket: UploadBucket; key: string; expiresInSeconds: number }): Promise<string>;

  /** Metadata of an uploaded object, or null when nothing was uploaded under that key. */
  head(input: { bucket: MediaBucket; key: string }): Promise<StoredObject | null>;

  /**
   * Streams an object into a local file (media worker only). Refuses objects larger than maxBytes,
   * so a file swapped after the upload check can't fill the worker's disk.
   */
  downloadToFile(input: {
    bucket: MediaBucket;
    key: string;
    filePath: string;
    maxBytes: number;
  }): Promise<void>;

  /** Writes a local file as an object (media worker only: public copies and video posters). */
  uploadFile(input: {
    bucket: MediaBucket;
    key: string;
    filePath: string;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
