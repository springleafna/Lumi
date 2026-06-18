import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import type {
  AnnotationDto,
  CreateAnnotationRequest,
  DocumentFacets,
  DocumentDetail,
  DocumentReadingStatus,
  DocumentSort,
  DocumentStatus,
  DocumentSummary,
  ListDocumentsParams,
  PageResult,
  UpdateAnnotationRequest,
} from '@lumi/shared';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { MediaArchiveService } from '../media/media-archive.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DocumentWithTags,
  toAnnotationDto,
  toDocumentDetail,
  toDocumentSummary,
} from './document.mapper';
import { getErrorMessage } from '../common/error.utils';

const documentInclude = {
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        name: 'asc',
      },
    },
  },
  aiAnalysis: true,
} satisfies Prisma.DocumentInclude;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly mediaArchiveService: MediaArchiveService,
  ) {}

  async list(
    userId: string,
    params: ListDocumentsParams,
  ): Promise<PageResult<DocumentSummary>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const where = this.buildListWhere(userId, params);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: documentInclude,
        orderBy: this.toOrderBy(params.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map(toDocumentSummary),
      page,
      pageSize,
      total,
    };
  }

  async facets(userId: string): Promise<DocumentFacets> {
    const [tags, sources] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              documents: {
                where: {
                  document: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.document.groupBy({
        by: ['source'],
        where: {
          userId,
          deletedAt: null,
          source: { not: null },
        },
        _count: {
          source: true,
        },
        orderBy: {
          source: 'asc',
        },
      }),
    ]);

    return {
      tags: tags
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          count: tag._count.documents,
        }))
        .filter((tag) => tag.count > 0),
      sources: sources
        .filter((source) => source.source)
        .map((source) => ({
          source: source.source!,
          count: getGroupCount(source._count),
        })),
    };
  }

  async get(userId: string, id: string) {
    const document = await this.findOwnedDocument(userId, id);
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async archive(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: documentInclude,
    });
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async unarchive(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: null },
      include: documentInclude,
    });
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async restore(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: { not: null } });
    const document = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: null },
      include: documentInclude,
    });
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async softDelete(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async updateReadingStatus(
    userId: string,
    id: string,
    readingStatus: DocumentReadingStatus,
  ) {
    if (!['unread', 'read'].includes(readingStatus)) {
      throw new BadRequestException('阅读状态不正确');
    }

    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { readingStatus },
      include: documentInclude,
    });
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async updateFavorite(userId: string, id: string, favorite: boolean) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { favoritedAt: favorite ? new Date() : null },
      include: documentInclude,
    });
    return this.toDocumentDetailWithEmbeddingStatus(userId, document);
  }

  async listAnnotations(userId: string, documentId: string): Promise<AnnotationDto[]> {
    await this.ensureOwnedDocument(userId, documentId);
    const annotations = await this.prisma.annotation.findMany({
      where: { userId, documentId },
      orderBy: [{ startOffset: 'asc' }, { createdAt: 'asc' }],
    });
    return annotations.map(toAnnotationDto);
  }

  async createAnnotation(
    userId: string,
    documentId: string,
    input: CreateAnnotationRequest,
  ): Promise<AnnotationDto> {
    await this.ensureAnnotatableDocument(userId, documentId);
    const data = this.normalizeAnnotationInput(input);

    const overlap = await this.prisma.annotation.findFirst({
      where: {
        userId,
        documentId,
        startOffset: { lt: data.endOffset },
        endOffset: { gt: data.startOffset },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('该区域已有高亮');
    }

    const annotation = await this.prisma.annotation.create({
      data: {
        userId,
        documentId,
        ...data,
      },
    });
    return toAnnotationDto(annotation);
  }

  async updateAnnotation(
    userId: string,
    documentId: string,
    annotationId: string,
    input: UpdateAnnotationRequest,
  ): Promise<AnnotationDto> {
    await this.ensureAnnotatableDocument(userId, documentId);
    const note = this.normalizeAnnotationNote(input.note);
    await this.ensureOwnedAnnotation(userId, documentId, annotationId);

    const annotation = await this.prisma.annotation.update({
      where: { id: annotationId },
      data: { note },
    });
    return toAnnotationDto(annotation);
  }

  async deleteAnnotation(userId: string, documentId: string, annotationId: string) {
    await this.ensureAnnotatableDocument(userId, documentId);
    await this.ensureOwnedAnnotation(userId, documentId, annotationId);
    await this.prisma.annotation.delete({
      where: { id: annotationId },
    });
    return { id: annotationId };
  }

  async permanentDelete(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: { not: null } });
    const mediaAssets = await this.prisma.documentMediaAsset.findMany({
      where: {
        userId,
        documentId: id,
        status: 'succeeded',
        objectKey: { not: null },
      },
      select: { objectKey: true },
    });

    await this.prisma.document.delete({
      where: { id },
    });

    try {
      await this.mediaArchiveService.deleteObjectsBestEffort(
        mediaAssets.map((asset) => asset.objectKey),
      );
    } catch (error) {
      this.logger.warn(`媒体对象删除流程失败 ${id}: ${getErrorMessage(error)}`);
    }

    return { id };
  }

  async addTag(userId: string, id: string, rawName: string) {
    const name = rawName?.trim();
    if (!name) {
      throw new BadRequestException('请输入标签名称');
    }

    await this.ensureOwnedDocument(userId, id);
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
          documentId: id,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        documentId: id,
        tagId: tag.id,
      },
    });

    return this.get(userId, id);
  }

  async removeTag(userId: string, id: string, tagId: string) {
    await this.ensureOwnedDocument(userId, id);
    const relation = await this.prisma.documentTag.findFirst({
      where: {
        documentId: id,
        tagId,
        tag: {
          userId,
        },
      },
    });
    if (!relation) {
      throw new NotFoundException('标签不存在或未关联到文章');
    }

    await this.prisma.documentTag.delete({
      where: {
        documentId_tagId: {
          documentId: id,
          tagId,
        },
      },
    });

    return this.get(userId, id);
  }

  private buildListWhere(
    userId: string,
    params: ListDocumentsParams,
  ): Prisma.DocumentWhereInput {
    const keyword = params.keyword?.trim();
    const status = this.normalizeStatus(params.status);
    const readingStatus = this.normalizeReadingStatus(params.readingStatus);

    return {
      userId,
      ...this.toStatusWhere(status),
      ...(params.type ? { type: params.type } : {}),
      ...(params.tag
        ? {
            tags: {
              some: {
                tagId: params.tag,
                tag: { userId },
              },
            },
          }
        : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(readingStatus ? { readingStatus } : {}),
      ...(params.favorite ? { favoritedAt: { not: null } } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { excerpt: { contains: keyword, mode: 'insensitive' } },
              { contentText: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private toStatusWhere(status: DocumentStatus): Prisma.DocumentWhereInput {
    if (status === 'archived') {
      return {
        archivedAt: { not: null },
        deletedAt: null,
      };
    }

    if (status === 'trash') {
      return {
        deletedAt: { not: null },
      };
    }

    return {
      archivedAt: null,
      deletedAt: null,
    };
  }

  private toOrderBy(sort?: DocumentSort): Prisma.DocumentOrderByWithRelationInput {
    if (sort === 'created_asc') return { createdAt: 'asc' };
    if (sort === 'updated_desc') return { updatedAt: 'desc' };
    if (sort === 'updated_asc') return { updatedAt: 'asc' };
    return { createdAt: 'desc' };
  }

  private normalizeStatus(status?: DocumentStatus): DocumentStatus {
    if (status === 'archived' || status === 'trash') return status;
    return 'active';
  }

  private normalizeReadingStatus(
    readingStatus?: DocumentReadingStatus,
  ): DocumentReadingStatus | undefined {
    if (readingStatus === 'unread' || readingStatus === 'read') return readingStatus;
    return undefined;
  }

  private async findOwnedDocument(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
      include: documentInclude,
    });
    if (!document) {
      throw new NotFoundException('文章不存在');
    }
    return document;
  }

  private async toDocumentDetailWithEmbeddingStatus(
    userId: string,
    document: DocumentWithTags,
  ): Promise<DocumentDetail> {
    const detail = toDocumentDetail(document);
    const indexStatus = await this.embeddingsService.getDocumentIndexStatus(
      userId,
      document.id,
    );
    return {
      ...detail,
      embeddingIndexStatus: indexStatus.status,
      embeddingIndexErrorMessage: indexStatus.errorMessage,
      embeddingIndexedAt: indexStatus.indexedAt,
    };
  }

  private async ensureOwnedDocument(
    userId: string,
    id: string,
    extraWhere: Prisma.DocumentWhereInput = {},
  ) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        userId,
        ...extraWhere,
      },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('文章不存在或状态不允许操作');
    }
  }

  private async ensureAnnotatableDocument(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
        ingestStatus: 'succeeded',
      },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('文章不存在或状态不允许操作');
    }
  }

  private async ensureOwnedAnnotation(
    userId: string,
    documentId: string,
    annotationId: string,
  ) {
    const annotation = await this.prisma.annotation.findFirst({
      where: { id: annotationId, userId, documentId },
      select: { id: true },
    });
    if (!annotation) {
      throw new NotFoundException('高亮不存在');
    }
  }

  private normalizeAnnotationInput(input: CreateAnnotationRequest) {
    const selectedText = input.selectedText?.trim();
    if (!selectedText) {
      throw new BadRequestException('请选择要高亮的正文');
    }
    if (selectedText.length > 2000) {
      throw new BadRequestException('高亮内容过长，请缩短选择范围');
    }

    const note = this.normalizeAnnotationNote(input.note);
    const startOffset = Number(input.startOffset);
    const endOffset = Number(input.endOffset);
    if (
      !Number.isInteger(startOffset) ||
      !Number.isInteger(endOffset) ||
      startOffset < 0 ||
      endOffset <= startOffset
    ) {
      throw new BadRequestException('高亮位置信息不正确');
    }

    return {
      selectedText,
      note,
      prefix: input.prefix?.trim() || null,
      suffix: input.suffix?.trim() || null,
      occurrenceIndex: Math.max(0, Number(input.occurrenceIndex) || 0),
      startOffset,
      endOffset,
    };
  }

  private normalizeAnnotationNote(value: string | null | undefined) {
    const note = value?.trim() || null;
    if (note && note.length > 1000) {
      throw new BadRequestException('批注内容过长');
    }
    return note;
  }
}

function getGroupCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const count = (value as { source?: unknown; _all?: unknown }).source;
  if (typeof count === 'number') return count;
  const allCount = (value as { _all?: unknown })._all;
  return typeof allCount === 'number' ? allCount : 0;
}
