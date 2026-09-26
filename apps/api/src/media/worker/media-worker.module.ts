// apps/api/src/media/worker/media-worker.module.ts
//
// Root module of the media worker process (src/worker.ts): configuration, the database, storage with
// the public bucket, and the transcoder. No HTTP server; it only consumes the outbox.
import { Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateWorkerEnv, type Env } from '../../config/env.schema.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { MEDIA_STORAGE, type MediaStorage } from '../storage/media-storage.js';
import { createS3Client, S3MediaStorage } from '../storage/s3-media-storage.js';
import { MediaPromotionService } from './media-promotion.service.js';
import { FfmpegSharpTranscoder, MEDIA_TRANSCODER, type MediaTranscoder } from './media-transcoder.js';

const workerStorageProvider: Provider = {
  provide: MEDIA_STORAGE,
  inject: [ConfigService],
  // validateWorkerEnv has already refused to start without these buckets.
  useFactory: (config: ConfigService<Env, true>): MediaStorage =>
    new S3MediaStorage(createS3Client(config), {
      quarantine: config.get('MEDIA_QUARANTINE_BUCKET', { infer: true }),
      restricted: config.get('MEDIA_RESTRICTED_BUCKET', { infer: true }),
      public: config.get('MEDIA_PUBLIC_BUCKET', { infer: true }),
    }),
};

const transcoderProvider: Provider = {
  provide: MEDIA_TRANSCODER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): MediaTranscoder =>
    new FfmpegSharpTranscoder({
      ffmpegPath: config.get('FFMPEG_PATH', { infer: true }),
      ffprobePath: config.get('FFPROBE_PATH', { infer: true }),
      heifConvertPath: config.get('HEIF_CONVERT_PATH', { infer: true }),
      videoTimeoutMs: config.get('MEDIA_WORKER_FFMPEG_TIMEOUT_SECONDS', { infer: true }) * 1000,
    }),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateWorkerEnv,
    }),
    PrismaModule,
  ],
  providers: [workerStorageProvider, transcoderProvider, MediaPromotionService],
})
export class MediaWorkerModule {}
