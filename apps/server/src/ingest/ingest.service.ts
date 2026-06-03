import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import type { IngestUrlRequest, IngestUrlResponse } from '@lumi/shared';
import { parseArticleFromHtml } from '@lumi/parser';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentDetail, toIngestJobDto } from '../documents/document.mapper';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestUrl(
    userId: string,
    input: IngestUrlRequest,
  ): Promise<IngestUrlResponse> {
    const url = normalizeUrl(input.url);
    const job = await this.prisma.ingestJob.create({
      data: {
        userId,
        inputUrl: url,
        status: 'pending',
      },
    });

    try {
      await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: { status: 'processing', startedAt: new Date() },
      });

      const existing = await this.prisma.document.findFirst({
        where: { userId, url },
      });

      if (existing && !existing.deletedAt) {
        const finishedJob = await this.prisma.ingestJob.update({
          where: { id: job.id },
          data: {
            status: 'succeeded',
            documentId: existing.id,
            finishedAt: new Date(),
          },
        });

        return {
          document: toDocumentDetail(existing),
          job: toIngestJobDto(finishedJob),
        };
      }

      const html = await this.fetchHtml(url);
      const parsed = await parseArticleFromHtml({ html, url });
      if (!parsed.markdown) {
        throw new BadRequestException('未能提取到可保存的正文内容');
      }

      const documentData = {
        title: parsed.title || url,
        url,
        source: parsed.siteName,
        author: parsed.author,
        excerpt: parsed.excerpt,
        coverImage: parsed.coverImage,
        markdown: parsed.markdown,
        contentText: parsed.contentText,
        wordCount: parsed.wordCount,
        publishedAt: parseDate(parsed.publishedAt),
        deletedAt: null,
      };

      const document = existing
        ? await this.prisma.document.update({
            where: { id: existing.id },
            data: documentData,
          })
        : await this.prisma.document.create({
            data: {
              ...documentData,
              userId,
              type: 'article',
            },
          });

      const finishedJob = await this.prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          documentId: document.id,
          finishedAt: new Date(),
        },
      });

      return {
        document: toDocumentDetail(document),
        job: toIngestJobDto(finishedJob),
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

      throw new BadRequestException(`导入失败：${message}`);
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

function normalizeUrl(value: string): string {
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

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
