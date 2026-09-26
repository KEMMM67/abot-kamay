// apps/api/src/media/uploads.controller.ts
//
// POST /api/v1/uploads  (signed in)
//   { purpose, mimeType, byteSize, sha256 } -> 201 { mediaId, kind, upload: { url, method, headers }, expiresAt }
// The client then PUTs the file to upload.url with upload.headers, and attaches mediaId to a post,
// KYC check or spending report.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/guards.js';
import { CurrentViewer, type AuthenticatedViewer } from '../auth/viewer.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { MAX_VIDEO_BYTES, UPLOAD_PURPOSES } from './media-policy.js';
import { MediaService, type UploadIntentDto } from './media.service.js';

const CreateUploadSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  mimeType: z.string().trim().toLowerCase().max(100),
  byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, 'sha256 must be 64 hex characters')
    .transform((value) => value.toLowerCase()),
});

@Controller('uploads')
@UseGuards(SessionGuard)
export class UploadsController {
  constructor(private readonly media: MediaService) {}

  @Post()
  create(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Body(new ZodValidationPipe(CreateUploadSchema)) body: z.infer<typeof CreateUploadSchema>,
  ): Promise<UploadIntentDto> {
    return this.media.createUpload(viewer.user, body);
  }
}
