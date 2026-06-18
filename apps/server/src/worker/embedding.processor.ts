import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import {
  EMBEDDING_QUEUE_NAME,
  REDIS_CONNECTION_OPTIONS,
} from '../queue/queue.constants';
import type {
  EmbeddingQueueJobData,
  EmbeddingQueueJobName,
} from '../queue/queue.types';

/**
 * 消费 lumi-embedding 队列，把文档正文分片后写入 pgvector 向量索引。
 * 实际分片、去重、入库逻辑位于 EmbeddingsService.processEmbeddingJob。
 */
@Injectable()
export class EmbeddingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingProcessor.name);
  private worker?: Worker<EmbeddingQueueJobData, unknown, EmbeddingQueueJobName>;

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    @Inject(REDIS_CONNECTION_OPTIONS)
    private readonly connection: RedisOptions,
  ) {}

  onModuleInit() {
    this.worker = new Worker<EmbeddingQueueJobData, unknown, EmbeddingQueueJobName>(
      EMBEDDING_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `向量索引任务失败 ${job?.data.jobId || 'unknown'}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<EmbeddingQueueJobData, unknown, EmbeddingQueueJobName>) {
    await this.embeddingsService.processEmbeddingJob(job.data.jobId);
  }
}
