import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import type {
  DocumentFacets,
  DocumentSort,
  DocumentStatus,
  DocumentSummary,
  ListDocumentsParams,
  PageResult,
} from '@lumi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentDetail, toDocumentSummary } from './document.mapper';

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
  constructor(private readonly prisma: PrismaService) {}

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
    return toDocumentDetail(document);
  }

  async archive(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: documentInclude,
    });
    return toDocumentDetail(document);
  }

  async unarchive(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    const document = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: null },
      include: documentInclude,
    });
    return toDocumentDetail(document);
  }

  async restore(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: { not: null } });
    const document = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: null },
      include: documentInclude,
    });
    return toDocumentDetail(document);
  }

  async softDelete(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: null });
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async permanentDelete(userId: string, id: string) {
    await this.ensureOwnedDocument(userId, id, { deletedAt: { not: null } });
    await this.prisma.document.delete({
      where: { id },
    });
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
}

function getGroupCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const count = (value as { source?: unknown; _all?: unknown }).source;
  if (typeof count === 'number') return count;
  const allCount = (value as { _all?: unknown })._all;
  return typeof allCount === 'number' ? allCount : 0;
}
