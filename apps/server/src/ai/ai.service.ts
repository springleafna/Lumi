import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { CreateAiConversationRequest } from '@lumi/shared';
import { AiProviderService } from './ai-provider.service';
import { buildAnalysisMessages } from './prompts/analysis';
import { buildDocumentQuestionMessages } from './prompts/document-question';
import {
  buildVideoMapMessages,
  buildVideoReduceMessages,
  type VideoChunkSummary,
} from './prompts/video-summary';
import {
  chunkTranscriptByWindow,
  formatTranscriptForPrompt,
  normalizeAnchors,
  type TranscriptSegment,
} from '../video/transcript.utils';
import { countTextWords } from '../common/text.utils';
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
  /** 视频总结专用：正文 Markdown（文章分析不使用） */
  markdown?: string;
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
      let payload: AnalysisPayload;
      let markdown: string | null = null;
      if (document.type === 'video') {
        const video = await this.summarizeVideoDocument(document);
        payload = video.payload;
        markdown = video.markdown;
      } else {
        const content = await this.providerService.chatJson(
          buildAnalysisMessages({
            title: document.title,
            source: document.source,
            author: document.author,
            excerpt: document.excerpt,
            contentText: document.contentText || document.markdown,
          }),
        );
        payload = normalizeAnalysisPayload(content);
      }
      const tags = normalizeTags(payload.tags);

      const analysis = await this.prisma.$transaction(async (tx) => {
        // 视频总结的正文在这里才落库（ingest 阶段 markdown 为空）；
        // 一句话摘要同时回写 excerpt，供列表卡片展示
        if (markdown !== null) {
          await tx.document.update({
            where: { id: documentId },
            data: {
              markdown,
              wordCount: countTextWords(markdown),
              excerpt: payload.oneSentenceSummary || null,
            },
          });
        }
        return tx.aiAnalysis.update({
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
      let articleText = document.contentText || document.markdown || '';
      if (document.type === 'video') {
        // 视频问答：总结 + 全量字幕进上下文（方案文档 §9.4，不做检索）
        const transcript = await this.prisma.videoTranscript.findUnique({
          where: { documentId },
        });
        const segments = (transcript?.segments as TranscriptSegment[] | null) ?? [];
        if (segments.length) {
          articleText = [
            document.markdown || '',
            '视频字幕全文：',
            formatTranscriptForPrompt(segments),
          ]
            .filter(Boolean)
            .join('\n\n');
        }
      }
      for await (const chunk of this.providerService.streamChat(
        buildDocumentQuestionMessages({
          title: document.title,
          question,
          articleText,
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

  /**
   * 视频总结：Map（按时间窗分块小结）→ Reduce（结构化 Markdown + 阅读卡）。
   * 锚点经 normalizeAnchors 校验吸附，编造的时间点会被移除。
   */
  private async summarizeVideoDocument(document: {
    id: string;
    title: string;
    author: string | null;
    videoDurationSeconds: number | null;
  }): Promise<{ payload: AnalysisPayload; markdown: string }> {
    const transcript = await this.prisma.videoTranscript.findUnique({
      where: { documentId: document.id },
    });
    const segments = (transcript?.segments as TranscriptSegment[] | null) ?? [];
    if (!segments.length) {
      throw new BadRequestException('该视频没有可用字幕记录，无法生成总结');
    }

    const chunks = chunkTranscriptByWindow(segments);
    const chunkSummaries: VideoChunkSummary[] = [];
    for (const chunk of chunks) {
      // map 阶段输出小结文本，不能用 chatJson（JSON 模式会压扁自由文本输出）
      const summary = (
        await this.providerService.chatText(
          buildVideoMapMessages({
            title: document.title,
            chunkText: chunk.text,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
          }),
        )
      ).trim();
      if (summary) {
        chunkSummaries.push({
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          summary,
        });
      }
    }
    if (!chunkSummaries.length) {
      throw new BadRequestException('字幕内容总结失败，请重试');
    }

    const payload = normalizeAnalysisPayload(
      await this.providerService.chatJson(
        buildVideoReduceMessages({
          title: document.title,
          uploader: document.author,
          durationSeconds: document.videoDurationSeconds,
          chunkSummaries,
        }),
      ),
    );
    const markdown = normalizeAnchors(payload.markdown ?? '', segments);
    if (!markdown) {
      throw new BadRequestException('总结生成结果为空，请重试');
    }

    // 阅读卡要点中的锚点与正文同规则校验（吸附/移除），保证抽屉跳转可信
    payload.keyPoints = (payload.keyPoints ?? []).map((point) => normalizeAnchors(point, segments));
    return { payload, markdown };
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
    markdown: toString(value.markdown),
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
