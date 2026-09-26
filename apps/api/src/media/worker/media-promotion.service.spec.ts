// apps/api/src/media/worker/media-promotion.service.spec.ts
//
// The worker's decisions, with storage, the transcoder and the database faked. The claim query and the
// end-to-end path run against real PostgreSQL in test/creator-flow.integration.spec.ts.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaBucket } from '../media-policy.js';
import type { MediaStorage } from '../storage/media-storage.js';
import {
  MediaPromotionService,
  parsePromotePayload,
  PUBLIC_CACHE_CONTROL,
  type ClaimedEvent,
} from './media-promotion.service.js';
import { UnusableMediaError, type MediaTranscoder, type RenderedCopy } from './media-transcoder.js';

const MEDIA_ID = '0199aaaa-0000-7000-8000-000000000001';
const UPLOAD = Buffer.from('raw bytes from a phone, with GPS in the EXIF');

type Write = { model: string; op: string; args: Record<string, unknown> };

function fakePrisma(asset: Partial<MediaAsset> | null, { minorLinks = 0 } = {}) {
  const writes: Write[] = [];
  const record = (model: string, op: string) => (args: Record<string, unknown>) => ({ model, op, args });
  const prisma = {
    mediaAsset: { findUnique: async () => asset, update: record('mediaAsset', 'update') },
    campaignMedia: { count: async () => minorLinks },
    auditLog: { create: record('auditLog', 'create') },
    outboxEvent: { update: record('outboxEvent', 'update') },
    processedMessage: { createMany: record('processedMessage', 'createMany') },
    $transaction: async (operations: Write[]) => {
      writes.push(...operations);
      return operations;
    },
  };
  return { prisma: prisma as unknown as PrismaService, writes };
}

class FakeStorage implements Pick<MediaStorage, 'downloadToFile' | 'uploadFile'> {
  readonly uploads: Array<{ bucket: MediaBucket; key: string; contentType: string; cacheControl: string }> =
    [];
  constructor(private readonly body: Buffer | Error = UPLOAD) {}

  async downloadToFile(input: { filePath: string }): Promise<void> {
    if (this.body instanceof Error) throw this.body;
    await writeFile(input.filePath, this.body);
  }

  async uploadFile(input: { bucket: MediaBucket; key: string; contentType: string; cacheControl: string }) {
    this.uploads.push({
      bucket: input.bucket,
      key: input.key,
      contentType: input.contentType,
      cacheControl: input.cacheControl,
    });
  }
}

class FakeTranscoder implements MediaTranscoder {
  constructor(private readonly failure?: Error) {}

  async render(input: { kind: 'IMAGE' | 'VIDEO'; workDir: string }): Promise<RenderedCopy> {
    if (this.failure) throw this.failure;
    const filePath = join(input.workDir, 'copy');
    await writeFile(filePath, 'copy');
    const posterPath = input.kind === 'VIDEO' ? join(input.workDir, 'poster.jpg') : null;
    if (posterPath) await writeFile(posterPath, 'poster');
    return {
      filePath,
      contentType: input.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
      width: 720,
      height: 1280,
      durationMs: input.kind === 'VIDEO' ? 9_000 : null,
      posterPath,
    };
  }
}

function approvedAsset(overrides: Partial<MediaAsset> = {}): Partial<MediaAsset> {
  return {
    id: MEDIA_ID,
    purpose: 'POST_MEDIA',
    visibility: 'PUBLIC',
    moderation: 'APPROVED',
    exifStripped: false,
    storageKey: `post-media/u1/${MEDIA_ID}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: UPLOAD.length,
    sha256: createHash('sha256').update(UPLOAD).digest('hex'),
    ...overrides,
  };
}

const EVENT: ClaimedEvent = { id: 42n, aggregateId: MEDIA_ID, payload: { mediaId: MEDIA_ID }, attempts: 1 };

const config = new ConfigService<Env, true>({
  MEDIA_WORKER_MAX_ATTEMPTS: 6,
  MEDIA_WORKER_POLL_SECONDS: 5,
} as Partial<Env>);

function setup({
  asset = approvedAsset(),
  minorLinks = 0,
  storage = new FakeStorage(),
  transcoder = new FakeTranscoder(),
}: {
  asset?: Partial<MediaAsset> | null;
  minorLinks?: number;
  storage?: FakeStorage;
  transcoder?: MediaTranscoder;
} = {}) {
  const { prisma, writes } = fakePrisma(asset, { minorLinks });
  const service = new MediaPromotionService(prisma, storage as unknown as MediaStorage, transcoder, config);
  return { service, writes, storage };
}

const completed = (writes: Write[]) =>
  writes.some((write) => write.model === 'outboxEvent' && 'publishedAt' in (write.args.data as object));

describe('publishing', () => {
  it('writes the re-encoded photo to the public bucket, then lets the API link to it', async () => {
    const { service, writes, storage } = setup();
    await expect(service.promote(EVENT)).resolves.toEqual({ status: 'PUBLISHED', mediaId: MEDIA_ID });
    expect(storage.uploads).toEqual([
      {
        bucket: 'public',
        key: `post-media/u1/${MEDIA_ID}.jpg`,
        contentType: 'image/jpeg',
        cacheControl: PUBLIC_CACHE_CONTROL,
      },
    ]);
    expect(writes.find((write) => write.model === 'mediaAsset')?.args.data).toEqual({
      exifStripped: true,
      width: 720,
      height: 1280,
      durationMs: null,
    });
    expect(completed(writes)).toBe(true);
    expect(writes.find((write) => write.model === 'processedMessage')?.args).toMatchObject({
      data: [{ consumer: 'media-worker', messageId: '42' }],
      skipDuplicates: true,
    });
  });

  it('publishes a phone video as MP4 with its poster frame', async () => {
    const { service, storage } = setup({
      asset: approvedAsset({ storageKey: `post-media/u1/${MEDIA_ID}.mov`, mimeType: 'video/quicktime' }),
    });
    await expect(service.promote(EVENT)).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect(storage.uploads.map((upload) => [upload.key, upload.contentType])).toEqual([
      [`post-media/u1/${MEDIA_ID}.poster.jpg`, 'image/jpeg'],
      [`post-media/u1/${MEDIA_ID}.mp4`, 'video/mp4'],
    ]);
  });
});

describe('holding files back', () => {
  it('never publishes a photo of a child while faces can only be blurred by hand', async () => {
    const { service, writes, storage } = setup();
    const event = { ...EVENT, payload: { mediaId: MEDIA_ID, blurMinors: true } };
    await expect(service.promote(event)).resolves.toEqual({
      status: 'HELD',
      mediaId: MEDIA_ID,
      reason: 'MINOR_BLUR_REQUIRED',
    });
    expect(storage.uploads).toEqual([]);
    expect(writes.find((write) => write.model === 'mediaAsset')?.args.data).toEqual({
      moderation: 'NEEDS_HUMAN',
    });
    expect(writes.find((write) => write.model === 'auditLog')?.args.data).toMatchObject({
      actorType: 'SYSTEM',
      action: 'MEDIA_HELD',
      after: { reason: 'MINOR_BLUR_REQUIRED' },
    });
    expect(completed(writes)).toBe(true);
  });

  it('checks the database for children too, not only the event', async () => {
    const { service, storage } = setup({ minorLinks: 1 });
    await expect(service.promote(EVENT)).resolves.toMatchObject({ reason: 'MINOR_BLUR_REQUIRED' });
    expect(storage.uploads).toEqual([]);
  });

  it('holds a file whose bytes no longer match the recorded SHA-256', async () => {
    const { service, storage } = setup({ storage: new FakeStorage(Buffer.from('swapped after upload')) });
    await expect(service.promote(EVENT)).resolves.toMatchObject({
      status: 'HELD',
      reason: 'CHECKSUM_MISMATCH',
    });
    expect(storage.uploads).toEqual([]);
  });

  it('holds a file that cannot be decoded, instead of retrying it forever', async () => {
    const { service, writes } = setup({ transcoder: new FakeTranscoder(new UnusableMediaError('corrupt')) });
    await expect(service.promote(EVENT)).resolves.toMatchObject({ status: 'HELD', reason: 'UNUSABLE_FILE' });
    expect(completed(writes)).toBe(true);
  });
});

describe('skipping and retrying', () => {
  it.each([
    ['was rejected since', approvedAsset({ moderation: 'REJECTED' })],
    ['is not public', approvedAsset({ visibility: 'QUARANTINE' })],
    ['is already published', approvedAsset({ exifStripped: true })],
    ['no longer exists', null],
  ])('closes the event when the file %s', async (_label, asset) => {
    const { service, writes, storage } = setup({ asset });
    await expect(service.promote(EVENT)).resolves.toMatchObject({ status: 'SKIPPED' });
    expect(storage.uploads).toEqual([]);
    expect(completed(writes)).toBe(true);
  });

  it('leaves the event open when storage fails, so a later attempt retries it', async () => {
    const { service, writes } = setup({ storage: new FakeStorage(new Error('socket hang up')) });
    await expect(service.promote(EVENT)).rejects.toThrow('socket hang up');
    expect(writes).toEqual([]);
  });
});

describe('parsePromotePayload', () => {
  it('accepts the payloads the moderation code writes, and nothing else', () => {
    expect(parsePromotePayload({ mediaId: MEDIA_ID })).toEqual({ mediaId: MEDIA_ID, blurMinors: false });
    expect(parsePromotePayload({ mediaId: MEDIA_ID, blurMinors: true })).toEqual({
      mediaId: MEDIA_ID,
      blurMinors: true,
    });
    expect(parsePromotePayload({ mediaId: 'not-a-uuid' })).toBeNull();
    expect(parsePromotePayload(null)).toBeNull();
    expect(parsePromotePayload('text')).toBeNull();
  });
});
