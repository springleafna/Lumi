import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { CreateAiConversationRequest, VideoSummaryMode } from '@lumi/shared';
import { AiProviderService } from './ai-provider.service';
import { buildAnalysisMessages } from './prompts/analysis';
import { buildDocumentQuestionMessages } from './prompts/document-question';
import {
  buildVideoMapMessages,
  buildVideoReduceMessages,
  buildVideoSinglePassMessages,
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

/** 单文档问答的多轮上下文轮数（取最近 N 条成功回答，来自落库记录） */
const DOCUMENT_QUESTION_HISTORY_TURNS = 4;

/** 转写字符量不超过该值时单次成文（全文进上下文），超过才走 Map-Reduce 分块 */
const DEFAULT_SINGLE_PASS_MAX_CHARS = 16_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly providerService: AiProviderService,
    private readonly configService: ConfigService,
  ) {}

  async getAnalysis(userId: string, documentId: string) {
    await this.ensureOwnedDocument(userId, documentId);
    const analysis = await this.prisma.aiAnalysis.findUnique({
      where: { documentId },
    });
    return analysis ? toAiAnalysisDto(analysis) : null;
  }

  async retryAnalysis(userId: string, documentId: string, mode?: VideoSummaryMode) {
    const document = await this.ensureOwnedDocument(userId, documentId);
    if (document.ingestStatus !== 'succeeded') {
      throw new BadRequestException('文章解析完成后才能生成 AI 分析');
    }

    await this.providerService.getChatConfig();

    const targetMode = mode ?? 'brief';
    const analysis = await this.prisma.aiAnalysis.findUnique({ where: { documentId } });

    // 视频已有成功分析：两种模式的正文分别存档，目标模式已存则直接切换，不调用模型
    if (document.type === 'video' && analysis?.status === 'succeeded') {
      const currentMode = (analysis.mode as VideoSummaryMode | null) ?? 'brief';
      // 兼容存量视频：当前激活正文属于当前模式，存档缺失时先补档，保证之后切换零生成
      const currentStored =
        currentMode === 'standard' ? analysis.standardMarkdown : analysis.briefMarkdown;
      if (!currentStored && document.markdown) {
        await this.prisma.aiAnalysis.update({
          where: { documentId },
          data:
            currentMode === 'standard'
              ? { standardMarkdown: document.markdown }
              : { briefMarkdown: document.markdown },
        });
        if (currentMode === 'standard') analysis.standardMarkdown = document.markdown;
        else analysis.briefMarkdown = document.markdown;
      }
      const storedBody =
        targetMode === 'standard' ? analysis.standardMarkdown : analysis.briefMarkdown;
      if (storedBody && targetMode !== currentMode) {
        return {
          analysis: toAiAnalysisDto(await this.swapVideoBody(documentId, targetMode, storedBody)),
          swapped: true,
        };
      }
      // 同模式重新生成（替换存档正文）或目标模式正文缺失 → 入队仅正文生成
      await this.prisma.aiAnalysis.update({
        where: { documentId },
        data: {
          status: 'processing',
          mode: targetMode,
          errorMessage: null,
          startedAt: new Date(),
        },
      });
      await this.queueService.addAiAnalysisJob({ userId, documentId, mode: targetMode });
      const updated = await this.prisma.aiAnalysis.findUniqueOrThrow({ where: { documentId } });
      return { analysis: toAiAnalysisDto(updated), swapped: false };
    }

    const upserted = await this.prisma.aiAnalysis.upsert({
      where: { documentId },
      update: {
        status: 'pending',
        errorMessage: null,
        mode: document.type === 'video' ? targetMode : null,
      },
      create: {
        userId,
        documentId,
        status: 'pending',
        mode: document.type === 'video' ? targetMode : null,
      },
    });

    await this.queueService.addAiAnalysisJob({ userId, documentId, mode: targetMode });
    return { analysis: toAiAnalysisDto(upserted), swapped: false };
  }

  /** 在已存档的两份视频正文间切换：只换激活正文与模式标记，不调用模型 */
  private async swapVideoBody(
    documentId: string,
    targetMode: VideoSummaryMode,
    storedBody: string,
  ) {
    const [, analysis] = await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: documentId },
        data: { markdown: storedBody, wordCount: countTextWords(storedBody) },
      }),
      this.prisma.aiAnalysis.update({
        where: { documentId },
        data: { mode: targetMode, errorMessage: null },
      }),
    ]);
    return analysis;
  }

  async analyzeDocument(userId: string, documentId: string, mode: VideoSummaryMode = 'brief') {
    const document = await this.ensureOwnedDocument(userId, documentId);
    if (document.ingestStatus !== 'succeeded') {
      throw new BadRequestException('文章尚未解析完成');
    }

    const provider = await this.providerService.getChatConfig();
    // 视频重新生成（已有成功分析）只重写正文：阅读卡字段与标签保持首次分析结果
    const existingAnalysis =
      document.type === 'video'
        ? await this.prisma.aiAnalysis.findUnique({
            where: { documentId },
            select: { status: true, mode: true },
          })
        : null;
    const isVideoRegen = existingAnalysis?.status === 'succeeded';
    // 记住本次生成前的模式：正文重新生成失败时需要回退，避免模式标记与正文不一致
    const previousVideoMode = (existingAnalysis?.mode as VideoSummaryMode | null) ?? 'brief';
    await this.prisma.aiAnalysis.upsert({
      where: { documentId },
      update: {
        status: 'processing',
        ...(document.type === 'video' ? { mode } : {}),
        provider: provider.providerPreset,
        model: provider.model,
        errorMessage: null,
        startedAt: new Date(),
      },
      create: {
        userId,
        documentId,
        status: 'processing',
        ...(document.type === 'video' ? { mode } : {}),
        provider: provider.providerPreset,
        model: provider.model,
        startedAt: new Date(),
      },
    });

    try {
      const existingTags = isVideoRegen ? [] : await this.getExistingTagCandidates(userId);
      let payload: AnalysisPayload;
      let markdown: string | null = null;
      if (document.type === 'video') {
        const video = await this.summarizeVideoDocument(document, existingTags, mode, isVideoRegen);
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
            existingTags,
          }),
        );
        payload = normalizeAnalysisPayload(content);
      }
      // 重新生成不重算标签：正文之外的字段保持首次分析结果
      const tags = isVideoRegen ? [] : normalizeTags(payload.tags);

      const analysis = await this.prisma.$transaction(async (tx) => {
        // 视频总结的正文在这里才落库（ingest 阶段 markdown 为空）；
        // 首次生成时一句话摘要同时回写 excerpt，供列表卡片展示
        if (markdown !== null) {
          await tx.document.update({
            where: { id: documentId },
            data: {
              markdown,
              wordCount: countTextWords(markdown),
              ...(isVideoRegen ? {} : { excerpt: payload.oneSentenceSummary || null }),
            },
          });
        }
        return tx.aiAnalysis.update({
          where: { documentId },
          data: {
            status: 'succeeded',
            ...(document.type === 'video' ? { mode } : {}),
            // 双模式正文按模式存档，供切换时免生成直接换回
            ...(markdown !== null && mode === 'standard'
              ? { standardMarkdown: markdown }
              : {}),
            ...(markdown !== null && mode !== 'standard' ? { briefMarkdown: markdown } : {}),
            provider: provider.providerPreset,
            model: provider.model,
            language: 'zh-CN',
            ...(isVideoRegen
              ? {}
              : {
                  oneSentenceSummary: payload.oneSentenceSummary || null,
                  summary: payload.summary || null,
                  keyPoints: normalizeStringArray(payload.keyPoints),
                  concepts: normalizeStringArray(payload.concepts),
                  actions: normalizeStringArray(payload.actions),
                  audience: payload.audience || null,
                  suggestedTags: tags,
                }),
            errorMessage: null,
            finishedAt: new Date(),
          },
        });
      });

      if (!isVideoRegen) {
        await this.attachTags(userId, documentId, tags);
      }
      return toAiAnalysisDto(analysis);
    } catch (error) {
      const message = getErrorMessage(error);
      if (isVideoRegen) {
        // 正文重新生成失败不影响已成功的阅读卡：回退模式标记并保留原内容，错误由模式条提示
        await this.prisma.aiAnalysis.update({
          where: { documentId },
          data: {
            status: 'succeeded',
            mode: previousVideoMode,
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
      } else {
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
      }
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
      // 多轮上下文来自落库记录：取最近几轮成功问答（不含本轮），时间正序进 prompt
      const historyRows = await this.prisma.aiConversation.findMany({
        where: {
          userId,
          documentId,
          status: 'succeeded',
          answer: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: DOCUMENT_QUESTION_HISTORY_TURNS,
        select: { question: true, answer: true },
      });
      const history = historyRows
        .reverse()
        .map((row) => ({ question: row.question, answer: row.answer ?? '' }));
      for await (const chunk of this.providerService.streamChat(
        buildDocumentQuestionMessages({
          title: document.title,
          question,
          articleText,
          analysisSummary: analysis?.summary || analysis?.oneSentenceSummary || undefined,
          history,
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
   * 视频总结：转写字符量在阈值内时整篇进上下文单次成文（无分块信息损耗），
   * 超限才走 Map（按时间窗分块小结）→ Reduce（结构化 Markdown + 阅读卡）；
   * 单次失败回退 Map-Reduce。锚点经 normalizeAnchors 校验吸附，编造的时间点会被移除。
   */
  private async summarizeVideoDocument(
    document: {
      id: string;
      title: string;
      author: string | null;
      videoDurationSeconds: number | null;
    },
    existingTags: string[],
    mode: VideoSummaryMode,
    bodyOnly = false,
  ): Promise<{ payload: AnalysisPayload; markdown: string }> {
    const transcript = await this.prisma.videoTranscript.findUnique({
      where: { documentId: document.id },
    });
    const segments = (transcript?.segments as TranscriptSegment[] | null) ?? [];
    if (!segments.length) {
      throw new BadRequestException('该视频没有可用字幕记录，无法生成总结');
    }

    const totalChars = segments.reduce((sum, segment) => sum + segment.text.length, 0);
    if (totalChars <= this.getSinglePassMaxChars()) {
      try {
        return await this.summarizeInSinglePass(document, existingTags, segments, mode, bodyOnly);
      } catch (error) {
        this.logger.warn(
          `视频单次总结失败，回退 Map-Reduce ${document.id}: ${getErrorMessage(error)}`,
        );
      }
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
          mode,
          chunkSummaries,
          existingTags,
          bodyOnly,
        }),
      ),
    );
    const markdown = this.normalizeVideoAnchors(payload, segments);
    return { payload, markdown };
  }

  /**
   * 单次总结：完整字幕一次成文，锚点直接取自带时间头的字幕行。
   * 任何失败（JSON 解析、模型输出为空、上下文超限）由调用方回退 Map-Reduce。
   */
  private async summarizeInSinglePass(
    document: {
      id: string;
      title: string;
      author: string | null;
      videoDurationSeconds: number | null;
    },
    existingTags: string[],
    segments: TranscriptSegment[],
    mode: VideoSummaryMode,
    bodyOnly = false,
  ): Promise<{ payload: AnalysisPayload; markdown: string }> {
    const payload = normalizeAnalysisPayload(
      await this.providerService.chatJson(
        buildVideoSinglePassMessages({
          title: document.title,
          uploader: document.author,
          durationSeconds: document.videoDurationSeconds,
          mode,
          transcriptText: formatTranscriptForPrompt(segments),
          existingTags,
          bodyOnly,
        }),
      ),
    );
    const markdown = this.normalizeVideoAnchors(payload, segments);
    return { payload, markdown };
  }

  /**
   * 锚点校验：正文与阅读卡要点中的 [mm:ss] 吸附到真实字幕时间，
   * 匹配不到的移除，保证抽屉与章节目录的跳转可信。
   */
  private normalizeVideoAnchors(payload: AnalysisPayload, segments: TranscriptSegment[]): string {
    const markdown = normalizeAnchors(payload.markdown ?? '', segments);
    if (!markdown) {
      throw new Error('总结生成结果为空，请重试');
    }
    payload.keyPoints = (payload.keyPoints ?? []).map((point) => normalizeAnchors(point, segments));
    return markdown;
  }

  private getSinglePassMaxChars(): number {
    const configured = Number(this.configService.get<string>('VIDEO_SINGLE_PASS_MAX_CHARS'));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_SINGLE_PASS_MAX_CHARS;
  }

  /**
   * 打标候选：按使用频率取 Top 30 现有标签注入提示词，
   * 引导模型优先复用，控制标签长尾增长。
   */
  private async getExistingTagCandidates(userId: string): Promise<string[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { documents: { _count: 'desc' } },
      take: 30,
      select: { name: true },
    });
    return tags.map((tag) => tag.name);
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
