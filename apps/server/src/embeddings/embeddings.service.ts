import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DocumentEmbeddingChunkDto,
  DocumentEmbeddingIndexStatus,
  DocumentEmbeddingJobChunksDto,
  DocumentEmbeddingJobDto,
  ListEmbeddingJobsParams,
  PageResult,
} from '@lumi/shared';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma';
import { AiProviderService } from '../ai/ai-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { getErrorMessage } from '../common/error.utils';

type ChunkDraft = {
  content: string;
  startOffset: number;
  endOffset: number;
};

type VectorSearchRow = {
  id: string;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  score: number;
  documentId: string;
  documentTitle: string;
  documentSource: string | null;
  documentArchivedAt: Date | null;
  documentCreatedAt: Date;
};

export type RetrievedChunk = VectorSearchRow;

/**
 * Embedding 向量索引与检索服务。
 *
 * 索引侧：把文档正文按分隔符切块并去重，批量调用 Embedding 模型生成向量，
 * 写入 pgvector；同一文档重复索引会先清理旧分片再写入。
 * 检索侧：把查询文本转向量后在 pgvector 中按余弦相似度取 Top-K 分片，
 * 供知识库问答组装上下文。
 */
@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  async enqueueDocumentIndexBestEffort(userId: string, documentId: string) {
    try {
      const document = await this.prisma.document.findFirst({
        where: {
          id: documentId,
          userId,
          deletedAt: null,
          ingestStatus: 'succeeded',
          type: { in: ['article', 'fragment'] },
        },
        select: { id: true },
      });
      if (!document) return null;

      const job = await this.prisma.documentEmbeddingJob.create({
        data: {
          userId,
          documentId,
          status: 'pending',
        },
      });

      try {
        await this.queueService.addEmbeddingJob({ jobId: job.id });
      } catch (error) {
        await this.prisma.documentEmbeddingJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            errorMessage: getErrorMessage(error),
            finishedAt: new Date(),
          },
        });
      }

      return job;
    } catch {
      return null;
    }
  }

  async processEmbeddingJob(jobId: string) {
    const job = await this.prisma.documentEmbeddingJob.findUnique({
      where: { id: jobId },
      include: { document: true },
    });
    if (!job) {
      throw new NotFoundException('索引任务不存在');
    }

    await this.prisma.documentEmbeddingJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        errorMessage: null,
        startedAt: job.startedAt ?? new Date(),
      },
    });

    try {
      const document = job.document;
      if (
        document.deletedAt ||
        document.ingestStatus !== 'succeeded' ||
        !['article', 'fragment'].includes(document.type)
      ) {
        throw new BadRequestException('文章不在可索引范围');
      }

      const text = (document.contentText || document.markdown || '').trim();
      if (!text) {
        throw new BadRequestException('文章正文为空，无法索引');
      }

      const chunks = splitTextIntoChunks(text);
      if (!chunks.length) {
        throw new BadRequestException('文章正文为空，无法索引');
      }

      const embedding = await this.aiProviderService.embedTexts(chunks.map((chunk) => chunk.content));
      await this.replaceDocumentChunks({
        userId: document.userId,
        documentId: document.id,
        jobId: job.id,
        provider: embedding.config.providerPreset,
        model: embedding.config.model,
        dimension: embedding.dimension,
        configFingerprint: embedding.config.fingerprint,
        chunks,
        vectors: embedding.vectors,
      });

      return this.prisma.documentEmbeddingJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          provider: embedding.config.providerPreset,
          model: embedding.config.model,
          dimension: embedding.dimension,
          configFingerprint: embedding.config.fingerprint,
          chunkCount: chunks.length,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.documentEmbeddingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: getErrorMessage(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async listJobs(
    userId: string,
    params: ListEmbeddingJobsParams,
  ): Promise<PageResult<DocumentEmbeddingJobDto>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const keyword = params.keyword?.trim();
    const where: Prisma.DocumentEmbeddingJobWhereInput = {
      userId,
      ...(isEmbeddingStatus(params.status) ? { status: params.status } : {}),
      ...(keyword
        ? {
            document: {
              title: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentEmbeddingJob.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.documentEmbeddingJob.count({ where }),
    ]);

    return {
      items: items.map(toEmbeddingJobDto),
      page,
      pageSize,
      total,
    };
  }

  async getJobChunks(userId: string, id: string): Promise<DocumentEmbeddingJobChunksDto> {
    const job = await this.prisma.documentEmbeddingJob.findFirst({
      where: { id, userId },
      include: {
        document: {
          select: {
            title: true,
            type: true,
          },
        },
        chunks: {
          select: {
            id: true,
            chunkIndex: true,
            content: true,
            contentHash: true,
            startOffset: true,
            endOffset: true,
            provider: true,
            model: true,
            dimension: true,
            configFingerprint: true,
            documentId: true,
            jobId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('索引任务不存在');
    }
    if (job.status !== 'succeeded') {
      throw new BadRequestException('只有成功的索引任务可查看分片');
    }

    return {
      job: toEmbeddingJobDto(job),
      chunks: job.chunks.map(toEmbeddingChunkDto),
    };
  }

  async retryJob(userId: string, id: string) {
    const job = await this.prisma.documentEmbeddingJob.findFirst({
      where: { id, userId, status: 'failed' },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('索引任务不存在或当前状态不支持重试');
    }

    const retried = await this.prisma.documentEmbeddingJob.update({
      where: { id },
      data: {
        status: 'pending',
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });
    await this.queueService.addEmbeddingJob({ jobId: id });
    return { job: toEmbeddingJobDto(retried) };
  }

  async getDocumentIndexStatus(
    userId: string,
    documentId: string,
  ): Promise<{
    status: DocumentEmbeddingIndexStatus;
    errorMessage: string | null;
    indexedAt: string | null;
  }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        type: true,
        ingestStatus: true,
        deletedAt: true,
      },
    });
    if (
      !document ||
      document.deletedAt ||
      document.ingestStatus !== 'succeeded' ||
      !['article', 'fragment'].includes(document.type)
    ) {
      return { status: 'not_applicable', errorMessage: null, indexedAt: null };
    }

    let fingerprint: string;
    try {
      fingerprint = (await this.aiProviderService.getEmbeddingConfig()).fingerprint;
    } catch {
      return { status: 'not_configured', errorMessage: 'Embedding 未配置', indexedAt: null };
    }

    const job = await this.prisma.documentEmbeddingJob.findFirst({
      where: {
        userId,
        documentId,
        OR: [{ configFingerprint: fingerprint }, { configFingerprint: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) {
      return { status: 'not_applicable', errorMessage: null, indexedAt: null };
    }

    return {
      status: job.status,
      errorMessage: job.errorMessage,
      indexedAt: job.status === 'succeeded' ? job.finishedAt?.toISOString() ?? null : null,
    };
  }

  async retrieveRelevantChunks(
    userId: string,
    question: string,
    limit = 8,
    maxPerDocument = 2,
  ): Promise<RetrievedChunk[]> {
    const embedding = await this.aiProviderService.embedTexts([question]);
    const vector = toVectorLiteral(embedding.vectors[0]);
    const rows = await this.prisma.$queryRawUnsafe<VectorSearchRow[]>(
      `
      SELECT
        c."id",
        c."chunkIndex",
        c."content",
        c."startOffset",
        c."endOffset",
        (1 - (c."embedding" <=> $1::vector))::float AS "score",
        d."id" AS "documentId",
        d."title" AS "documentTitle",
        d."source" AS "documentSource",
        d."archivedAt" AS "documentArchivedAt",
        d."createdAt" AS "documentCreatedAt"
      FROM "DocumentEmbeddingChunk" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE c."userId" = $2
        AND c."configFingerprint" = $3
        AND c."dimension" = $4
        AND d."deletedAt" IS NULL
        AND d."ingestStatus" = 'succeeded'
        AND d."type" IN ('article', 'fragment')
      ORDER BY c."embedding" <=> $1::vector
      LIMIT 40
      `,
      vector,
      userId,
      embedding.config.fingerprint,
      embedding.dimension,
    );

    const perDocument = new Map<string, number>();
    const selected: RetrievedChunk[] = [];
    for (const row of rows) {
      const count = perDocument.get(row.documentId) || 0;
      if (count >= maxPerDocument) continue;
      perDocument.set(row.documentId, count + 1);
      selected.push(row);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  private async replaceDocumentChunks(input: {
    userId: string;
    documentId: string;
    jobId: string;
    provider: string;
    model: string;
    dimension: number;
    configFingerprint: string;
    chunks: ChunkDraft[];
    vectors: number[][];
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.documentEmbeddingChunk.deleteMany({
        where: {
          documentId: input.documentId,
          configFingerprint: input.configFingerprint,
        },
      });

      for (let index = 0; index < input.chunks.length; index += 1) {
        const chunk = input.chunks[index];
        const vector = input.vectors[index];
        await tx.$executeRawUnsafe(
          `
          INSERT INTO "DocumentEmbeddingChunk" (
            "id",
            "chunkIndex",
            "content",
            "contentHash",
            "startOffset",
            "endOffset",
            "provider",
            "model",
            "dimension",
            "configFingerprint",
            "embedding",
            "createdAt",
            "updatedAt",
            "documentId",
            "jobId",
            "userId"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $12, $13, $14
          )
          `,
          createCuidLikeId(),
          index,
          chunk.content,
          hashText(chunk.content),
          chunk.startOffset,
          chunk.endOffset,
          input.provider,
          input.model,
          input.dimension,
          input.configFingerprint,
          toVectorLiteral(vector),
          input.documentId,
          input.jobId,
          input.userId,
        );
      }
    });
  }
}

export function splitTextIntoChunks(text: string): ChunkDraft[] {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return [];

  const targetLength = 1000;
  const overlap = 150;
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: ChunkDraft[] = [];
  let current = '';
  let currentStart = 0;
  let searchOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphStart = normalized.indexOf(paragraph, searchOffset);
    const resolvedStart = paragraphStart >= 0 ? paragraphStart : searchOffset;
    searchOffset = resolvedStart + paragraph.length;

    if (!current) currentStart = resolvedStart;

    if (paragraph.length > targetLength) {
      if (current.trim()) {
        chunks.push({
          content: current.trim(),
          startOffset: currentStart,
          endOffset: currentStart + current.length,
        });
        current = '';
      }
      for (let i = 0; i < paragraph.length; i += targetLength - overlap) {
        const part = paragraph.slice(i, i + targetLength);
        chunks.push({
          content: part.trim(),
          startOffset: resolvedStart + i,
          endOffset: resolvedStart + i + part.length,
        });
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > targetLength && current.trim()) {
      chunks.push({
        content: current.trim(),
        startOffset: currentStart,
        endOffset: currentStart + current.length,
      });
      const suffix = current.slice(Math.max(0, current.length - overlap));
      current = suffix ? `${suffix}\n\n${paragraph}` : paragraph;
      currentStart = Math.max(resolvedStart - suffix.length, 0);
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      startOffset: currentStart,
      endOffset: currentStart + current.length,
    });
  }

  return chunks.filter((chunk) => chunk.content);
}

function toEmbeddingJobDto(
  job: {
    id: string;
    status: 'pending' | 'processing' | 'succeeded' | 'failed';
    errorMessage: string | null;
    provider: string | null;
    model: string | null;
    dimension: number | null;
    configFingerprint: string | null;
    chunkCount: number;
    documentId: string;
    document: {
      title: string;
      type: 'article' | 'video' | 'audio' | 'pdf' | 'fragment';
    };
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  },
): DocumentEmbeddingJobDto {
  return {
    id: job.id,
    status: job.status,
    errorMessage: job.errorMessage,
    provider: job.provider,
    model: job.model,
    dimension: job.dimension,
    configFingerprint: job.configFingerprint,
    chunkCount: job.chunkCount,
    documentId: job.documentId,
    documentTitle: job.document.title,
    documentType: job.document.type,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function toEmbeddingChunkDto(chunk: {
  id: string;
  chunkIndex: number;
  content: string;
  contentHash: string | null;
  startOffset: number;
  endOffset: number;
  provider: string;
  model: string;
  dimension: number;
  configFingerprint: string;
  documentId: string;
  jobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DocumentEmbeddingChunkDto {
  return {
    id: chunk.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    contentHash: chunk.contentHash,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    provider: chunk.provider,
    model: chunk.model,
    dimension: chunk.dimension,
    configFingerprint: chunk.configFingerprint,
    documentId: chunk.documentId,
    jobId: chunk.jobId,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}

function isEmbeddingStatus(value: unknown): value is 'pending' | 'processing' | 'succeeded' | 'failed' {
  return value === 'pending' || value === 'processing' || value === 'succeeded' || value === 'failed';
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function toVectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function createCuidLikeId() {
  return `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}
