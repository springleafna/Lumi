import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  IngestFileResponse,
  IngestHtmlRequest,
  IngestHtmlResponse,
  IngestSelectionRequest,
  IngestSelectionResponse,
  IngestUrlRequest,
  IngestUrlResponse,
  RetryIngestResponse,
} from '@lumi/shared';
import {
  parseFragmentToMarkdown,
  parseMarkdownDocument,
  parseTextDocument,
} from '@lumi/parser';
import { AiProviderService } from '../ai/ai-provider.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { toDocumentDetail, toIngestJobDto } from '../documents/document.mapper';
import {
  MAX_FILE_BYTES,
  MAX_SELECTION_BYTES,
  validateHtml,
} from './ingest.validation';
import { getErrorMessage } from '../common/error.utils';
import {
  canonicalBilibiliVideoUrl,
  detectBilibiliVideo,
  expandBilibiliShortLink,
  isBilibiliShortLink,
  type BilibiliVideoRef,
} from './bilibili.utils';

export type UploadedTextFile = {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype?: string;
};

/**
 * 文章导入入口服务。
 *
 * URL / HTML 导入是异步的：先创建占位文档与 IngestJob 并入队，由 Worker
 * 完成抓取、解析和媒体归档。URL 导入会按规范化 URL 做重复检测；文件与
 * 选中内容导入则直接产出完成态文档，不走队列。
 */
@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly aiProviderService: AiProviderService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async ingestUrl(
    userId: string,
    input: IngestUrlRequest,
  ): Promise<IngestUrlResponse> {
    const url = normalizeUrl(input.url);
    const { video, effectiveUrl } = await this.resolveImportTarget(url);

    if (video) {
      return this.createQueuedIngest({
        userId,
        url: canonicalBilibiliVideoUrl(video),
        jobType: 'video',
        documentType: 'video',
      });
    }

    return this.createQueuedIngest({
      userId,
      url: effectiveUrl,
      jobType: 'url',
      documentType: 'article',
    });
  }

  async ingestHtml(
    userId: string,
    input: IngestHtmlRequest,
  ): Promise<IngestHtmlResponse> {
    const url = normalizeUrl(input.url);
    const html = validateHtml(input.html);

    return this.createQueuedIngest({
      userId,
      url,
      jobType: 'html',
      documentType: 'article',
      title: input.title?.trim(),
      html,
    });
  }

  async ingestFile(userId: string, file?: UploadedTextFile): Promise<IngestFileResponse> {
    const job = await this.prisma.ingestJob.create({
      data: {
        userId,
        type: 'file',
        status: 'processing',
        inputTitle: file?.originalname,
        startedAt: new Date(),
      },
    });

    try {
      const parsed = this.parseUploadedFile(file);
      const document = await this.prisma.document.create({
        data: {
          userId,
          type: 'article',
          title: parsed.title,
          source: '本地',
          markdown: parsed.markdown,
          contentText: parsed.contentText,
          wordCount: parsed.wordCount,
          ingestStatus: 'succeeded',
        },
        include: documentIncludeForIngest,
      });

      const updatedJob = await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          documentId: document.id,
          finishedAt: new Date(),
        },
      });

      await this.enqueueAiAnalysisBestEffort(userId, document.id);
      await this.embeddingsService.enqueueDocumentIndexBestEffort(userId, document.id);

      return {
        document: toDocumentDetail(document),
        job: toIngestJobDto(updatedJob),
      };
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async ingestSelection(
    userId: string,
    input: IngestSelectionRequest,
  ): Promise<IngestSelectionResponse> {
    const selectedHtml = input.selectedHtml?.trim() || '';
    const selectedText = input.selectedText?.trim() || '';
    // 手机端分享进来的纯文本没有来源页，url 允许缺省。
    const url = input.url?.trim() ? normalizeUrl(input.url) : '';
    const title = input.title?.trim() || selectionTitleFallback(selectedText, url);
    validateSelection(selectedHtml, selectedText);

    const job = await this.prisma.ingestJob.create({
      data: {
        userId,
        type: 'selection',
        status: 'processing',
        inputUrl: url || null,
        inputTitle: title,
        inputHtml: selectedHtml || selectedText,
        startedAt: new Date(),
      },
    });

    try {
      const parsed = await parseFragmentToMarkdown({
        url,
        html: selectedHtml,
        text: selectedText,
      });
      if (!parsed.markdown && !parsed.contentText) {
        throw new BadRequestException('请先在页面中选中内容');
      }

      const document = await this.prisma.document.create({
        data: {
          userId,
          type: 'fragment',
          title: `摘录：${title}`,
          url: url || null,
          source: parsed.siteName || getSourceFromUrl(url) || '分享',
          markdown: parsed.markdown,
          contentText: parsed.contentText,
          wordCount: parsed.wordCount,
          ingestStatus: 'succeeded',
        },
        include: documentIncludeForIngest,
      });

      const updatedJob = await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          documentId: document.id,
          finishedAt: new Date(),
        },
      });

      await this.embeddingsService.enqueueDocumentIndexBestEffort(userId, document.id);

      return {
        document: toDocumentDetail(document),
        job: toIngestJobDto(updatedJob),
      };
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async retryDocumentIngest(
    userId: string,
    documentId: string,
  ): Promise<RetryIngestResponse> {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
        ingestStatus: 'failed',
      },
    });
    if (!document) {
      throw new NotFoundException('文章不存在或当前状态不支持重试');
    }
    if (!document.url) {
      throw new BadRequestException('缺少原始 URL，无法重新解析');
    }

    const latestFailedJob = await this.prisma.ingestJob.findFirst({
      where: {
        userId,
        documentId,
        status: 'failed',
      },
      orderBy: { createdAt: 'desc' },
    });
    // 视频没有可复用的 HTML 快照，失败后仍走 ingest:video 重新解析
    const canReuseHtml =
      document.type !== 'video' &&
      latestFailedJob?.type === 'html' &&
      Boolean(latestFailedJob.inputHtml);
    const jobType = document.type === 'video' ? 'video' : canReuseHtml ? 'html' : 'url';
    const job = await this.prisma.ingestJob.create({
      data: {
        userId,
        documentId,
        inputUrl: document.url,
        inputTitle: document.title,
        inputHtml: canReuseHtml ? latestFailedJob.inputHtml : undefined,
        type: jobType,
        status: 'pending',
      },
    });

    const updatedDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        ingestStatus: 'pending',
        ingestErrorMessage: null,
      },
      include: documentIncludeForIngest,
    });

    await this.queueService.addIngestJob(
      jobType === 'video' ? 'ingest:video' : jobType === 'html' ? 'ingest:html' : 'ingest:url',
      { jobId: job.id },
    );

    return {
      document: toDocumentDetail(updatedDocument),
      job: toIngestJobDto(job),
    };
  }

  /**
   * 判断导入目标是否为 B 站视频。短链（b23.tv）先同步展开为最终地址：
   * 指向视频页时进入视频管线，指向其他内容（如专栏）时按文章导入展开后的
   * 真实地址；展开失败直接报错。
   */
  private async resolveImportTarget(url: string): Promise<{
    video: BilibiliVideoRef | null;
    effectiveUrl: string;
  }> {
    if (!isBilibiliShortLink(url)) {
      return { video: detectBilibiliVideo(url), effectiveUrl: url };
    }

    const expanded = await expandBilibiliShortLink(url);
    return { video: detectBilibiliVideo(expanded), effectiveUrl: expanded };
  }

  private async createQueuedIngest(input: {
    userId: string;
    url: string;
    jobType: 'url' | 'html' | 'video';
    documentType: 'article' | 'video';
    title?: string;
    html?: string;
  }): Promise<IngestUrlResponse> {
    const existing = await this.prisma.document.findFirst({
      where: {
        userId: input.userId,
        url: input.url,
        type: input.documentType,
      },
      include: documentIncludeForIngest,
    });

    if (existing && !existing.deletedAt && existing.ingestStatus === 'succeeded') {
      const job = await this.prisma.ingestJob.create({
        data: {
          userId: input.userId,
          inputUrl: input.url,
          inputTitle: input.title,
          type: input.jobType,
          status: 'succeeded',
          documentId: existing.id,
          finishedAt: new Date(),
        },
      });

      return {
        document: toDocumentDetail(existing),
        job: toIngestJobDto(job),
      };
    }

    const document = existing
      ? await this.prisma.document.update({
          where: { id: existing.id },
          data: {
            title: input.title || existing.title || input.url,
            deletedAt: null,
            ingestStatus: 'pending',
            ingestErrorMessage: null,
          },
          include: documentIncludeForIngest,
        })
      : await this.prisma.document.create({
          data: {
            userId: input.userId,
            type: input.documentType,
            title: input.title || input.url,
            url: input.url,
            markdown: '',
            ingestStatus: 'pending',
          },
          include: documentIncludeForIngest,
        });

    const job = await this.prisma.ingestJob.create({
      data: {
        userId: input.userId,
        inputUrl: input.url,
        inputTitle: input.title,
        inputHtml: input.html,
        type: input.jobType,
        status: 'pending',
        documentId: document.id,
      },
    });

    const jobName =
      input.jobType === 'video'
        ? 'ingest:video'
        : input.jobType === 'html'
          ? 'ingest:html'
          : 'ingest:url';
    await this.queueService.addIngestJob(jobName, {
      jobId: job.id,
    });

    return {
      document: toDocumentDetail(document),
      job: toIngestJobDto(job),
    };
  }

  private parseUploadedFile(file?: UploadedTextFile) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    if (file.size > MAX_FILE_BYTES || file.buffer.byteLength > MAX_FILE_BYTES) {
      throw new BadRequestException('文件内容过大，暂不支持保存');
    }

    const filename = file.originalname || '未命名文档';
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension !== 'md' && extension !== 'txt') {
      throw new BadRequestException('仅支持 .md 和 .txt 文件');
    }

    const content = decodeUtf8(file.buffer);
    if (!content.trim()) {
      throw new BadRequestException('文件内容为空');
    }

    return extension === 'md'
      ? parseMarkdownDocument({ filename, content })
      : parseTextDocument({ filename, content });
  }

  private async enqueueAiAnalysisBestEffort(userId: string, documentId: string) {
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
      await this.queueService.addAiAnalysisJob({ userId, documentId });
    } catch (error) {
      if (getErrorMessage(error).includes('请先配置 AI')) {
        return;
      }
    }
  }
}

export function normalizeUrl(value: string): string {
  const raw = value?.trim();
  if (!raw) {
    throw new BadRequestException('请输入 URL');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('URL 格式不正确');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('仅支持 http 或 https URL');
  }

  return url.toString();
}

function validateSelection(selectedHtml: string, selectedText: string) {
  if (!selectedHtml && !selectedText) {
    throw new BadRequestException('请先在页面中选中内容');
  }

  const size = Buffer.byteLength(selectedHtml || selectedText, 'utf8');
  if (size > MAX_SELECTION_BYTES) {
    throw new BadRequestException('选中内容过大，暂不支持保存');
  }
}

/** 无来源 URL 的选区（手机端分享文本）用正文首行作为标题兜底。 */
function selectionTitleFallback(selectedText: string, url: string): string {
  if (url) return url;
  const line = selectedText
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  return line ? line.slice(0, 30) : '分享文本';
}

function decodeUtf8(buffer: Buffer): string {
  const content = buffer.toString('utf8');
  if (content.includes('\uFFFD')) {
    throw new BadRequestException('文件编码暂不支持');
  }
  return content.replace(/^\uFEFF/, '');
}

function getSourceFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export const documentIncludeForIngest = {
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        name: 'asc' as const,
      },
    },
  },
  aiAnalysis: true,
};
