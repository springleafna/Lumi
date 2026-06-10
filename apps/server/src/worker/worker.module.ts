import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AiAnalysisProcessor } from './ai-analysis.processor';
import { EmbeddingProcessor } from './embedding.processor';
import { IngestProcessor } from './ingest.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    QueueModule,
    AiModule,
    EmbeddingsModule,
    MediaModule,
  ],
  providers: [IngestProcessor, AiAnalysisProcessor, EmbeddingProcessor],
})
export class WorkerModule {}
