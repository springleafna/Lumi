import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { AiService } from '../ai/ai.service';
import {
  AI_ANALYSIS_QUEUE_NAME,
  REDIS_CONNECTION_OPTIONS,
} from '../queue/queue.constants';
import type { AiAnalysisQueueJobData } from '../queue/queue.types';

/**
 * 消费 lumi-ai-analysis 队列，对单篇文档执行结构化 AI 分析。
 * 实际分析逻辑位于 AiService.analyzeDocument，本类只负责 Worker 生命周期与失败日志。
 */
@Injectable()
export class AiAnalysisProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAnalysisProcessor.name);
  private worker?: Worker<AiAnalysisQueueJobData>;

  constructor(
    private readonly aiService: AiService,
    @Inject(REDIS_CONNECTION_OPTIONS)
    private readonly connection: RedisOptions,
  ) {}

  onModuleInit() {
    this.worker = new Worker<AiAnalysisQueueJobData>(
      AI_ANALYSIS_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `AI 分析任务失败 ${job?.data.documentId || 'unknown'}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<AiAnalysisQueueJobData>) {
    await this.aiService.analyzeDocument(job.data.userId, job.data.documentId);
  }
}
