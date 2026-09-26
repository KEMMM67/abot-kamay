// apps/api/test/creator-flow.integration.spec.ts
//
// The creator journey through the real services and a real database, with only object storage faked:
//   phone sign-in -> KYC submission -> reviewer approval -> post -> review -> public feed and page
//   -> spending reports (hash chain) -> revocation freezes the creator's campaigns.
// Every rule is also checked on the way: unverified users cannot post, reviewers cannot review
// themselves, and receipts come only from the campaign's creator.
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service.js';
import { LogSmsSender } from '../src/auth/sms/sms-sender.js';
import { CampaignModerationService } from '../src/campaigns/campaign-moderation.service.js';
import { CampaignPostsService } from '../src/campaigns/campaign-posts.service.js';
import { CampaignReadsService } from '../src/campaigns/campaign-reads.service.js';
import { GENESIS_HASH } from '../src/campaigns/spending/spending-report-hash.js';
import { SpendingReportsService } from '../src/campaigns/spending/spending-reports.service.js';
import type { RequestMeta } from '../src/common/http/request-meta.js';
import type { Env } from '../src/config/env.schema.js';
import type { User } from '../src/generated/prisma/client.js';
import { KycService } from '../src/kyc/kyc.service.js';
import {
  publicRenditionFor,
  type MediaBucket,
  type MediaKind,
  type UploadPurpose,
} from '../src/media/media-policy.js';
import { MediaService } from '../src/media/media.service.js';
import type { MediaStorage, PresignedUpload, StoredObject } from '../src/media/storage/media-storage.js';
import {
  MediaPromotionService,
  PROMOTE_EVENT,
  PUBLIC_CACHE_CONTROL,
} from '../src/media/worker/media-promotion.service.js';
import type { MediaTranscoder, RenderedCopy } from '../src/media/worker/media-transcoder.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestPrisma, RUN_ID } from './support/test-database.js';

/**
 * Object storage stand-in: every presigned upload is treated as completed by the browser. Bodies
 * holds the bytes "uploaded" under each key, and the public copies the media worker writes.
 */
class FakeStorage implements MediaStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly bodies = new Map<string, Buffer>();
  readonly published = new Map<string, { contentType: string; cacheControl: string; body: Buffer }>();

  async presignUpload(input: {
    key: string;
    contentType: string;
    byteSize: number;
    sha256Base64: string;
  }): Promise<PresignedUpload> {
    this.objects.set(input.key, { byteSize: input.byteSize, sha256Base64: input.sha256Base64 });
    return {
      url: `https://storage.test/${input.key}`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'x-amz-checksum-sha256': input.sha256Base64 },
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  async presignDownload(input: { key: string }): Promise<string> {
    return `https://storage.test/${input.key}?signed`;
  }

  async head(input: { key: string }): Promise<StoredObject | null> {
    return this.objects.get(input.key) ?? null;
  }

  async downloadToFile(input: { key: string; filePath: string; maxBytes: number }): Promise<void> {
    const body = this.bodies.get(input.key);
    if (!body) throw new Error(`No object ${input.key}`);
    if (body.length > input.maxBytes) throw new Error(`${input.key} is too large`);
    await writeFile(input.filePath, body);
  }

  async uploadFile(input: {
    bucket: MediaBucket;
    key: string;
    filePath: string;
    contentType: string;
    cacheControl: string;
  }): Promise<void> {
    expect(input.bucket).toBe('public');
    this.published.set(input.key, {
      contentType: input.contentType,
      cacheControl: input.cacheControl,
      body: await readFile(input.filePath),
    });
  }
}

/** Stands in for ffmpeg and sharp: writes a small "re-encoded" file (and a poster for videos). */
class FakeTranscoder implements MediaTranscoder {
  async render(input: { kind: MediaKind; mimeType: string; workDir: string }): Promise<RenderedCopy> {
    const filePath = join(input.workDir, 'public-copy');
    await writeFile(filePath, `re-encoded ${input.mimeType}`);
    const posterPath = input.kind === 'VIDEO' ? join(input.workDir, 'poster.jpg') : null;
    if (posterPath) await writeFile(posterPath, 'poster');
    return {
      filePath,
      contentType: publicRenditionFor(input.mimeType)?.contentType ?? 'application/octet-stream',
      width: input.kind === 'VIDEO' ? 720 : 1600,
      height: input.kind === 'VIDEO' ? 1280 : 1200,
      durationMs: input.kind === 'VIDEO' ? 15_000 : null,
      posterPath,
    };
  }
}

const SECRET = Buffer.from('integration-test-secret-integration-test'.slice(0, 32));
// A documentation-range address unique to this run, so repeated runs never hit the per-IP limit.
const META: RequestMeta = { ip: `2001:db8::${RUN_ID.slice(-4)}`, userAgent: 'vitest', requestId: RUN_ID };

let prisma: PrismaService;
let auth: AuthService;
let media: MediaService;
let kyc: KycService;
let posts: CampaignPostsService;
let reads: CampaignReadsService;
let moderation: CampaignModerationService;
let spending: SpendingReportsService;
let storage: FakeStorage;
let worker: MediaPromotionService;

function phoneNumber(offset: number): string {
  // A unique +6390000xxxxx number per run (the 0900 prefix is never assigned to subscribers).
  const tail = (Number.parseInt(RUN_ID.replace(/\D/g, '').slice(-5) || '0', 10) + offset) % 100_000;
  return `0900 00${String(tail).padStart(5, '0')}`;
}

async function signIn(phone: string): Promise<User> {
  const requested = await auth.requestOtp(phone, META);
  expect(requested.devCode).toMatch(/^\d{6}$/);
  const signedIn = await auth.verifyOtp(requested.challengeId, requested.devCode ?? '', META);
  const viewer = await auth.resolveSession(signedIn.token);
  expect(viewer?.user.id).toBe(signedIn.user.id);
  return signedIn.user;
}

/** "Uploads" deterministic bytes: storage holds them under the key the API chose, like a real PUT. */
async function upload(user: User, purpose: UploadPurpose, index: number, mimeType = 'image/jpeg') {
  const body = Buffer.alloc(100_000 + index, index % 256);
  const intent = await media.createUpload(user, {
    purpose,
    mimeType,
    byteSize: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  });
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: intent.mediaId } });
  storage.bodies.set(asset.storageKey, body);
  return intent.mediaId;
}

/** Runs the media worker over the promote events of these files (not other runs' leftovers). */
async function promoteMedia(mediaIds: readonly string[]) {
  const events = await prisma.outboxEvent.findMany({
    where: { eventType: PROMOTE_EVENT, aggregateId: { in: [...mediaIds] }, publishedAt: null },
    orderBy: { id: 'asc' },
  });
  const outcomes = [];
  for (const event of events) {
    outcomes.push(
      await worker.promote({
        id: event.id,
        aggregateId: event.aggregateId,
        payload: event.payload,
        attempts: 1,
      }),
    );
  }
  return outcomes;
}

async function reload(user: User): Promise<User> {
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.$connect();
  const config = new ConfigService<Env, true>({
    NODE_ENV: 'test',
    OTP_TTL_SECONDS: 300,
    SESSION_TTL_DAYS: 30,
    KYC_REVERIFY_MONTHS: 24,
    KYC_MEDIA_RETENTION_DAYS: 30,
    CREATOR_MAX_OPEN_CAMPAIGNS: 3,
    MEDIA_PUBLIC_BASE_URL: 'https://media.test',
    MEDIA_WORKER_MAX_ATTEMPTS: 6,
    MEDIA_WORKER_POLL_SECONDS: 5,
  } as Partial<Env>);
  storage = new FakeStorage();
  auth = new AuthService(prisma, SECRET, new LogSmsSender(), config);
  media = new MediaService(prisma, storage, config);
  kyc = new KycService(prisma, media, SECRET, config);
  reads = new CampaignReadsService(prisma, media);
  posts = new CampaignPostsService(prisma, media, config);
  moderation = new CampaignModerationService(prisma, media);
  spending = new SpendingReportsService(prisma, media, reads);
  worker = new MediaPromotionService(prisma, storage, new FakeTranscoder(), config);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('phone sign-in', () => {
  it('counts wrong codes and kills the code after five', async () => {
    const requested = await auth.requestOtp(phoneNumber(90), META);
    const wrong = requested.devCode === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(auth.verifyOtp(requested.challengeId, wrong, META)).rejects.toMatchObject({
        response: { code: 'OTP_INVALID', attemptsLeft: 5 - attempt },
      });
    }
    await expect(auth.verifyOtp(requested.challengeId, wrong, META)).rejects.toMatchObject({
      response: { code: 'OTP_EXPIRED' },
    });
    await expect(auth.verifyOtp(requested.challengeId, requested.devCode ?? '', META)).rejects.toMatchObject({
      response: { code: 'OTP_EXPIRED' },
    });
  });
});

describe('creator journey', () => {
  it('goes from sign-in to a verified post with receipts, and stops at revocation', async () => {
    // 1. Sign in. New accounts can browse and donate only.
    let creator = await signIn(phoneNumber(1));
    expect(creator.kycStatus).toBe('UNVERIFIED');
    await expect(upload(creator, 'POST_MEDIA', 1)).rejects.toMatchObject({
      response: { code: 'KYC_REQUIRED' },
    });

    // 2. Submit the ID and a selfie with the challenge code.
    const challenge = kyc.issueChallenge(creator);
    const idFront = await upload(creator, 'KYC_DOCUMENT', 2);
    const idBack = await upload(creator, 'KYC_DOCUMENT', 3);
    const selfie = await upload(creator, 'KYC_DOCUMENT', 4);
    await expect(
      kyc.submit(
        creator,
        {
          idType: 'PHILSYS',
          displayName: 'Ana R.',
          challengeToken: challenge.challengeToken,
          documents: { idFront, selfieWithId: selfie },
        },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'KYC_ID_BACK_REQUIRED' } });
    const { verificationId } = await kyc.submit(
      creator,
      {
        idType: 'PHILSYS',
        displayName: 'Ana R.',
        challengeToken: challenge.challengeToken,
        documents: { idFront, idBack, selfieWithId: selfie },
      },
      META,
    );
    creator = await reload(creator);
    expect(creator.kycStatus).toBe('PENDING_ID');
    expect(() => kyc.issueChallenge(creator)).toThrow(/already being reviewed/);

    // 3. A reviewer (never the applicant) approves it.
    await expect(kyc.decide(creator, verificationId, { decision: 'APPROVE' }, META)).rejects.toMatchObject({
      response: { code: 'FOUR_EYES' },
    });
    const reviewer = await prisma.user.create({
      data: { email: `reviewer-${RUN_ID}@example.test`, roles: ['REVIEWER'] },
    });
    const detail = await kyc.detail(reviewer, verificationId, META);
    expect(detail.documents.map((document) => document.kind).sort()).toEqual([
      'ID_BACK',
      'ID_FRONT',
      'SELFIE_WITH_ID',
    ]);
    await kyc.decide(
      reviewer,
      verificationId,
      { decision: 'APPROVE', idExpiresOn: new Date('2035-01-01') },
      META,
    );
    creator = await reload(creator);
    expect(creator).toMatchObject({ kycStatus: 'VERIFIED', displayName: 'Ana R.' });
    expect(creator.kycExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 700 * 86_400_000);

    // 4. Post: an OPEN_ENDED campaign about a neighbor, with signed consent.
    const photo = await upload(creator, 'POST_MEDIA', 5);
    const video = await upload(creator, 'POST_MEDIA', 6, 'video/mp4');
    const consentForm = await upload(creator, 'CONSENT_EVIDENCE', 7);
    const created = await posts.create(
      creator,
      {
        title: 'Pang-araw-araw na pagkain ni Lola Cita',
        caption:
          'Si Lola Cita ay kapitbahay namin sa Iloilo City. Mag-isa siyang nakatira at kulang ang pagkain niya araw-araw.\n\nAng pondo ay para sa bigas, ulam at gamot.',
        fundingType: 'OPEN_ENDED',
        plan: [
          { title: 'Bigas at ulam', payout: 'CREATOR' },
          { title: 'Gamot sa altapresyon', amountMinor: 150_000n, payout: 'DIRECT_TO_PROVIDER' },
        ],
        relationship: 'FRIEND_OR_NEIGHBOR',
        beneficiary: {
          alias: 'Lola Cita',
          ageBand: '80-89',
          region: 'Iloilo City',
          needCategories: ['FOOD'],
          isMinor: false,
        },
        media: [
          { mediaId: photo, altText: 'Si Lola Cita sa harap ng bahay niya', showsMinor: false },
          { mediaId: video, showsMinor: false },
        ],
        consent: { method: 'SIGNED_FORM', evidenceMediaId: consentForm },
      },
      META,
    );
    expect(created.status).toBe('PENDING_REVIEW');
    expect(await reads.get(created.slug)).toBeNull(); // not public until reviewed

    // 5. Publish after review; it appears in the feed and on its page.
    await moderation.decide(reviewer, created.id, { decision: 'PUBLISH' }, META);
    // Until the media worker has made the public copies, the post shows without media: never a link
    // to a raw upload, never a link to a file that isn't on the CDN yet.
    const early = (await reads.list(undefined, 50)).items.find((item) => item.slug === created.slug);
    expect(early).toMatchObject({ mediaCount: 0, cover: null, media: [] });

    const outcomes = await promoteMedia([photo, video]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['PUBLISHED', 'PUBLISHED']);
    // Only re-encoded copies (and the video's poster) reach the public bucket, never uploaded bytes.
    expect([...storage.published.values()].map((object) => object.body.toString()).sort()).toEqual([
      'poster',
      're-encoded image/jpeg',
      're-encoded video/mp4',
    ]);
    for (const object of storage.published.values()) expect(object.cacheControl).toBe(PUBLIC_CACHE_CONTROL);

    const feed = await reads.list(undefined, 50);
    const card = feed.items.find((item) => item.slug === created.slug);
    expect(card).toMatchObject({
      fundingType: 'OPEN_ENDED',
      goalMinor: null,
      creator: { displayName: 'Ana R.', relationship: 'FRIEND_OR_NEIGHBOR' },
      beneficiary: { alias: 'Lola Cita', region: 'Iloilo City' },
      mediaCount: 2,
      cover: { kind: 'IMAGE', altText: 'Si Lola Cita sa harap ng bahay niya', width: 1600, height: 1200 },
    });
    expect(card?.cover?.url).toMatch(/^https:\/\/media\.test\/post-media\/.+\.jpg$/);
    expect(card?.cover?.posterUrl).toBeNull();
    const clip = card?.media[1];
    expect(clip).toMatchObject({ kind: 'VIDEO', width: 720, height: 1280, durationMs: 15_000 });
    expect(clip?.url).toMatch(/\.mp4$/);
    expect(clip?.posterUrl).toMatch(/^https:\/\/media\.test\/post-media\/.+\.poster\.jpg$/);
    expect(storage.published.get(new URL(clip?.url ?? 'x:').pathname.slice(1))?.contentType).toBe(
      'video/mp4',
    );
    // A second run (a duplicated or retried event) changes nothing.
    expect(await promoteMedia([photo, video])).toEqual([]);

    const page = await reads.get(created.slug);
    expect(
      page?.milestones.map((milestone) => [milestone.title, milestone.budgetMinor, milestone.payoutMethod]),
    ).toEqual([
      ['Bigas at ulam', null, 'CREATOR_PAYOUT'],
      ['Gamot sa altapresyon', '150000', 'VENDOR_DIRECT'],
    ]);
    expect(page?.verificationChecks[0]).toContain('Na-verify ang government ID at selfie ni Ana R.');
    expect(page?.excessFundsPolicy).toContain('Walang takdang halaga');
    expect(page?.timeline.map((step) => step.kind)).toEqual([
      'CREATOR_VERIFIED',
      'POSTED',
      'REVIEWED',
      'MILESTONE_FUNDED',
      'DISBURSED',
      'PROOF',
    ]);
    // The same facts in English for donors who switched the site's language.
    const english = await reads.get(created.slug, 'en');
    expect(english?.verificationChecks[0]).toMatch(/^Ana R\.'s government ID and selfie were verified on /);
    expect(english?.excessFundsPolicy).toContain('This campaign has no set goal');
    expect(english?.timeline.map((step) => [step.kind, step.state])).toEqual(
      page?.timeline.map((step) => [step.kind, step.state]),
    );

    // 6. Receipts: only the creator, hash-chained per campaign.
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    const outsider = await signIn(phoneNumber(2));
    await expect(
      spending.create(
        outsider,
        created.slug,
        { title: 'Bigas', amountMinor: 100_000n, spentOn: today, media: [] },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'NOT_CREATOR' } });

    const receipt1 = await upload(creator, 'SPENDING_PROOF', 8);
    const first = await spending.create(
      creator,
      created.slug,
      {
        title: 'Bigas at ulam para sa isang linggo',
        amountMinor: 125_050n,
        spentOn: today,
        merchantName: 'Palengke ng Jaro',
        media: [{ mediaId: receipt1, kind: 'RECEIPT' }],
      },
      META,
    );
    const receipt2 = await upload(creator, 'SPENDING_PROOF', 9);
    const itemPhoto = await upload(creator, 'SPENDING_PROOF', 10);
    const second = await spending.create(
      creator,
      created.slug,
      {
        title: 'Gamot sa altapresyon',
        amountMinor: 150_000n,
        spentOn: today,
        milestoneId: page?.milestones[1]?.id,
        media: [
          { mediaId: receipt2, kind: 'RECEIPT' },
          { mediaId: itemPhoto, kind: 'ITEM_PHOTO' },
        ],
      },
      META,
    );
    expect(first).toMatchObject({ prevHash: GENESIS_HASH, status: 'SUBMITTED', media: [], mediaCount: 1 });
    expect(second).toMatchObject({
      prevHash: first.hash,
      milestoneTitle: 'Gamot sa altapresyon',
      mediaCount: 2,
    });

    // Receipt images become public only after review, once the media worker has copied them.
    const verified = await spending.decide(reviewer, first.id, { decision: 'VERIFY' }, META);
    expect(verified.status).toBe('VERIFIED');
    expect(verified).toMatchObject({ media: [], mediaCount: 1 });
    expect((await promoteMedia([receipt1])).map((outcome) => outcome.status)).toEqual(['PUBLISHED']);
    const reports = await reads.spendingReports(created.slug, undefined, 10);
    expect(reports?.items.find((report) => report.id === first.id)?.media).toMatchObject([
      { kind: 'IMAGE', proofKind: 'RECEIPT', posterUrl: null },
    ]);
    const withReceipts = await reads.get(created.slug);
    expect(withReceipts?.ledger.receiptedMinor).toBe('275050');
    expect(withReceipts?.spendingReportCount).toBe(2);
    expect(withReceipts?.receiptCount).toBe(2);

    // 7. Revocation freezes every open campaign of the creator.
    const { frozenCampaigns } = await kyc.revoke(
      reviewer,
      creator.id,
      'Substantiated fraud report in test',
      META,
    );
    expect(frozenCampaigns).toBe(1);
    expect((await reads.get(created.slug))?.status).toBe('UNDER_INVESTIGATION');
    creator = await reload(creator);
    await expect(upload(creator, 'POST_MEDIA', 11)).rejects.toMatchObject({
      response: { code: 'KYC_REQUIRED' },
    });
  });
});

describe('media worker queue', () => {
  it('claims each due event once, counts attempts, backs off, and records completion', async () => {
    // A promote event for a file that doesn't exist (like one rejected after the event was written).
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'media_asset',
        aggregateId: randomUUID(),
        eventType: PROMOTE_EVENT,
        payload: { mediaId: randomUUID() },
      },
    });

    // Older events left by earlier runs may be due first; keep claiming until ours comes up.
    let claimed;
    for (let round = 0; round < 50 && !claimed; round += 1) {
      const batch = await worker.claim(100);
      claimed = batch.find((item) => item.id === event.id);
      if (batch.length === 0) break;
    }
    expect(claimed).toMatchObject({ id: event.id, attempts: 1 });

    // Just attempted: not due again for two minutes, so neither this nor another worker retries it now.
    expect((await worker.claim(100)).some((item) => item.id === event.id)).toBe(false);

    await expect(worker.promote(claimed ?? { ...event, attempts: 1 })).resolves.toMatchObject({
      status: 'SKIPPED',
    });
    const done = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(done.publishedAt).not.toBeNull();
    expect(done.attempts).toBe(1);
    await expect(
      prisma.processedMessage.count({ where: { consumer: 'media-worker', messageId: event.id.toString() } }),
    ).resolves.toBe(1);
  });
});
