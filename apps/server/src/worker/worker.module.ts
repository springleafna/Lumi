import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AiAnalysisProcessor } from './ai-analysis.processor';
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
  ],
  providers: [IngestProcessor, AiAnalysisProcessor],
})
export class WorkerModule {}
