import type {
  AiAnalysis,
  AiConversation,
  Annotation,
  Document,
  DocumentTag,
  IngestJob,
  Prisma,
  Tag,
} from '../generated/prisma';
import type {
  AiAnalysisDto,
  AiCitationDto,
  AiConversationDto,
  AnnotationDto,
  DocumentDetail,
  DocumentSummary,
  IngestJobDto,
  TagDto,
} from '@lumi/shared';

export type DocumentWithTags = Document & {
  tags?: Array<DocumentTag & { tag: Tag }>;
  aiAnalysis?: AiAnalysis | null;
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
    videoPlatform: document.videoPlatform,
    videoDurationSeconds: document.videoDurationSeconds,
    wordCount: document.wordCount,
    ingestStatus: document.ingestStatus,
    ingestErrorMessage: document.ingestErrorMessage,
    readingStatus: document.readingStatus,
    favoritedAt: toIso(document.favoritedAt),
    aiAnalysisStatus: document.aiAnalysis?.status ?? null,
    archivedAt: toIso(document.archivedAt),
    deletedAt: toIso(document.deletedAt),
    publishedAt: toIso(document.publishedAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    tags: toTagDtos(document.tags),
  };
}

export function toAnnotationDto(annotation: Annotation): AnnotationDto {
  return {
    id: annotation.id,
    selectedText: annotation.selectedText,
    note: annotation.note,
    prefix: annotation.prefix,
    suffix: annotation.suffix,
    occurrenceIndex: annotation.occurrenceIndex,
    startOffset: annotation.startOffset,
    endOffset: annotation.endOffset,
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
    documentId: annotation.documentId,
  };
}

export function toDocumentDetail(document: DocumentWithTags): DocumentDetail {
  return {
    ...toDocumentSummary(document),
    markdown: document.markdown,
    contentText: document.contentText,
    aiAnalysis: document.aiAnalysis ? toAiAnalysisDto(document.aiAnalysis) : null,
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

export function toAiAnalysisDto(analysis: AiAnalysis): AiAnalysisDto {
  return {
    id: analysis.id,
    status: analysis.status,
    provider: analysis.provider,
    model: analysis.model,
    language: analysis.language,
    oneSentenceSummary: analysis.oneSentenceSummary,
    summary: analysis.summary,
    keyPoints: toStringArray(analysis.keyPoints),
    concepts: toStringArray(analysis.concepts),
    actions: toStringArray(analysis.actions),
    audience: analysis.audience,
    suggestedTags: toStringArray(analysis.suggestedTags),
    errorMessage: analysis.errorMessage,
    startedAt: toIso(analysis.startedAt),
    finishedAt: toIso(analysis.finishedAt),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    documentId: analysis.documentId,
  };
}

export function toAiConversationDto(conversation: AiConversation): AiConversationDto {
  return {
    id: conversation.id,
    question: conversation.question,
    answer: conversation.answer,
    citations: toCitations(conversation.citations),
    status: conversation.status,
    provider: conversation.provider,
    model: conversation.model,
    errorMessage: conversation.errorMessage,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    finishedAt: toIso(conversation.finishedAt),
    documentId: conversation.documentId,
  };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toCitations(value: Prisma.JsonValue | null): AiCitationDto[] {
  if (!Array.isArray(value)) return [];

  const citations: AiCitationDto[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const index = Number(record.index);
    const text = typeof record.text === 'string' ? record.text : '';
    const score = Number(record.score);
    if (!Number.isFinite(index) || !text) continue;
    citations.push({
      index,
      text,
      score: Number.isFinite(score) ? score : undefined,
    });
  }
  return citations;
}
