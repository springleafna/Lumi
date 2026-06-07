import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngestModule } from '../ingest/ingest.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule, IngestModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
