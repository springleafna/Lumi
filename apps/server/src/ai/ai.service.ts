import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AiCitationDto, CreateAiConversationRequest } from '@lumi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  toAiAnalysisDto,
  toAiConversationDto,
} from '../documents/document.mapper';
import { AiProviderService, type ChatMessage } from './ai-provider.service';

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
    const citations = findRelevantCitations(document.contentText || document.markdown, question);
    const conversation = await this.prisma.aiConversation.create({
      data: {
        userId,
        documentId,
        question,
        citations,
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
        buildQuestionMessages({
          title: document.title,
          question,
          citations,
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

function buildAnalysisMessages(input: {
  title: string;
  source?: string | null;
  author?: string | null;
  excerpt?: string | null;
  contentText?: string | null;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文阅读助手。请只基于用户提供的文章内容分析，不要编造。必须只输出 JSON，不要输出 Markdown。',
    },
    {
      role: 'user',
      content: [
        '请对下面文章生成结构化阅读卡片，字段必须包含：oneSentenceSummary, summary, keyPoints, concepts, actions, audience, tags。',
        '要求：摘要、要点、标签均使用中文；tags 为 1-3 个短中文标签；keyPoints/concepts/actions 使用字符串数组。',
        `标题：${input.title}`,
        `来源：${input.source || '未知'}`,
        `作者：${input.author || '未知'}`,
        `摘要：${input.excerpt || '无'}`,
        `正文：${truncate(input.contentText || '', 18000)}`,
      ].join('\n\n'),
    },
  ];
}

function buildQuestionMessages(input: {
  title: string;
  question: string;
  citations: AiCitationDto[];
  analysisSummary?: string;
}): ChatMessage[] {
  const citationText = input.citations.length
    ? input.citations.map((item) => `[${item.index}] ${item.text}`).join('\n\n')
    : '没有命中足够相关的原文片段。';

  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文阅读问答助手。只能基于当前文章依据片段回答。依据片段保留原文，回答使用中文。如果依据不足，要明确说明当前文章没有足够信息。',
    },
    {
      role: 'user',
      content: [
        `文章标题：${input.title}`,
        input.analysisSummary ? `已有摘要：${input.analysisSummary}` : '',
        `用户问题：${input.question}`,
        `依据片段：\n${citationText}`,
        '请给出简洁但有帮助的中文回答，并在回答末尾列出使用的依据编号。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
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

function findRelevantCitations(text: string, question: string): AiCitationDto[] {
  const chunks = chunkText(text);
  const questionTerms = toTerms(question);
  return chunks
    .map((chunk, index) => ({
      index: index + 1,
      text: chunk,
      score: scoreChunk(chunk, questionTerms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if ((current + paragraph).length > 900 && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += `${paragraph}\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 80);
}

function scoreChunk(chunk: string, terms: string[]): number {
  if (!terms.length) return 0;
  const lower = chunk.toLowerCase();
  const hits = terms.filter((term) => lower.includes(term.toLowerCase())).length;
  return hits / terms.length;
}

function toTerms(value: string): string[] {
  const words = value.match(/[A-Za-z0-9]{2,}|[\u3400-\u9fff]/g) || [];
  return Array.from(new Set(words)).slice(0, 40);
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

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[内容已截断]` : value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
