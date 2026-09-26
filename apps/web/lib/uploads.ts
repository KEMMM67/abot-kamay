// apps/web/lib/uploads.ts
//
// Browser uploads for posts, ID checks and receipts:
//   1. hash each file (SHA-256) in the browser;
//   2. one Server Action returns a presigned upload slot per file (the API records the hash);
//   3. PUT each file straight to storage (S3 or Cloudflare R2), never through AbotKamay's servers.
//      Storage verifies the bytes against the recorded hash, so a file can't be swapped between
//      steps 2 and 3, and the media worker checks the hash again before anything is published.
// Returns the media ids in the same order as the files.
import { prepareUploads } from '@/lib/actions/creator';
import type { UploadPurpose } from '@/lib/types';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Why a picked file can't be used; the forms show the message for it (messages.forms.upload). */
export type FileProblem = 'TYPE_MEDIA' | 'TYPE_IMAGE' | 'EMPTY' | 'VIDEO_TOO_LARGE' | 'IMAGE_TOO_LARGE';

/** Why an upload failed in the browser (messages.forms.upload). */
export type UploadProblem = 'INSECURE_CONTEXT' | 'STORAGE_REFUSED' | 'NETWORK' | 'INCOMPLETE';

/**
 * An upload that failed. `problem` is set when the browser detected it; otherwise `message` is the
 * API's reason, already in the visitor's language (it comes from a Server Action).
 */
export class UploadError extends Error {
  override readonly name = 'UploadError';
  constructor(
    message: string,
    readonly problem: UploadProblem | null = null,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function isVideo(file: File): boolean {
  return file.type.startsWith('video/');
}

/** The same type and size limits as the API, checked before anything is uploaded. */
export function fileProblem(file: File, { allowVideo }: { allowVideo: boolean }): FileProblem | null {
  const allowed: readonly string[] = allowVideo ? [...IMAGE_TYPES, ...VIDEO_TYPES] : IMAGE_TYPES;
  if (!allowed.includes(file.type)) return allowVideo ? 'TYPE_MEDIA' : 'TYPE_IMAGE';
  if (file.size === 0) return 'EMPTY';
  if (isVideo(file) && file.size > MAX_VIDEO_BYTES) return 'VIDEO_TOO_LARGE';
  if (!isVideo(file) && file.size > MAX_IMAGE_BYTES) return 'IMAGE_TOO_LARGE';
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    // crypto.subtle only exists on https (and localhost); production is always https.
    throw new UploadError('INSECURE_CONTEXT', 'INSECURE_CONTEXT');
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function put(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => onProgress(event.loaded));
    request.addEventListener('load', () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new UploadError(`Storage answered ${request.status}`, 'STORAGE_REFUSED')),
    );
    request.addEventListener('error', () => reject(new UploadError('Network error', 'NETWORK')));
    request.send(file);
  });
}

export interface UploadInput {
  file: File;
  purpose: UploadPurpose;
}

/** Uploads every file and returns their media ids, in order. `onProgress` receives 0 to 1. */
export async function uploadFiles(
  inputs: readonly UploadInput[],
  onProgress?: (fraction: number) => void,
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const hashes: string[] = [];
  for (const input of inputs) {
    // Sequential on purpose: hashing reads each file fully into memory, and phones have little.
    hashes.push(await sha256Hex(input.file));
  }

  const prepared = await prepareUploads(
    inputs.map((input, index) => ({
      purpose: input.purpose,
      mimeType: input.file.type,
      byteSize: input.file.size,
      sha256: hashes[index] ?? '',
    })),
  );
  if (!prepared.ok) throw new UploadError(prepared.error, null, prepared.code);

  const total = inputs.reduce((sum, input) => sum + input.file.size, 0) || 1;
  const loaded = inputs.map(() => 0);
  const report = () => onProgress?.(loaded.reduce((sum, value) => sum + value, 0) / total);

  await Promise.all(
    prepared.data.map(async (intent, index) => {
      const input = inputs[index];
      if (!input) return;
      await put(intent.upload.url, intent.upload.headers, input.file, (bytes) => {
        loaded[index] = bytes;
        report();
      });
      loaded[index] = input.file.size;
      report();
    }),
  );
  return prepared.data.map((intent) => intent.mediaId);
}

/** The message to show for an upload failure, in the visitor's language. */
export function uploadErrorMessage(
  error: unknown,
  messages: Record<UploadProblem, string>,
  fallback: string,
): string {
  if (!(error instanceof UploadError)) return fallback;
  return error.problem ? messages[error.problem] : error.message;
}
