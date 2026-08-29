import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type {
  CreateKnowledgeChatRequest,
  KnowledgeChatCitationDto,
  KnowledgeChatMessageDto,
  KnowledgeChatSessionDto,
  UpdateKnowledgeChatSessionRequest,
} from '@lumi/shared';
import { AiProviderService, type ChatMessage } from '../ai/ai-provider.service';
import { EmbeddingsService, type RetrievedChunk } from '../embeddings/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from '../common/error.utils';

type SessionWithMessages = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageWithCitations[];
};

type MessageWithCitations = {
  id: string;
  question: string;
  answer: string | null;
  status: 'processing' | 'succeeded' | 'failed' | 'aborted';
  provider: string | null;
  model: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  citations: CitationWithRelations[];
};

type CitationWithRelations = {
  id: string;
  citationIndex: number;
  excerpt: string;
  score: number | null;
  startOffset: number | null;
  endOffset: number | null;
  documentId: string | null;
  chunkId: string | null;
  documentTitleSnapshot: string;
  documentSourceSnapshot: string | null;
  documentArchivedAtSnapshot: Date | null;
  documentCreatedAtSnapshot: Date | null;
  createdAt: Date;
  document?: { id: string } | null;
};

/**
 * 引用以文章为单位：同一文章召回的多个分片聚合为一个来源，
 * 共用一个引用编号。
 */
type CitedSource = {
  documentId: string;
  documentTitle: string;
  documentSource: string | null;
  documentArchivedAt: Date | null;
  documentCreatedAt: Date | null;
  chunks: RetrievedChunk[];
};

/**
 * 知识库级 AI 问答服务。
 *
 * 问答主流程：用问题检索 Embedding 向量得到相关分片 → 组装 Prompt →
 * 调用 Chat 模型并 SSE 流式回传答案 → 回填引用来源。会话标题在首条消息
 * 生成成功后由单独的 Chat 调用异步产出。
 */
@Injectable()
export class KnowledgeChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviderService: AiProviderService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async listSessions(userId: string): Promise<KnowledgeChatSessionDto[]> {
    const sessions = await this.prisma.knowledgeChatSession.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });
    return sessions.map((session) => toSessionDto(session));
  }

  async getSession(userId: string, id: string): Promise<KnowledgeChatSessionDto> {
    const session = await this.prisma.knowledgeChatSession.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        messages: {
          include: {
            citations: {
              include: {
                document: {
                  select: { id: true },
                },
              },
              orderBy: { citationIndex: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    return toSessionDto(session);
  }

  async updateSession(
    userId: string,
    id: string,
    input: UpdateKnowledgeChatSessionRequest,
  ): Promise<KnowledgeChatSessionDto> {
    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('请输入会话标题');
    }
    await this.ensureOwnedSession(userId, id);
    const session = await this.prisma.knowledgeChatSession.update({
      where: { id },
      data: { title: title.slice(0, 80) },
    });
    return toSessionDto(session);
  }

  async deleteSession(userId: string, id: string) {
    await this.ensureOwnedSession(userId, id);
    await this.prisma.knowledgeChatSession.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async askNewSession(userId: string, input: CreateKnowledgeChatRequest, response: Response) {
    const question = this.normalizeQuestion(input.question);
    await this.aiProviderService.getChatConfig();

    const session = await this.prisma.knowledgeChatSession.create({
      data: {
        userId,
        title: '新的问答',
      },
    });
    this.prepareSse(response);
    this.writeSse(response, 'session_created', toSessionDto(session));
    await this.answerQuestion({
      userId,
      sessionId: session.id,
      question,
      response,
      shouldGenerateTitle: true,
    });
  }

  async askInSession(
    userId: string,
    sessionId: string,
    input: CreateKnowledgeChatRequest,
    response: Response,
  ) {
    const question = this.normalizeQuestion(input.question);
    await this.ensureOwnedSession(userId, sessionId);
    await this.aiProviderService.getChatConfig();
    this.prepareSse(response);
    await this.answerQuestion({
      userId,
      sessionId,
      question,
      response,
      shouldGenerateTitle: false,
    });
  }

  async regenerate(userId: string, messageId: string, response: Response) {
    const message = await this.prisma.knowledgeChatMessage.findFirst({
      where: {
        id: messageId,
        userId,
        status: { in: ['failed', 'aborted'] },
        session: { deletedAt: null },
      },
      select: {
        id: true,
        question: true,
        sessionId: true,
      },
    });
    if (!message) {
      throw new NotFoundException('问答记录不存在或当前状态不支持重新生成');
    }

    await this.aiProviderService.getChatConfig();
    this.prepareSse(response);
    await this.answerQuestion({
      userId,
      sessionId: message.sessionId,
      question: message.question,
      response,
      existingMessageId: message.id,
      shouldGenerateTitle: false,
    });
  }

  private async answerQuestion(input: {
    userId: string;
    sessionId: string;
    question: string;
    response: Response;
    existingMessageId?: string;
    shouldGenerateTitle: boolean;
  }) {
    const provider = await this.aiProviderService.getChatConfig();
    const history = await this.loadRecentHistory(input.userId, input.sessionId, input.existingMessageId);
    const message = input.existingMessageId
      ? await this.prisma.knowledgeChatMessage.update({
          where: { id: input.existingMessageId },
          data: {
            answer: null,
            status: 'processing',
            provider: provider.providerPreset,
            model: provider.model,
            errorMessage: null,
            finishedAt: null,
            citations: { deleteMany: {} },
          },
        })
      : await this.prisma.knowledgeChatMessage.create({
          data: {
            userId: input.userId,
            sessionId: input.sessionId,
            question: input.question,
            status: 'processing',
            provider: provider.providerPreset,
            model: provider.model,
          },
        });

    // 检索需要调用 Embedding 接口（秒级耗时），放在 message_created 之后，
    // 保证前端先立刻显示用户消息，再进入等待答案的状态。
    this.writeSse(input.response, 'message_created', {
      id: message.id,
      sessionId: input.sessionId,
      question: input.question,
    });

    let answer = '';
    let aborted = false;
    const abortController = new AbortController();
    input.response.on('close', () => {
      if (!input.response.writableEnded) {
        aborted = true;
        abortController.abort();
      }
    });

    try {
      const citations = await this.embeddingsService.retrieveRelevantChunks(
        input.userId,
        input.question,
        8,
        2,
      );
      const sources = groupChunksByDocument(citations);
      const messages = buildKnowledgeChatMessages({
        question: input.question,
        history,
        sources,
      });
      for await (const chunk of this.aiProviderService.streamChatWithConfig(
        provider,
        messages,
        0.2,
        abortController.signal,
      )) {
        answer += chunk;
        this.writeSse(input.response, 'answer_delta', { text: chunk });
      }

      const { answer: finalAnswer, sources: usedSources } = collectUsedSources(answer, sources);
      await this.prisma.knowledgeChatMessage.update({
        where: { id: message.id },
        data: {
          answer: finalAnswer,
          status: aborted ? 'aborted' : 'succeeded',
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      await this.prisma.knowledgeChatSession.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      });

      const savedCitations = await this.saveCitations(message.id, usedSources);
      this.writeSse(input.response, 'citations', savedCitations.map(toCitationDto));

      if (!aborted && input.shouldGenerateTitle) {
        const title = await this.generateTitleBestEffort(input.sessionId, input.question, finalAnswer);
        if (title) {
          this.writeSse(input.response, 'title_updated', { title });
        }
      }

      this.writeSse(input.response, aborted ? 'aborted' : 'done', {
        messageId: message.id,
      });
      input.response.end();
    } catch (error) {
      const messageText = getErrorMessage(error);
      await this.prisma.knowledgeChatMessage.update({
        where: { id: message.id },
        data: {
          answer: answer || null,
          status: aborted ? 'aborted' : 'failed',
          errorMessage: aborted ? null : messageText,
          finishedAt: new Date(),
        },
      });
      if (!input.response.writableEnded) {
        this.writeSse(input.response, aborted ? 'aborted' : 'error', {
          message: aborted ? '已停止生成' : messageText,
          messageId: message.id,
        });
        input.response.end();
      }
    }
  }

  private async saveCitations(messageId: string, sources: CitedSource[]) {
    if (!sources.length) return [];
    await this.prisma.knowledgeChatCitation.createMany({
      data: sources.map((source, index) => {
        // 检索结果按相似度排序，组内首个片段即该文档最相关的片段
        const best = source.chunks[0];
        return {
          messageId,
          citationIndex: index + 1,
          excerpt: best.content,
          score: best.score,
          startOffset: best.startOffset,
          endOffset: best.endOffset,
          documentId: source.documentId,
          chunkId: best.id,
          documentTitleSnapshot: source.documentTitle,
          documentSourceSnapshot: source.documentSource,
          documentArchivedAtSnapshot: source.documentArchivedAt,
          documentCreatedAtSnapshot: source.documentCreatedAt,
        };
      }),
    });
    return this.prisma.knowledgeChatCitation.findMany({
      where: { messageId },
      include: {
        document: {
          select: { id: true },
        },
      },
      orderBy: { citationIndex: 'asc' },
    });
  }

  private async loadRecentHistory(userId: string, sessionId: string, excludeMessageId?: string) {
    const messages = await this.prisma.knowledgeChatMessage.findMany({
      where: {
        userId,
        sessionId,
        ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
        status: { in: ['succeeded', 'aborted'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    return messages
      .reverse()
      .map((item) => `用户：${item.question}\n助手：${truncate(item.answer || '', 800)}`)
      .join('\n\n');
  }

  private async generateTitleBestEffort(sessionId: string, question: string, answer: string) {
    try {
      const raw = await this.aiProviderService.chatJson(
        [
          {
            role: 'system',
            content:
              '你是 Lumi 的会话标题助手。请根据用户问题和回答生成一个 6-20 个中文字符的标题，只输出 JSON。',
          },
          {
            role: 'user',
            content: [
              '请输出 {"title":"标题"}。',
              `问题：${question}`,
              `回答：${truncate(answer, 1200)}`,
            ].join('\n\n'),
          },
        ],
        0,
      );
      const payload = JSON.parse(extractJson(raw)) as { title?: string };
      const title = payload.title?.trim().slice(0, 40);
      if (!title) return null;
      await this.prisma.knowledgeChatSession.update({
        where: { id: sessionId },
        data: { title },
      });
      return title;
    } catch {
      return null;
    }
  }

  private normalizeQuestion(value: string | undefined) {
    const question = value?.trim();
    if (!question) {
      throw new BadRequestException('请输入问题');
    }
    if (question.length > 2000) {
      throw new BadRequestException('问题过长，请缩短后重试');
    }
    return question;
  }

  private async ensureOwnedSession(userId: string, id: string) {
    const session = await this.prisma.knowledgeChatSession.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
  }

  private prepareSse(response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();
  }

  private writeSse(response: Response, event: string, data: unknown) {
    if (response.writableEnded) return;
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

function buildKnowledgeChatMessages(input: {
  question: string;
  history: string;
  sources: CitedSource[];
}): ChatMessage[] {
  const citationText = input.sources.length
    ? input.sources
        .map((source, index) => {
          const fragments = source.chunks
            .map((chunk) => truncate(chunk.content, 900))
            .join('\n---\n');
          return `[${index + 1}] 标题：${source.documentTitle}\n片段：${fragments}`;
        })
        .join('\n\n')
    : '没有召回到足够相关的知识库片段。';

  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的知识库问答助手。只能基于提供的知识库片段回答，默认使用中文。不要使用模型常识自由发挥。资料不足时必须明确说明“知识库中没有足够依据回答这个问题”。编号 [1] [2] 各对应一篇文章，同一编号下可能有多段内容；回答中只标注实际参考了的编号，没有用到的来源不要标注。',
    },
    {
      role: 'user',
      content: [
        input.history ? `当前会话上下文：\n${input.history}` : '',
        `用户问题：${input.question}`,
        `知识库片段：\n${citationText}`,
        '请给出可信、克制的中文回答。若使用了片段，请在相关句子后标注对应的来源编号。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

/**
 * 把检索分片按所属文档聚合；检索结果本身按相似度降序，
 * 因此 Map 的插入顺序即来源的优先顺序，组内分片保持排序。
 */
function groupChunksByDocument(chunks: RetrievedChunk[]): CitedSource[] {
  const byDocument = new Map<string, CitedSource>();
  for (const chunk of chunks) {
    const existing = byDocument.get(chunk.documentId);
    if (existing) {
      existing.chunks.push(chunk);
      continue;
    }
    byDocument.set(chunk.documentId, {
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      documentSource: chunk.documentSource,
      documentArchivedAt: chunk.documentArchivedAt,
      documentCreatedAt: chunk.documentCreatedAt,
      chunks: [chunk],
    });
  }
  return [...byDocument.values()];
}

/**
 * 解析回答中实际出现的 [n] 标记：只保留被引用的来源，按首次出现
 * 顺序把编号重排为 1..N 并同步改写回答文本；模型没有引用任何来源
 * 时不保存引用。
 */
function collectUsedSources(answer: string, sources: CitedSource[]): {
  answer: string;
  sources: CitedSource[];
} {
  const markerPattern = /\[(\d{1,2})\]/g;
  const newIndexByOriginal = new Map<number, number>();
  for (const match of answer.matchAll(markerPattern)) {
    const original = Number(match[1]);
    if (original < 1 || original > sources.length) continue;
    if (!newIndexByOriginal.has(original)) {
      newIndexByOriginal.set(original, newIndexByOriginal.size + 1);
    }
  }
  if (!newIndexByOriginal.size) {
    return { answer, sources: [] };
  }

  const remapped = answer.replace(markerPattern, (raw, value: string) => {
    const newIndex = newIndexByOriginal.get(Number(value));
    return newIndex ? `[${newIndex}]` : raw;
  });
  const used = [...newIndexByOriginal.keys()].map((original) => sources[original - 1]);
  return { answer: remapped, sources: used };
}

function toSessionDto(session: SessionWithMessages): KnowledgeChatSessionDto {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages?.map(toMessageDto),
  };
}

function toMessageDto(message: MessageWithCitations): KnowledgeChatMessageDto {
  return {
    id: message.id,
    question: message.question,
    answer: message.answer,
    status: message.status,
    provider: message.provider,
    model: message.model,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    finishedAt: message.finishedAt?.toISOString() ?? null,
    citations: message.citations.map(toCitationDto),
  };
}

function toCitationDto(citation: CitationWithRelations): KnowledgeChatCitationDto {
  return {
    id: citation.id,
    index: citation.citationIndex,
    excerpt: citation.excerpt,
    score: citation.score,
    startOffset: citation.startOffset,
    endOffset: citation.endOffset,
    documentId: citation.documentId,
    chunkId: citation.chunkId,
    documentTitle: citation.documentTitleSnapshot,
    documentSource: citation.documentSourceSnapshot,
    documentArchivedAt: citation.documentArchivedAtSnapshot?.toISOString() ?? null,
    documentCreatedAt: citation.documentCreatedAtSnapshot?.toISOString() ?? null,
    sourceDeleted: Boolean(citation.documentId && !citation.document),
    createdAt: citation.createdAt.toISOString(),
  };
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[已截断]` : value;
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
