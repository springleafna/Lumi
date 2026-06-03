import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ListDocumentsParams, PageResult, DocumentSummary } from '@lumi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentDetail, toDocumentSummary } from './document.mapper';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    params: ListDocumentsParams,
  ): Promise<PageResult<DocumentSummary>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const keyword = params.keyword?.trim();

    const where: Prisma.DocumentWhereInput = {
      userId,
      deletedAt: null,
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { contentText: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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

  async get(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException('文章不存在或已删除');
    }

    return toDocumentDetail(document);
  }

  async softDelete(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException('文章不存在或已删除');
    }

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { id };
  }
}
