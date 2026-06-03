import type { Document, IngestJob } from '@prisma/client';
import type { DocumentDetail, DocumentSummary, IngestJobDto } from '@lumi/shared';

export function toDocumentSummary(document: Document): DocumentSummary {
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
    publishedAt: toIso(document.publishedAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toDocumentDetail(document: Document): DocumentDetail {
  return {
    ...toDocumentSummary(document),
    markdown: document.markdown,
    contentText: document.contentText,
  };
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
