import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue, JobsOptions } from 'bullmq';
import {
  AI_ANALYSIS_QUEUE,
  INGEST_QUEUE,
} from './queue.constants';
import type {
  AiAnalysisQueueJobData,
  IngestQueueJobData,
  IngestQueueJobName,
} from './queue.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  constructor(
    private readonly configService: ConfigService,
    @Inject(INGEST_QUEUE)
    private readonly ingestQueue: Queue<IngestQueueJobData, unknown, IngestQueueJobName>,
    @Inject(AI_ANALYSIS_QUEUE)
    private readonly aiAnalysisQueue: Queue<AiAnalysisQueueJobData>,
  ) {}

  async addIngestJob(name: IngestQueueJobName, data: IngestQueueJobData) {
    return this.ingestQueue.add(name, data, {
      attempts: this.getNumber('INGEST_JOB_ATTEMPTS', 3),
      backoff: this.backoff(),
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async addAiAnalysisJob(data: AiAnalysisQueueJobData) {
    return this.aiAnalysisQueue.add('ai:analyze-document', data, {
      attempts: this.getNumber('AI_JOB_ATTEMPTS', 2),
      backoff: this.backoff(),
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.ingestQueue.close(), this.aiAnalysisQueue.close()]);
  }

  private backoff(): JobsOptions['backoff'] {
    return {
      type: 'exponential',
      delay: this.getNumber('JOB_BACKOFF_DELAY_MS', 5000),
    };
  }

  private getNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
