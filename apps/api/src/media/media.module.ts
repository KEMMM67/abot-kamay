// apps/api/src/media/media.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaService } from './media.service.js';
import { mediaStorageProvider } from './storage/s3-media-storage.js';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [mediaStorageProvider, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
