import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { parseArticleFromHtml } from '@lumi/parser';
import axios from 'axios';
import { Worker, type Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { AiProviderService } from '../ai/ai-provider.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { MediaArchiveService } from '../media/media-archive.service';
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
import { validateHtml } from '../ingest/ingest.validation';
import { getErrorMessage } from '../common/error.utils';
import { parseDate } from '../common/date.utils';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * 消费 lumi-ingest 队列，把占位文档推进为解析完成状态。
 *
 * 主要流程：
 * 1. 抓取或校验 HTML，调用 @lumi/parser 提取正文
 * 2. 对正文图片做 RustFS 归档（best-effort，对象存储未配置时跳过）
 * 3. 在事务内更新文档与媒体资产、推进 IngestJob 状态
 * 4. 清理上一轮归档产生的孤儿对象
 * 5. 入队 AI 分析与 Embedding 索引
 *
 * 失败时按 best-effort 写回失败状态，不阻断队列重试。
 */
@Injectable()
export class IngestProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestProcessor.name);
  private worker?: Worker<IngestQueueJobData, unknown, IngestQueueJobName>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly aiProviderService: AiProviderService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly mediaArchiveService: MediaArchiveService,
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
    // 先读取占位文档与任务输入；缺少必要信息直接失败，避免无意义的抓取。
    const ingestJob = await this.prisma.ingestJob.findUnique({
      where: { id: job.data.jobId },
      include: { document: true },
    });
    if (!ingestJob || !ingestJob.documentId || !ingestJob.inputUrl) {
      throw new BadRequestException('导入任务不存在或缺少必要信息');
    }
    const documentId = ingestJob.documentId;
    const inputUrl = ingestJob.inputUrl;

    try {
      await this.markIngestProcessing(ingestJob.id, documentId, ingestJob.startedAt);

      const html =
        ingestJob.type === 'html'
          ? validateHtml(ingestJob.inputHtml || '')
          : await this.fetchHtml(inputUrl);
      const parsed = await parseArticleFromHtml({
        html,
        url: inputUrl,
      });

      if (!parsed.markdown) {
        throw new BadRequestException('未能提取到可保存的正文内容');
      }

      const media = await this.archiveMediaBestEffort({
        userId: ingestJob.userId,
        documentId,
        articleUrl: inputUrl,
        markdown: parsed.markdown,
        coverImage: parsed.coverImage,
        images: parsed.images,
      });

      const previousObjectKeys = await this.prisma.documentMediaAsset.findMany({
        where: {
          documentId,
          status: 'succeeded',
          objectKey: { not: null },
        },
        select: { objectKey: true },
      });
      const nextObjectKeys = new Set(
        media.assets
          .map((asset) => asset.objectKey)
          .filter((key): key is string => typeof key === 'string' && key.length > 0),
      );

      // 事务保证文档正文、媒体资产记录与任务状态一起落库，避免半成品状态。
      const document = await this.prisma.$transaction(
        async (tx) => {
          const updatedDocument = await tx.document.update({
            where: { id: documentId },
            data: {
              title: parsed.title || ingestJob.inputTitle || inputUrl,
              url: inputUrl,
              source: parsed.siteName,
              author: parsed.author,
              excerpt: parsed.excerpt,
              coverImage: media.coverImage,
              markdown: media.markdown,
              contentText: parsed.contentText,
              wordCount: parsed.wordCount,
              publishedAt: parseDate(parsed.publishedAt),
              ingestStatus: 'succeeded',
              ingestErrorMessage: null,
            },
          });

          await tx.documentMediaAsset.deleteMany({
            where: { documentId },
          });
          if (media.assets.length > 0) {
            await tx.documentMediaAsset.createMany({
              data: media.assets,
            });
          }

          await tx.ingestJob.update({
            where: { id: ingestJob.id },
            data: {
              status: 'succeeded',
              documentId: updatedDocument.id,
              errorMessage: null,
              finishedAt: new Date(),
            },
          });

          return updatedDocument;
        },
        { timeout: 15000 },
      );

      await this.mediaArchiveService.deleteObjectsBestEffort(
        previousObjectKeys
          .map((asset) => asset.objectKey)
          .filter((key) => key && !nextObjectKeys.has(key)),
      );

      // 入库成功后再触发下游 AI 分析与 Embedding 索引；二者各自 best-effort，互不阻塞。
      await this.enqueueAiAnalysis(document.userId, document.id);
      await this.embeddingsService.enqueueDocumentIndexBestEffort(document.userId, document.id);
    } catch (error) {
      const message = getErrorMessage(error);
      await this.markIngestFailedBestEffort(ingestJob.id, documentId, message);
      throw error;
    }
  }

  private async markIngestProcessing(
    ingestJobId: string,
    documentId: string,
    startedAt?: Date | null,
  ) {
    await Promise.all([
      this.prisma.ingestJob.update({
        where: { id: ingestJobId },
        data: {
          status: 'processing',
          errorMessage: null,
          startedAt: startedAt ?? new Date(),
        },
      }),
      this.prisma.document.update({
        where: { id: documentId },
        data: {
          ingestStatus: 'processing',
          ingestErrorMessage: null,
        },
      }),
    ]);
  }

  private async markIngestFailedBestEffort(
    ingestJobId: string,
    documentId: string,
    message: string,
  ) {
    const results = await Promise.allSettled([
      this.prisma.ingestJob.update({
        where: { id: ingestJobId },
        data: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      }),
      this.prisma.document.update({
        where: { id: documentId },
        data: {
          ingestStatus: 'failed',
          ingestErrorMessage: message,
        },
      }),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`导入失败状态写入失败 ${documentId}: ${getErrorMessage(result.reason)}`);
      }
    }
  }

  private async enqueueAiAnalysis(userId: string, documentId: string) {
    try {
      await this.aiProviderService.getChatConfig();
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
      if (message.includes('请先配置 AI')) {
        this.logger.warn(`AI 未配置，跳过自动分析 ${documentId}`);
        return;
      }
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

  private async archiveMediaBestEffort(input: {
    userId: string;
    documentId: string;
    articleUrl: string;
    markdown: string;
    coverImage?: string | null;
    images?: Awaited<ReturnType<typeof parseArticleFromHtml>>['images'];
  }) {
    try {
      return await this.mediaArchiveService.archiveArticleMedia(input);
    } catch (error) {
      this.logger.warn(
        `图片归档流程跳过 ${input.documentId}: ${getErrorMessage(error)}`,
      );
      return {
        markdown: input.markdown,
        coverImage: input.coverImage,
        assets: [],
      };
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
