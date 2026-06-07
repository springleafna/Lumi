import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  IngestHtmlRequest,
  IngestHtmlResponse,
  IngestUrlRequest,
  IngestUrlResponse,
  RetryIngestResponse,
} from '@lumi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { toDocumentDetail, toIngestJobDto } from '../documents/document.mapper';

export const MAX_HTML_BYTES = 5 * 1024 * 1024;

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async ingestUrl(
    userId: string,
    input: IngestUrlRequest,
  ): Promise<IngestUrlResponse> {
    const url = normalizeUrl(input.url);
    return this.createQueuedIngest({
      userId,
      url,
      type: 'url',
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
      type: 'html',
      title: input.title?.trim(),
      html,
    });
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
    const canReuseHtml =
      latestFailedJob?.type === 'html' && Boolean(latestFailedJob.inputHtml);
    const jobType = canReuseHtml ? 'html' : 'url';
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
      jobType === 'html' ? 'ingest:html' : 'ingest:url',
      { jobId: job.id },
    );

    return {
      document: toDocumentDetail(updatedDocument),
      job: toIngestJobDto(job),
    };
  }

  private async createQueuedIngest(input: {
    userId: string;
    url: string;
    type: 'url' | 'html';
    title?: string;
    html?: string;
  }): Promise<IngestUrlResponse> {
    const existing = await this.prisma.document.findFirst({
      where: {
        userId: input.userId,
        url: input.url,
      },
      include: documentIncludeForIngest,
    });

    if (existing && !existing.deletedAt && existing.ingestStatus === 'succeeded') {
      const job = await this.prisma.ingestJob.create({
        data: {
          userId: input.userId,
          inputUrl: input.url,
          inputTitle: input.title,
          type: input.type,
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
            type: 'article',
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
        type: input.type,
        status: 'pending',
        documentId: document.id,
      },
    });

    await this.queueService.addIngestJob(input.type === 'html' ? 'ingest:html' : 'ingest:url', {
      jobId: job.id,
    });

    return {
      document: toDocumentDetail(document),
      job: toIngestJobDto(job),
    };
  }
}

export function validateHtml(value: string): string {
  const html = value?.trim();
  if (!html) {
    throw new BadRequestException('页面内容为空');
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new BadRequestException('页面内容过大，暂不支持保存');
  }

  return html;
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
