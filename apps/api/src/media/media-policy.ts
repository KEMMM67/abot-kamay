// apps/api/src/media/media-policy.ts
//
// What may be uploaded, for what, and where it is stored. Pure, so the rules are easy to test and to
// show to users ("Hanggang 15 MB ang litrato").
//
// Buckets (TECHNICAL_PLAN.md 2.3):
//   quarantine  every post, consent and receipt file lands here first; nothing here is public. After
//               moderation the media worker (src/worker.ts) re-encodes it, strips all metadata (GPS!)
//               and writes the copy to the public bucket.
//   restricted  government IDs and KYC selfies. Never public, served to reviewers only through
//               short-lived presigned links, deleted after the retention period.
//   public      re-encoded, metadata-free copies behind the CDN (MEDIA_PUBLIC_BASE_URL). Only the
//               media worker writes here. Keys mirror the upload's key; see publicKeyFor().
import type { MediaPurpose } from '../generated/prisma/enums.js';

export const UPLOAD_PURPOSES = ['POST_MEDIA', 'CONSENT_EVIDENCE', 'KYC_DOCUMENT', 'SPENDING_PROOF'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number] & MediaPurpose;

export type MediaKind = 'IMAGE' | 'VIDEO';
export type MediaBucket = 'quarantine' | 'restricted' | 'public';
/** Buckets that uploads go to; the public bucket is written by the media worker only. */
export type UploadBucket = Exclude<MediaBucket, 'public'>;

const MB = 1024 * 1024;

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const VIDEO_TYPES: Readonly<Record<string, string>> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export const MAX_IMAGE_BYTES = 15 * MB;
export const MAX_VIDEO_BYTES = 100 * MB;

interface UploadRule {
  kinds: readonly MediaKind[];
  bucket: UploadBucket;
}

export const UPLOAD_RULES: Readonly<Record<UploadPurpose, UploadRule>> = {
  POST_MEDIA: { kinds: ['IMAGE', 'VIDEO'], bucket: 'quarantine' },
  CONSENT_EVIDENCE: { kinds: ['IMAGE', 'VIDEO'], bucket: 'quarantine' },
  KYC_DOCUMENT: { kinds: ['IMAGE'], bucket: 'restricted' },
  SPENDING_PROOF: { kinds: ['IMAGE'], bucket: 'quarantine' },
};

export type UploadCheck =
  | { ok: true; kind: MediaKind; extension: string; bucket: UploadBucket }
  | { ok: false; reason: 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' | 'EMPTY'; maxBytes?: number };

export function mediaKindOf(mimeType: string): MediaKind | null {
  if (mimeType in IMAGE_TYPES) return 'IMAGE';
  if (mimeType in VIDEO_TYPES) return 'VIDEO';
  return null;
}

export function checkUpload(purpose: UploadPurpose, mimeType: string, byteSize: number): UploadCheck {
  const rule = UPLOAD_RULES[purpose];
  const kind = mediaKindOf(mimeType);
  if (!kind || !rule.kinds.includes(kind)) return { ok: false, reason: 'TYPE_NOT_ALLOWED' };
  if (byteSize <= 0) return { ok: false, reason: 'EMPTY' };
  const maxBytes = kind === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (byteSize > maxBytes) return { ok: false, reason: 'TOO_LARGE', maxBytes };
  const extension = (kind === 'VIDEO' ? VIDEO_TYPES : IMAGE_TYPES)[mimeType] ?? 'bin';
  return { ok: true, kind, extension, bucket: rule.bucket };
}

/** e.g. "post-media/0199.../0199....jpg". No user-supplied text ever reaches a storage key. */
export function storageKeyFor(
  purpose: UploadPurpose,
  uploaderId: string,
  mediaId: string,
  extension: string,
): string {
  return `${purpose.toLowerCase().replaceAll('_', '-')}/${uploaderId}/${mediaId}.${extension}`;
}

export function bucketForPurpose(purpose: MediaPurpose): UploadBucket {
  return purpose === 'KYC_DOCUMENT' ? 'restricted' : 'quarantine';
}

/** S3 wants the SHA-256 checksum as base64; clients and the database use lowercase hex. */
export function sha256HexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/**
 * What the media worker turns an upload into. Every browser plays H.264/AAC MP4 and shows JPEG, PNG
 * and WebP; HEIC photos and MOV or WebM videos (common from phones) do not play everywhere.
 */
export interface PublicRendition {
  contentType: string;
  extension: string;
}

export function publicRenditionFor(mimeType: string): PublicRendition | null {
  const kind = mediaKindOf(mimeType);
  if (kind === 'VIDEO') return { contentType: 'video/mp4', extension: 'mp4' };
  if (kind !== 'IMAGE') return null;
  if (mimeType === 'image/png') return { contentType: 'image/png', extension: 'png' };
  if (mimeType === 'image/webp') return { contentType: 'image/webp', extension: 'webp' };
  return { contentType: 'image/jpeg', extension: 'jpg' }; // JPEG, HEIC and HEIF
}

/**
 * Key of the public copy in the public bucket: the upload's key with the rendition's extension, e.g.
 * "post-media/{uploader}/{media}.mov" -> "post-media/{uploader}/{media}.mp4". Derived, not stored, so
 * the API and the worker always agree without a database column.
 */
export function publicKeyFor(asset: { storageKey: string; mimeType: string }): string | null {
  const rendition = publicRenditionFor(asset.mimeType);
  if (!rendition) return null;
  return `${asset.storageKey.replace(/\.[a-z0-9]+$/i, '')}.${rendition.extension}`;
}

/** The still frame shown before a video plays: "post-media/u/m.mp4" -> "post-media/u/m.poster.jpg". */
export function posterKeyFor(publicKey: string): string {
  return `${publicKey.replace(/\.[a-z0-9]+$/i, '')}.poster.jpg`;
}
