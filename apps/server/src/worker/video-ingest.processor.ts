import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import type { IngestQueueJobData, IngestQueueJobName } from '../queue/queue.types';
import { AiProviderService } from '../ai/ai-provider.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { getErrorMessage } from '../common/error.utils';
import { BilibiliService } from '../video/bilibili.service';
import { YtDlpService, type YtDlpMetadata } from '../video/ytdlp.service';
import {
  pickPreferredSubtitleLang,
  subtitleProvider,
  type SubtitleProvider,
} from '../video/subtitle.utils';
import {
  normalizeSegments,
  parseSubtitleFile,
  type TranscriptSegment,
} from '../video/transcript.utils';

const DEFAULT_MAX_DURATION_MINUTES = 60;

// 首选字幕候选语言：CC 中文优先，其次 B 站 AI 中文字幕
const PREFERRED_SUBTITLE_LANGS = ['zh-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-Hant', 'ai-zh'];

/** yt-dlp 字幕文件命名：`<模板>.<语言>.<扩展名>`，如 sub.ai-zh.srt */
function fileLanguage(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() || '';
  const withoutExt = base.replace(/\.(srt|vtt)$/i, '');
  return withoutExt.split('.').slice(1).join('.') || withoutExt;
}


/**
 * 处理 ingest:video 任务：B 站视频 → 元数据 + 字幕 → Transcript 落库。
 *
 * 与文章管线不同，视频文档的 markdown（总结）由 AI 分析阶段产出；
 * 本处理器只负责拿到可用的 Transcript 并写入视频元数据。
 * Cookie 过期 / 无字幕 / 超时长均按解析失败处理，文案见方案文档 §9.5。
 *
 * Worker 实例由 IngestProcessor 统一创建并按 job.name 分发到这里，
 * 本类不再自建 Worker，避免同一队列出现多个消费者。
 */
@Injectable()
export class VideoIngestProcessor {
  private readonly logger = new Logger(VideoIngestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly aiProviderService: AiProviderService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly ytdlpService: YtDlpService,
    private readonly bilibiliService: BilibiliService,
    private readonly configService: ConfigService,
  ) {}

  async process(job: Job<IngestQueueJobData, unknown, IngestQueueJobName>) {
    const ingestJob = await this.prisma.ingestJob.findUnique({
      where: { id: job.data.jobId },
      include: { document: true },
    });
    if (!ingestJob || !ingestJob.documentId || !ingestJob.inputUrl) {
      throw new BadRequestException('导入任务不存在或缺少必要信息');
    }
    if (ingestJob.document?.type !== 'video') {
      throw new BadRequestException('视频解析任务指向了非视频文档');
    }
    const documentId = ingestJob.documentId;
    const videoUrl = ingestJob.inputUrl;

    try {
      await this.markIngestProcessing(ingestJob.id, documentId, ingestJob.startedAt);

      // Cookie 过期不会让 yt-dlp 报错（只是拿不到字幕），先主动探测登录态
      await this.bilibiliService.assertLoginAlive();

      const metadata = await this.ytdlpService.fetchMetadata(videoUrl);
      this.assertDurationWithinLimit(metadata);

      const tmpDir = await mkdtemp(join(tmpdir(), 'lumi-video-'));
      let segments: TranscriptSegment[];
      let provider: SubtitleProvider;
      let transcriptLanguage: string;
      try {
        // B 站字幕是懒提取（-J 元数据里为空），必须由下载调用触发提取。
        // 先用候选语言列表尝试，拿不到再全量下载一次兜底。
        let files = await this.ytdlpService.downloadSubtitles(
          videoUrl,
          PREFERRED_SUBTITLE_LANGS,
          join(tmpDir, 'sub'),
        );
        if (!files.length) {
          files = await this.ytdlpService.downloadSubtitles(
            videoUrl,
            ['all'],
            join(tmpDir, 'sub'),
          );
        }

        const lang = pickPreferredSubtitleLang(files.map(fileLanguage));
        if (!lang) {
          throw new BadRequestException('未找到可用字幕（视频无字幕，或 Cookie 已过期）');
        }
        provider = subtitleProvider(lang);
        transcriptLanguage = lang;
        const content = await readFile(
          files.find((file) => fileLanguage(file) === lang)!,
          'utf8',
        );
        segments = normalizeSegments(parseSubtitleFile(content));
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
      if (!segments.length) {
        throw new BadRequestException('未找到可用字幕（视频无字幕，或 Cookie 已过期）');
      }

      const document = await this.prisma.$transaction(
        async (tx) => {
          const updatedDocument = await tx.document.update({
            where: { id: documentId },
            data: {
              title: metadata.title || ingestJob.inputTitle || videoUrl,
              author: metadata.uploader || undefined,
              source: '哔哩哔哩',
              coverImage: metadata.thumbnail || undefined,
              videoPlatform: 'bilibili',
              videoDurationSeconds: metadata.duration
                ? Math.round(metadata.duration)
                : null,
              ingestStatus: 'succeeded',
              ingestErrorMessage: null,
            },
          });

          await tx.videoTranscript.upsert({
            where: { documentId },
            update: {
              provider,
              language: transcriptLanguage,
              segments,
              fetchedAt: new Date(),
            },
            create: {
              documentId,
              provider,
              language: transcriptLanguage,
              segments,
            },
          });

          await tx.ingestJob.update({
            where: { id: ingestJob.id },
            data: {
              status: 'succeeded',
              errorMessage: null,
              finishedAt: new Date(),
            },
          });

          return updatedDocument;
        },
        { timeout: 15000 },
      );

      // 总结由 AI 分析阶段产出（ai-analysis 感知 type=video）；
      // embedding 先索引总结 Markdown，Transcript 全文分块索引属 M3。
      await this.enqueueAiAnalysis(document.userId, document.id);
      await this.embeddingsService.enqueueDocumentIndexBestEffort(document.userId, document.id);
    } catch (error) {
      const message = getErrorMessage(error);
      await this.markIngestFailedBestEffort(ingestJob.id, documentId, message);
      throw error;
    }
  }

  private assertDurationWithinLimit(metadata: YtDlpMetadata): void {
    if (metadata.is_live) {
      throw new BadRequestException('直播或尚未开播的视频暂不支持导入');
    }
    if (!metadata.duration || metadata.duration <= 0) {
      throw new BadRequestException('未能获取视频时长，暂不支持导入');
    }

    const configured = Number(
      this.configService.get<string>('VIDEO_MAX_DURATION_MINUTES'),
    );
    const maxMinutes =
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_MAX_DURATION_MINUTES;
    if (metadata.duration > maxMinutes * 60) {
      throw new BadRequestException(`视频时长超过 ${maxMinutes} 分钟上限，暂不支持导入`);
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
        this.logger.warn(`失败状态写入失败 ${documentId}: ${getErrorMessage(result.reason)}`);
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
    }
  }
}

