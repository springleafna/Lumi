import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { parseArticleFromHtml } from '@lumi/parser';
import axios from 'axios';
import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import {
  INGEST_QUEUE_NAME,
  REDIS_CONNECTION_OPTIONS,
} from '../queue/queue.constants';
import { QueueService } from '../queue/queue.service';
import type {
  IngestQueueJobData,
  IngestQueueJobName,
} from '../queue/queue.types';
import { validateHtml } from '../ingest/ingest.service';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

@Injectable()
export class IngestProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestProcessor.name);
  private worker?: Worker<IngestQueueJobData, unknown, IngestQueueJobName>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @Inject(REDIS_CONNECTION_OPTIONS)
    private readonly connection: RedisOptions,
  ) {}

  onModuleInit() {
    this.worker = new Worker<IngestQueueJobData, unknown, IngestQueueJobName>(
      INGEST_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: 2,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `导入任务失败 ${job?.data.jobId || 'unknown'}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<IngestQueueJobData, unknown, IngestQueueJobName>) {
    const ingestJob = await this.prisma.ingestJob.findUnique({
      where: { id: job.data.jobId },
      include: { document: true },
    });
    if (!ingestJob || !ingestJob.documentId || !ingestJob.inputUrl) {
      throw new BadRequestException('导入任务不存在或缺少必要信息');
    }

    await this.prisma.$transaction([
      this.prisma.ingestJob.update({
        where: { id: ingestJob.id },
        data: {
          status: 'processing',
          errorMessage: null,
          startedAt: ingestJob.startedAt ?? new Date(),
        },
      }),
      this.prisma.document.update({
        where: { id: ingestJob.documentId },
        data: {
          ingestStatus: 'processing',
          ingestErrorMessage: null,
        },
      }),
    ]);

    try {
      const html =
        ingestJob.type === 'html'
          ? validateHtml(ingestJob.inputHtml || '')
          : await this.fetchHtml(ingestJob.inputUrl);
      const parsed = await parseArticleFromHtml({
        html,
        url: ingestJob.inputUrl,
      });

      if (!parsed.markdown) {
        throw new BadRequestException('未能提取到可保存的正文内容');
      }

      const document = await this.prisma.document.update({
        where: { id: ingestJob.documentId },
        data: {
          title: parsed.title || ingestJob.inputTitle || ingestJob.inputUrl,
          url: ingestJob.inputUrl,
          source: parsed.siteName,
          author: parsed.author,
          excerpt: parsed.excerpt,
          coverImage: parsed.coverImage,
          markdown: parsed.markdown,
          contentText: parsed.contentText,
          wordCount: parsed.wordCount,
          publishedAt: parseDate(parsed.publishedAt),
          ingestStatus: 'succeeded',
          ingestErrorMessage: null,
        },
      });

      await this.prisma.ingestJob.update({
        where: { id: ingestJob.id },
        data: {
          status: 'succeeded',
          documentId: document.id,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });

      await this.enqueueAiAnalysis(document.userId, document.id);
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.$transaction([
        this.prisma.ingestJob.update({
          where: { id: ingestJob.id },
          data: {
            status: 'failed',
            errorMessage: message,
            finishedAt: new Date(),
          },
        }),
        this.prisma.document.update({
          where: { id: ingestJob.documentId },
          data: {
            ingestStatus: 'failed',
            ingestErrorMessage: message,
          },
        }),
      ]);
      throw error;
    }
  }

  private async enqueueAiAnalysis(userId: string, documentId: string) {
    try {
      await this.prisma.aiAnalysis.upsert({
        where: { documentId },
        update: {
          status: 'pending',
          errorMessage: null,
        },
        create: {
          userId,
          documentId,
          status: 'pending',
        },
      });
      await this.queueService.addAiAnalysisJob({ documentId, userId });
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.warn(`AI 分析任务创建失败 ${documentId}: ${message}`);
      try {
        await this.prisma.aiAnalysis.upsert({
          where: { documentId },
          update: {
            status: 'failed',
            errorMessage: `AI 分析任务创建失败：${message}`,
            finishedAt: new Date(),
          },
          create: {
            userId,
            documentId,
            status: 'failed',
            errorMessage: `AI 分析任务创建失败：${message}`,
            finishedAt: new Date(),
          },
        });
      } catch (updateError) {
        this.logger.warn(
          `AI 分析失败状态写入失败 ${documentId}: ${getErrorMessage(updateError)}`,
        );
      }
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get<string>(url, {
      timeout: 15000,
      responseType: 'text',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      transformResponse: [(data) => data],
    });

    if (typeof response.data !== 'string' || !response.data.trim()) {
      throw new BadRequestException('网页响应为空');
    }

    return response.data;
  }
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
