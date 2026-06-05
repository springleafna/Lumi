import type { Document, DocumentTag, IngestJob, Tag } from '@prisma/client';
import type { DocumentDetail, DocumentSummary, IngestJobDto, TagDto } from '@lumi/shared';

export type DocumentWithTags = Document & {
  tags?: Array<DocumentTag & { tag: Tag }>;
};

export function toDocumentSummary(document: DocumentWithTags): DocumentSummary {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    url: document.url,
    source: document.source,
    author: document.author,
    excerpt: document.excerpt,
    coverImage: document.coverImage,
    wordCount: document.wordCount,
    archivedAt: toIso(document.archivedAt),
    deletedAt: toIso(document.deletedAt),
    publishedAt: toIso(document.publishedAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    tags: toTagDtos(document.tags),
  };
}

export function toDocumentDetail(document: DocumentWithTags): DocumentDetail {
  return {
    ...toDocumentSummary(document),
    markdown: document.markdown,
    contentText: document.contentText,
  };
}

function toTagDtos(tags?: Array<DocumentTag & { tag: Tag }>): TagDto[] {
  return tags?.map(({ tag }) => ({ id: tag.id, name: tag.name })) ?? [];
}

export function toIngestJobDto(job: IngestJob): IngestJobDto {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    inputUrl: job.inputUrl,
    errorMessage: job.errorMessage,
    documentId: job.documentId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: toIso(job.startedAt),
    finishedAt: toIso(job.finishedAt),
  };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
