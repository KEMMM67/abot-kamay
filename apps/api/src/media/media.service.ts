// apps/api/src/media/media.service.ts
//
// Upload intents and attachment checks.
//
// 1. POST /uploads records a media_assets row (QUARANTINE, or RESTRICTED for KYC documents) and
//    returns a presigned PUT. The browser uploads straight to storage.
// 2. When the file is attached to something (a post, a KYC check, a spending report), claim() proves
//    it: the row belongs to this user and purpose, and storage holds an object of the declared size and
//    checksum. Unique constraints stop one file from being attached twice.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uuidv7 } from '../common/ids/uuidv7.js';
import type { Env } from '../config/env.schema.js';
import type { MediaAsset, User } from '../generated/prisma/client.js';
import type { MediaPurpose } from '../generated/prisma/enums.js';
import { canPost } from '../kyc/kyc-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  bucketForPurpose,
  checkUpload,
  mediaKindOf,
  posterKeyFor,
  publicKeyFor,
  sha256HexToBase64,
  storageKeyFor,
  type MediaKind,
  type UploadPurpose,
} from './media-policy.js';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage.js';

type PublicAssetFields = Pick<
  MediaAsset,
  'visibility' | 'moderation' | 'storageKey' | 'mimeType' | 'exifStripped'
>;

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const RESTRICTED_VIEW_TTL_SECONDS = 5 * 60;
const UPLOADS_PER_HOUR = 60;

export interface CreateUploadInput {
  purpose: UploadPurpose;
  mimeType: string;
  byteSize: number;
  /** Lowercase hex SHA-256 of the file, computed in the browser. */
  sha256: string;
}

export interface UploadIntentDto {
  mediaId: string;
  kind: MediaKind;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
  expiresAt: string;
}

@Injectable()
export class MediaService {
  private readonly publicBaseUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage | null,
    config: ConfigService<Env, true>,
  ) {
    this.publicBaseUrl = config.get('MEDIA_PUBLIC_BASE_URL', { infer: true })?.replace(/\/+$/, '') ?? null;
  }

  private requireStorage(): MediaStorage {
    if (!this.storage) {
      throw new ServiceUnavailableException({
        message: 'Media uploads are not configured',
        code: 'UPLOADS_NOT_CONFIGURED',
      });
    }
    return this.storage;
  }

  async createUpload(user: User, input: CreateUploadInput): Promise<UploadIntentDto> {
    const storage = this.requireStorage();

    // Post and consent media only make sense for people allowed to post. Receipts are for anyone who
    // was ever verified: creators stay accountable for spending even after their verification lapses.
    if ((input.purpose === 'POST_MEDIA' || input.purpose === 'CONSENT_EVIDENCE') && !canPost(user)) {
      throw new ForbiddenException({
        message: 'Verify your ID before uploading post media',
        code: 'KYC_REQUIRED',
      });
    }
    if (input.purpose === 'SPENDING_PROOF' && !user.kycVerifiedAt) {
      throw new ForbiddenException({
        message: 'Only verified creators can upload receipts',
        code: 'KYC_REQUIRED',
      });
    }

    const check = checkUpload(input.purpose, input.mimeType, input.byteSize);
    if (!check.ok) {
      throw new BadRequestException({
        message: check.reason === 'TOO_LARGE' ? 'File is too large' : 'This file type is not allowed here',
        code: `UPLOAD_${check.reason}`,
        maxBytes: check.maxBytes,
      });
    }

    const recent = await this.prisma.mediaAsset.count({
      where: { uploaderId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= UPLOADS_PER_HOUR) {
      throw new HttpException(
        { message: 'Too many uploads in a short time. Try again later.', code: 'UPLOAD_RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const mediaId = uuidv7();
    const storageKey = storageKeyFor(input.purpose, user.id, mediaId, check.extension);
    const presigned = await storage.presignUpload({
      bucket: check.bucket,
      key: storageKey,
      contentType: input.mimeType,
      byteSize: input.byteSize,
      sha256Base64: sha256HexToBase64(input.sha256),
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    await this.prisma.mediaAsset.create({
      data: {
        id: mediaId,
        uploaderId: user.id,
        purpose: input.purpose,
        visibility: check.bucket === 'restricted' ? 'RESTRICTED' : 'QUARANTINE',
        storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        sha256: input.sha256,
      },
    });

    return {
      mediaId,
      kind: check.kind,
      upload: { url: presigned.url, method: presigned.method, headers: presigned.headers },
      expiresAt: presigned.expiresAt.toISOString(),
    };
  }

  /**
   * Proves that every file was uploaded by `ownerId` for `purpose` and is really in storage with the
   * declared size and checksum. Returns the rows in the order given.
   */
  async claim(ownerId: string, mediaIds: readonly string[], purpose: MediaPurpose): Promise<MediaAsset[]> {
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw new BadRequestException({ message: 'The same file was attached twice', code: 'MEDIA_DUPLICATE' });
    }
    if (mediaIds.length === 0) return [];
    const storage = this.requireStorage();

    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: [...mediaIds] } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const assets = mediaIds.map((id) => {
      const asset = byId.get(id);
      if (!asset || asset.uploaderId !== ownerId || asset.purpose !== purpose) {
        throw new BadRequestException({
          message: 'A file could not be found',
          code: 'MEDIA_INVALID',
          mediaId: id,
        });
      }
      if (asset.malwareScan === 'INFECTED' || asset.moderation === 'REJECTED') {
        throw new BadRequestException({
          message: 'A file was rejected',
          code: 'MEDIA_REJECTED',
          mediaId: id,
        });
      }
      return asset;
    });

    await Promise.all(
      assets.map(async (asset) => {
        const stored = await storage.head({ bucket: bucketForPurpose(asset.purpose), key: asset.storageKey });
        const checksumOk =
          stored?.sha256Base64 == null || stored.sha256Base64 === sha256HexToBase64(asset.sha256);
        if (!stored || stored.byteSize !== asset.byteSize || !checksumOk) {
          throw new BadRequestException({
            message: 'A file has not finished uploading',
            code: 'MEDIA_NOT_UPLOADED',
            mediaId: asset.id,
          });
        }
      }),
    );
    return assets;
  }

  /**
   * CDN URL of a file's public copy, or null while there is none: before moderation, and after it
   * until the media worker has written the re-encoded, metadata-free copy (exifStripped). Raw uploads
   * never get a public URL.
   */
  publicUrl(asset: PublicAssetFields): string | null {
    if (
      !this.publicBaseUrl ||
      asset.visibility !== 'PUBLIC' ||
      asset.moderation !== 'APPROVED' ||
      !asset.exifStripped
    ) {
      return null;
    }
    const key = publicKeyFor(asset);
    return key ? `${this.publicBaseUrl}/${key}` : null;
  }

  /** CDN URL of a video's poster frame (written by the media worker with the video), or null. */
  posterUrl(asset: PublicAssetFields): string | null {
    const key = publicKeyFor(asset);
    if (!key || this.kindOf(asset) !== 'VIDEO' || !this.publicUrl(asset)) return null;
    return `${this.publicBaseUrl}/${posterKeyFor(key)}`;
  }

  kindOf(asset: Pick<MediaAsset, 'mimeType'>): MediaKind {
    return mediaKindOf(asset.mimeType) ?? 'IMAGE';
  }

  /** Five-minute link for reviewers. Callers must write an EVIDENCE_VIEWED audit row. */
  viewRestricted(asset: Pick<MediaAsset, 'purpose' | 'storageKey'>): Promise<string> {
    return this.requireStorage().presignDownload({
      bucket: bucketForPurpose(asset.purpose),
      key: asset.storageKey,
      expiresInSeconds: RESTRICTED_VIEW_TTL_SECONDS,
    });
  }
}
