import { Module } from '@nestjs/common';
import { MediaArchiveService } from './media-archive.service';

@Module({
  providers: [MediaArchiveService],
  exports: [MediaArchiveService],
})
export class MediaModule {}
