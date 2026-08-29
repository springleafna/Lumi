import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { CreateAiConversationRequest } from '@lumi/shared';
import { AiProviderService } from './ai-provider.service';
import { buildAnalysisMessages } from './prompts/analysis';
import { buildDocumentQuestionMessages } from './prompts/document-question';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  toAiAnalysisDto,
  toAiConversationDto,
} from '../documents/document.mapper';
import { getErrorMessage } from '../common/error.utils';
import { truncate } from '../common/text.utils';

type AnalysisPayload = {
  oneSentenceSummary?: string;
  summary?: string;
  keyPoints?: string[];
  concepts?: string[];
  actions?: string[];
  audience?: string;
  tags?: string[];
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly providerService: AiProviderService,
  ) {}

  async getAnalysis(userId: string, documentId: string) {
    await this.ensureOwnedDocument(userId, documentId);
    const analysis = await this.prisma.aiAnalysis.findUnique({
      where: { documentId },
    });
    return analysis ? toAiAnalysisDto(analysis) : null;
  }

  async retryAnalysis(userId: string, documentId: string) {
    const document = await this.ensureOwnedDocument(userId, documentId);
    if (document.ingestStatus !== 'succeeded') {
      throw new BadRequestException('文章解析完成后才能生成 AI 分析');
    }

    await this.providerService.getChatConfig();

    const analysis = await this.prisma.aiAnalysis.upsert({
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
    return { analysis: toAiAnalysisDto(analysis) };
  }

  async analyzeDocument(userId: string, documentId: string) {
    const document = await this.ensureOwnedDocument(userId, documentId);
    if (document.ingestStatus !== 'succeeded') {
      throw new BadRequestException('文章尚未解析完成');
    }

    const provider = await this.providerService.getChatConfig();
    await this.prisma.aiAnalysis.upsert({
      where: { documentId },
      update: {
        status: 'processing',
        provider: provider.providerPreset,
        model: provider.model,
        errorMessage: null,
        startedAt: new Date(),
      },
      create: {
        userId,
        documentId,
        status: 'processing',
        provider: provider.providerPreset,
        model: provider.model,
        startedAt: new Date(),
      },
    });

    try {
      const content = await this.providerService.chatJson(
        buildAnalysisMessages({
          title: document.title,
          source: document.source,
          author: document.author,
          excerpt: document.excerpt,
          contentText: document.contentText || document.markdown,
        }),
      );
      const payload = normalizeAnalysisPayload(content);
      const tags = normalizeTags(payload.tags);

      const analysis = await this.prisma.aiAnalysis.update({
        where: { documentId },
        data: {
          status: 'succeeded',
          provider: provider.providerPreset,
          model: provider.model,
          language: 'zh-CN',
          oneSentenceSummary: payload.oneSentenceSummary || null,
          summary: payload.summary || null,
          keyPoints: normalizeStringArray(payload.keyPoints),
          concepts: normalizeStringArray(payload.concepts),
          actions: normalizeStringArray(payload.actions),
          audience: payload.audience || null,
          suggestedTags: tags,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });

      await this.attachTags(userId, documentId, tags);
      return toAiAnalysisDto(analysis);
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.aiAnalysis.upsert({
        where: { documentId },
        update: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
        create: {
          userId,
          documentId,
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async listConversations(userId: string, documentId: string) {
    await this.ensureOwnedDocument(userId, documentId);
    const conversations = await this.prisma.aiConversation.findMany({
      where: { userId, documentId },
      orderBy: { createdAt: 'asc' },
    });
    return conversations.map(toAiConversationDto);
  }

  async streamConversation(
    userId: string,
    documentId: string,
    input: CreateAiConversationRequest,
    response: Response,
  ) {
    const question = input.question?.trim();
    if (!question) {
      throw new BadRequestException('请输入问题');
    }

    const document = await this.ensureOwnedDocument(userId, documentId);
    if (document.ingestStatus !== 'succeeded') {
      throw new BadRequestException('文章解析完成后才能提问');
    }

    const provider = await this.providerService.getChatConfig();
    const conversation = await this.prisma.aiConversation.create({
      data: {
        userId,
        documentId,
        question,
        provider: provider.providerPreset,
        model: provider.model,
        status: 'processing',
      },
    });

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('X-Lumi-Conversation-Id', conversation.id);

    let answer = '';
    try {
      const analysis = await this.prisma.aiAnalysis.findUnique({
        where: { documentId },
      });
      for await (const chunk of this.providerService.streamChat(
        buildDocumentQuestionMessages({
          title: document.title,
          question,
          articleText: document.contentText || document.markdown || '',
          analysisSummary: analysis?.summary || analysis?.oneSentenceSummary || undefined,
        }),
      )) {
        answer += chunk;
        response.write(chunk);
      }

      await this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: {
          answer,
          status: 'succeeded',
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      response.end();
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: {
          answer: answer || null,
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      if (!response.headersSent) {
        response.status(500);
      }
      response.write(answer ? `\n\n[AI 生成失败：${message}]` : `AI 生成失败：${message}`);
      response.end();
    }
  }

  private async ensureOwnedDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document) {
      throw new NotFoundException('文章不存在');
    }
    return document;
  }

  private async attachTags(userId: string, documentId: string, names: string[]) {
    for (const name of names) {
      const tag = await this.prisma.tag.upsert({
        where: {
          userId_name: {
            userId,
            name,
          },
        },
        update: {},
        create: {
          userId,
          name,
        },
      });

      await this.prisma.documentTag.upsert({
        where: {
          documentId_tagId: {
            documentId,
            tagId: tag.id,
          },
        },
        update: {},
        create: {
          documentId,
          tagId: tag.id,
        },
      });
    }
  }
}

function normalizeAnalysisPayload(raw: string): AnalysisPayload {
  const value = JSON.parse(extractJson(raw)) as AnalysisPayload;
  return {
    oneSentenceSummary: toString(value.oneSentenceSummary),
    summary: toString(value.summary),
    keyPoints: normalizeStringArray(value.keyPoints),
    concepts: normalizeStringArray(value.concepts),
    actions: normalizeStringArray(value.actions),
    audience: toString(value.audience),
    tags: normalizeStringArray(value.tags),
  };
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(toString).filter(Boolean).slice(0, 12);
}

function normalizeTags(value: unknown): string[] {
  return Array.from(new Set(normalizeStringArray(value).map((item) => item.slice(0, 20)))).slice(
    0,
    8,
  );
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
