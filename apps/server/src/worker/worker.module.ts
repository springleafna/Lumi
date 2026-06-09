import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
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
  ],
  providers: [IngestProcessor, AiAnalysisProcessor, EmbeddingProcessor],
})
export class WorkerModule {}
