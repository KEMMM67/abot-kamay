// apps/api/src/media/media-policy.spec.ts
import {
  bucketForPurpose,
  checkUpload,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  posterKeyFor,
  publicKeyFor,
  publicRenditionFor,
  sha256HexToBase64,
  storageKeyFor,
} from './media-policy.js';

describe('upload rules', () => {
  it('accept photos and videos for posts', () => {
    expect(checkUpload('POST_MEDIA', 'image/jpeg', 2_000_000)).toEqual({
      ok: true,
      kind: 'IMAGE',
      extension: 'jpg',
      bucket: 'quarantine',
    });
    expect(checkUpload('POST_MEDIA', 'video/mp4', 50_000_000)).toMatchObject({ ok: true, kind: 'VIDEO' });
  });

  it('keep government IDs to photos, in the restricted bucket', () => {
    expect(checkUpload('KYC_DOCUMENT', 'image/png', 1_000_000)).toMatchObject({
      ok: true,
      bucket: 'restricted',
    });
    expect(checkUpload('KYC_DOCUMENT', 'video/mp4', 1_000_000)).toEqual({
      ok: false,
      reason: 'TYPE_NOT_ALLOWED',
    });
    expect(bucketForPurpose('KYC_DOCUMENT')).toBe('restricted');
  });

  it('reject other types, empty files and oversized files', () => {
    expect(checkUpload('SPENDING_PROOF', 'application/pdf', 1000)).toEqual({
      ok: false,
      reason: 'TYPE_NOT_ALLOWED',
    });
    expect(checkUpload('POST_MEDIA', 'image/svg+xml', 1000)).toEqual({
      ok: false,
      reason: 'TYPE_NOT_ALLOWED',
    });
    expect(checkUpload('POST_MEDIA', 'image/jpeg', 0)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(checkUpload('POST_MEDIA', 'image/jpeg', MAX_IMAGE_BYTES + 1)).toEqual({
      ok: false,
      reason: 'TOO_LARGE',
      maxBytes: MAX_IMAGE_BYTES,
    });
    expect(checkUpload('POST_MEDIA', 'video/mp4', MAX_VIDEO_BYTES + 1)).toMatchObject({
      reason: 'TOO_LARGE',
    });
  });
});

it('builds storage keys from ids only', () => {
  expect(storageKeyFor('SPENDING_PROOF', 'u1', 'm1', 'webp')).toBe('spending-proof/u1/m1.webp');
});

it('converts hex SHA-256 to the base64 form S3 checks', () => {
  const hex = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256("")
  expect(sha256HexToBase64(hex)).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
});

describe('public copies', () => {
  it('play everywhere: MP4 for every video, JPEG for HEIC, other photo types kept', () => {
    expect(publicRenditionFor('video/quicktime')).toEqual({ contentType: 'video/mp4', extension: 'mp4' });
    expect(publicRenditionFor('video/webm')).toEqual({ contentType: 'video/mp4', extension: 'mp4' });
    expect(publicRenditionFor('image/heic')).toEqual({ contentType: 'image/jpeg', extension: 'jpg' });
    expect(publicRenditionFor('image/png')).toEqual({ contentType: 'image/png', extension: 'png' });
    expect(publicRenditionFor('application/pdf')).toBeNull();
  });

  it('live under the upload key with the new extension, with the poster beside the video', () => {
    const video = { storageKey: 'post-media/u1/m1.mov', mimeType: 'video/quicktime' };
    expect(publicKeyFor(video)).toBe('post-media/u1/m1.mp4');
    expect(posterKeyFor('post-media/u1/m1.mp4')).toBe('post-media/u1/m1.poster.jpg');
    expect(publicKeyFor({ storageKey: 'spending-proof/u1/m2.heic', mimeType: 'image/heic' })).toBe(
      'spending-proof/u1/m2.jpg',
    );
    expect(publicKeyFor({ storageKey: 'post-media/u1/m3.jpg', mimeType: 'image/jpeg' })).toBe(
      'post-media/u1/m3.jpg',
    );
  });
});
