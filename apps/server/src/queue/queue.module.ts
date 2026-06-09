import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import {
  AI_ANALYSIS_QUEUE,
  AI_ANALYSIS_QUEUE_NAME,
  EMBEDDING_QUEUE,
  EMBEDDING_QUEUE_NAME,
  INGEST_QUEUE,
  INGEST_QUEUE_NAME,
  REDIS_CONNECTION_OPTIONS,
} from './queue.constants';
import { QueueService } from './queue.service';
import type {
  AiAnalysisQueueJobData,
  EmbeddingQueueJobData,
  EmbeddingQueueJobName,
  IngestQueueJobData,
  IngestQueueJobName,
} from './queue.types';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CONNECTION_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        parseRedisUrl(configService.get<string>('REDIS_URL') || 'redis://127.0.0.1:6379'),
    },
    {
      provide: INGEST_QUEUE,
      inject: [REDIS_CONNECTION_OPTIONS],
      useFactory: (connection: RedisOptions) =>
        new Queue<IngestQueueJobData, unknown, IngestQueueJobName>(INGEST_QUEUE_NAME, {
          connection,
        }),
    },
    {
      provide: AI_ANALYSIS_QUEUE,
      inject: [REDIS_CONNECTION_OPTIONS],
      useFactory: (connection: RedisOptions) =>
        new Queue<AiAnalysisQueueJobData>(AI_ANALYSIS_QUEUE_NAME, {
          connection,
        }),
    },
    {
      provide: EMBEDDING_QUEUE,
      inject: [REDIS_CONNECTION_OPTIONS],
      useFactory: (connection: RedisOptions) =>
        new Queue<EmbeddingQueueJobData, unknown, EmbeddingQueueJobName>(EMBEDDING_QUEUE_NAME, {
          connection,
        }),
    },
    QueueService,
  ],
  exports: [REDIS_CONNECTION_OPTIONS, QueueService],
})
export class QueueModule {}

function parseRedisUrl(value: string): RedisOptions {
  const url = new URL(value);
  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    username: decodeRedisCredential(url.username),
    password: decodeRedisCredential(url.password),
    db: url.pathname ? Number(url.pathname.replace('/', '') || 0) : 0,
    maxRetriesPerRequest: null,
  };
}

function decodeRedisCredential(value: string): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}
