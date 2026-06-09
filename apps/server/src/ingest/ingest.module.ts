import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QueueModule } from '../queue/queue.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [AuthModule, QueueModule, AiModule, EmbeddingsModule],
  controllers: [IngestController],
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
