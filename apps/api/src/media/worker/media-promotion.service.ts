// apps/api/src/media/worker/media-promotion.service.ts
//
// The media worker's job. When a reviewer publishes a post or verifies a receipt, the same database
// transaction writes a media.promote.requested event per file to the transactional outbox. This
// service consumes those events and puts each file's public copy (media-transcoder.ts) in the public
// bucket; the API links to a file only after that (media.service.ts publicUrl, exifStripped).
//
// Delivery and retries (no extra tables or columns):
// - Events are claimed with UPDATE ... FOR UPDATE SKIP LOCKED, so several workers never take the same
//   event at once. Each claim counts as an attempt.
// - A failed attempt waits before the next: attempt n + 1 is eligible 3^n - 1 minutes after the event
//   was written (0, 2, 8, 26, 80, 242 minutes), about four hours of retries with the default of 6
//   attempts. After MEDIA_WORKER_MAX_ATTEMPTS the event stays unpublished in the outbox for staff.
// - Work is idempotent: the public key is derived from the upload, so a repeated run rewrites the same
//   objects. published_at marks the event done; processed_messages records it for this consumer.
//
// What is never made public, by design:
// - Photos and videos that show a child. The reviewer confirmed faces must be blurred and there is no
//   automatic face blurring yet, so the file is held (moderation NEEDS_HUMAN) and the post appears
//   without it. Nothing showing a minor is published by default.
// - Files that no longer match their recorded SHA-256, and files that can't be decoded: held too.
// Every hold is audit-logged as MEDIA_HELD with the reason.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUuid } from '../../common/ids/uuidv7.js';
import type { Env } from '../../config/env.schema.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { bucketForPurpose, mediaKindOf, posterKeyFor, publicKeyFor } from '../media-policy.js';
import { MEDIA_STORAGE, type MediaStorage } from '../storage/media-storage.js';
import {
  MEDIA_TRANSCODER,
  UnusableMediaError,
  type MediaTranscoder,
  type RenderedCopy,
} from './media-transcoder.js';

export const PROMOTE_EVENT = 'media.promote.requested';
export const MEDIA_WORKER_CONSUMER = 'media-worker';

/** Public copies never change: a new upload always gets a new key. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CLAIM_BATCH = 4;
/** After an unexpected error, pause before claiming more (storage or network may be down). */
const ERROR_PAUSE_MS = 30_000;

export interface ClaimedEvent {
  id: bigint;
  aggregateId: string;
  payload: unknown;
  /** Attempts so far, including this one. */
  attempts: number;
}

export type HoldReason = 'MINOR_BLUR_REQUIRED' | 'CHECKSUM_MISMATCH' | 'UNUSABLE_FILE' | 'UNSUPPORTED_TYPE';

export type PromotionOutcome =
  | { status: 'PUBLISHED'; mediaId: string }
  | { status: 'HELD'; mediaId: string; reason: HoldReason }
  | { status: 'SKIPPED'; mediaId: string | null };

/** The event payload written by the moderation and receipt-review code. */
export function parsePromotePayload(payload: unknown): { mediaId: string; blurMinors: boolean } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { mediaId, blurMinors } = payload as Record<string, unknown>;
  if (typeof mediaId !== 'string' || !isUuid(mediaId)) return null;
  return { mediaId, blurMinors: blurMinors === true };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

@Injectable()
export class MediaPromotionService {
  private readonly logger = new Logger('MediaWorker');
  private readonly maxAttempts: number;
  private readonly pollMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MEDIA_TRANSCODER) private readonly transcoder: MediaTranscoder,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get('MEDIA_WORKER_MAX_ATTEMPTS', { infer: true });
    this.pollMs = config.get('MEDIA_WORKER_POLL_SECONDS', { infer: true }) * 1000;
  }

  /** Polls until `signal` aborts. The job in progress is finished before returning. */
  async run(signal: AbortSignal): Promise<void> {
    this.logger.log(`Waiting for ${PROMOTE_EVENT} events (every ${this.pollMs / 1000} s when idle)`);
    while (!signal.aborted) {
      let handled = 0;
      try {
        handled = await this.runOnce(signal);
      } catch (error) {
        this.logger.error('Claiming events failed; pausing before the next try', error as Error);
        await delay(ERROR_PAUSE_MS, signal);
        continue;
      }
      if (handled === 0) await delay(this.pollMs, signal);
    }
    this.logger.log('Stopped');
  }

  /** Claims and handles one batch; returns how many events were claimed. */
  async runOnce(signal?: AbortSignal): Promise<number> {
    const events = await this.claim(CLAIM_BATCH);
    for (const event of events) {
      if (signal?.aborted) break; // the claimed rest are retried by the next worker
      try {
        const outcome = await this.promote(event);
        if (outcome.status === 'PUBLISHED') this.logger.log(`Published media ${outcome.mediaId}`);
        if (outcome.status === 'HELD') this.logger.warn(`Held media ${outcome.mediaId}: ${outcome.reason}`);
      } catch (error) {
        const finalAttempt = event.attempts >= this.maxAttempts;
        this.logger.error(
          `Event ${event.id} (attempt ${event.attempts}/${this.maxAttempts}) failed` +
            (finalAttempt ? '; no more retries, it stays in the outbox' : '; it will be retried'),
          error as Error,
        );
        if (signal) await delay(ERROR_PAUSE_MS, signal);
      }
    }
    return events.length;
  }

  /** Takes up to `limit` due events that no other worker holds, and counts the attempt. */
  async claim(limit: number): Promise<ClaimedEvent[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: bigint; aggregate_id: string; payload: unknown; attempts: number }>
    >`
      UPDATE outbox_events
         SET attempts = attempts + 1
       WHERE id IN (
               SELECT id
                 FROM outbox_events
                WHERE event_type = ${PROMOTE_EVENT}
                  AND published_at IS NULL
                  AND attempts < ${this.maxAttempts}::int
                  AND created_at + make_interval(mins => power(3, attempts)::int - 1) <= now()
                ORDER BY id
                LIMIT ${limit}::int
                  FOR UPDATE SKIP LOCKED)
      RETURNING id, aggregate_id, payload, attempts`;
    return rows
      .map((row) => ({
        id: BigInt(row.id),
        aggregateId: row.aggregate_id,
        payload: row.payload,
        attempts: Number(row.attempts),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async promote(event: ClaimedEvent): Promise<PromotionOutcome> {
    const payload = parsePromotePayload(event.payload);
    const asset = payload
      ? await this.prisma.mediaAsset.findUnique({ where: { id: payload.mediaId } })
      : null;

    // Rejected or withdrawn since the event was written, or copied already: nothing to publish.
    if (!payload || !asset || asset.visibility !== 'PUBLIC' || asset.moderation !== 'APPROVED') {
      await this.prisma.$transaction(this.completion(event));
      return { status: 'SKIPPED', mediaId: payload?.mediaId ?? null };
    }
    if (asset.exifStripped) {
      await this.prisma.$transaction(this.completion(event));
      return { status: 'SKIPPED', mediaId: asset.id };
    }

    // The event says so for posts; the database is asked too, so no path can publish a child's face.
    const showsMinor =
      payload.blurMinors ||
      (await this.prisma.campaignMedia.count({ where: { mediaAssetId: asset.id, showsMinor: true } })) > 0;
    if (showsMinor) return this.hold(event, asset, 'MINOR_BLUR_REQUIRED');

    const kind = mediaKindOf(asset.mimeType);
    const publicKey = publicKeyFor(asset);
    if (!kind || !publicKey) return this.hold(event, asset, 'UNSUPPORTED_TYPE');

    const workDir = await mkdtemp(join(tmpdir(), 'abotkamay-media-'));
    try {
      const sourcePath = join(workDir, 'source');
      await this.storage.downloadToFile({
        bucket: bucketForPurpose(asset.purpose),
        key: asset.storageKey,
        filePath: sourcePath,
        maxBytes: asset.byteSize,
      });
      if ((await sha256File(sourcePath)) !== asset.sha256) {
        return this.hold(event, asset, 'CHECKSUM_MISMATCH');
      }

      let copy: RenderedCopy;
      try {
        copy = await this.transcoder.render({ kind, mimeType: asset.mimeType, sourcePath, workDir });
      } catch (error) {
        if (error instanceof UnusableMediaError)
          return this.hold(event, asset, 'UNUSABLE_FILE', error.message);
        throw error;
      }

      if (copy.posterPath) {
        await this.storage.uploadFile({
          bucket: 'public',
          key: posterKeyFor(publicKey),
          filePath: copy.posterPath,
          contentType: 'image/jpeg',
          cacheControl: PUBLIC_CACHE_CONTROL,
        });
      }
      await this.storage.uploadFile({
        bucket: 'public',
        key: publicKey,
        filePath: copy.filePath,
        contentType: copy.contentType,
        cacheControl: PUBLIC_CACHE_CONTROL,
      });

      // Only now may the API link to it.
      await this.prisma.$transaction([
        this.prisma.mediaAsset.update({
          where: { id: asset.id },
          data: { exifStripped: true, width: copy.width, height: copy.height, durationMs: copy.durationMs },
        }),
        ...this.completion(event),
      ]);
      return { status: 'PUBLISHED', mediaId: asset.id };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async hold(
    event: ClaimedEvent,
    asset: MediaAsset,
    reason: HoldReason,
    detail?: string,
  ): Promise<PromotionOutcome> {
    await this.prisma.$transaction([
      this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { moderation: 'NEEDS_HUMAN' } }),
      this.prisma.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'MEDIA_HELD',
          entityType: 'media_asset',
          entityId: asset.id,
          before: { moderation: asset.moderation },
          after: { moderation: 'NEEDS_HUMAN', reason, detail: detail?.slice(0, 500) ?? null },
        },
      }),
      ...this.completion(event),
    ]);
    return { status: 'HELD', mediaId: asset.id, reason };
  }

  /** Marks the event done for good. */
  private completion(event: ClaimedEvent) {
    return [
      this.prisma.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } }),
      this.prisma.processedMessage.createMany({
        data: [{ consumer: MEDIA_WORKER_CONSUMER, messageId: event.id.toString() }],
        skipDuplicates: true,
      }),
    ];
  }
}
