// apps/api/src/worker.ts
//
// AbotKamay media worker: `node dist/worker.js` (a Render or Railway background worker, same image as
// the API). It turns moderated uploads into the public copies the feed shows: re-encoded, stripped of
// GPS and every other piece of metadata, H.264 MP4 for video (see src/media/worker/).
//
// Needs ffmpeg, ffprobe and heif-convert on PATH (the Dockerfile installs them), the quarantine and
// public buckets, and the database. On SIGTERM it stops taking new files and finishes the current one;
// give it time to (maxShutdownDelaySeconds in render.yaml). An interrupted file is retried later.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MediaPromotionService } from './media/worker/media-promotion.service.js';
import { MediaWorkerModule } from './media/worker/media-worker.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MediaWorkerModule);
  const logger = new Logger('AbotKamay');
  const stop = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      logger.log(`${signal} received: finishing the current file, then stopping`);
      stop.abort();
    });
  }

  await app.get(MediaPromotionService).run(stop.signal);
  await app.close();
}

await bootstrap();
