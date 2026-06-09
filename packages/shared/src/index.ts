export type ApiResponse<T> = {
  code: number | string;
  message: string;
  data: T;
};

export type UserDto = {
  id: string;
  username: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  user: UserDto;
};

export type DocumentType = 'article' | 'video' | 'audio' | 'pdf' | 'fragment';
export type DocumentStatus = 'active' | 'archived' | 'trash';
export type DocumentSort = 'created_desc' | 'created_asc' | 'updated_desc' | 'updated_asc';
export type DocumentIngestStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type DocumentReadingStatus = 'unread' | 'read';
export type AiAnalysisStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type AiConversationStatus = 'processing' | 'succeeded' | 'failed';
export type AiProviderTestStatus = 'succeeded' | 'failed';
export type DocumentEmbeddingStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type DocumentEmbeddingIndexStatus =
  | 'not_applicable'
  | 'not_configured'
  | DocumentEmbeddingStatus;
export type KnowledgeChatMessageStatus = 'processing' | 'succeeded' | 'failed' | 'aborted';

export type TagDto = {
  id: string;
  name: string;
  count?: number;
};

export type SourceFacetDto = {
  source: string;
  count: number;
};

export type DocumentSummary = {
  id: string;
  type: DocumentType;
  title: string;
  url?: string | null;
  source?: string | null;
  author?: string | null;
  excerpt?: string | null;
  coverImage?: string | null;
  wordCount?: number | null;
  ingestStatus: DocumentIngestStatus;
  ingestErrorMessage?: string | null;
  readingStatus: DocumentReadingStatus;
  favoritedAt?: string | null;
  aiAnalysisStatus?: AiAnalysisStatus | null;
  embeddingIndexStatus?: DocumentEmbeddingIndexStatus | null;
  embeddingIndexErrorMessage?: string | null;
  embeddingIndexedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagDto[];
};

export type DocumentDetail = DocumentSummary & {
  markdown: string;
  contentText?: string | null;
  aiAnalysis?: AiAnalysisDto | null;
};

export type IngestJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type IngestJobType = 'url' | 'html' | 'selection' | 'file';

export type IngestJobDto = {
  id: string;
  type: IngestJobType;
  status: IngestJobStatus;
  inputUrl?: string | null;
  errorMessage?: string | null;
  documentId?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type IngestUrlRequest = {
  url: string;
};

export type IngestHtmlRequest = {
  url: string;
  title?: string;
  html: string;
};

export type IngestSelectionRequest = {
  url: string;
  title?: string;
  selectedHtml?: string;
  selectedText?: string;
};

export type IngestUrlResponse = {
  document: DocumentDetail;
  job: IngestJobDto;
};

export type IngestHtmlResponse = IngestUrlResponse;
export type IngestFileResponse = IngestUrlResponse;
export type IngestSelectionResponse = IngestUrlResponse;

export type ListDocumentsParams = {
  keyword?: string;
  status?: DocumentStatus;
  type?: DocumentType;
  tag?: string;
  source?: string;
  readingStatus?: DocumentReadingStatus;
  favorite?: boolean;
  sort?: DocumentSort;
  page?: number;
  pageSize?: number;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type DocumentFacets = {
  tags: TagDto[];
  sources: SourceFacetDto[];
};

export type AddDocumentTagRequest = {
  name: string;
};

export type UpdateReadingStatusRequest = {
  readingStatus: DocumentReadingStatus;
};

export type UpdateFavoriteRequest = {
  favorite: boolean;
};

export type AnnotationDto = {
  id: string;
  selectedText: string;
  note?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  occurrenceIndex: number;
  startOffset: number;
  endOffset: number;
  createdAt: string;
  updatedAt: string;
  documentId: string;
};

export type CreateAnnotationRequest = {
  selectedText: string;
  note?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  occurrenceIndex?: number;
  startOffset: number;
  endOffset: number;
};

export type UpdateAnnotationRequest = {
  note?: string | null;
};

export type AiCitationDto = {
  index: number;
  text: string;
  score?: number;
};

export type AiAnalysisDto = {
  id: string;
  status: AiAnalysisStatus;
  provider?: string | null;
  model?: string | null;
  language: string;
  oneSentenceSummary?: string | null;
  summary?: string | null;
  keyPoints: string[];
  concepts: string[];
  actions: string[];
  audience?: string | null;
  suggestedTags: string[];
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  documentId: string;
};

export type AiConversationDto = {
  id: string;
  question: string;
  answer?: string | null;
  citations: AiCitationDto[];
  status: AiConversationStatus;
  provider?: string | null;
  model?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
  documentId: string;
};

export type CreateAiConversationRequest = {
  question: string;
};

export type RetryAiAnalysisResponse = {
  analysis: AiAnalysisDto;
};

export type RetryIngestResponse = {
  document: DocumentDetail;
  job: IngestJobDto;
};

export type AiProviderConfigDto = {
  configured: boolean;
  providerPreset?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  hasApiKey: boolean;
  dimension?: number | null;
  lastTestStatus?: AiProviderTestStatus | null;
  lastTestError?: string | null;
  lastTestedAt?: string | null;
};

export type AiSettingsDto = {
  chat: AiProviderConfigDto;
  embedding: AiProviderConfigDto;
  encryptionReady: boolean;
};

export type UpdateAiProviderConfigRequest = {
  providerPreset?: string | null;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
};

export type AiProviderTestResultDto = {
  status: AiProviderTestStatus;
  message?: string | null;
  testedAt: string;
  dimension?: number | null;
};

export type ListEmbeddingJobsParams = {
  status?: DocumentEmbeddingStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type DocumentEmbeddingJobDto = {
  id: string;
  status: DocumentEmbeddingStatus;
  errorMessage?: string | null;
  provider?: string | null;
  model?: string | null;
  dimension?: number | null;
  configFingerprint?: string | null;
  chunkCount: number;
  documentId: string;
  documentTitle: string;
  documentType: DocumentType;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type DocumentEmbeddingChunkDto = {
  id: string;
  chunkIndex: number;
  content: string;
  contentHash?: string | null;
  startOffset: number;
  endOffset: number;
  provider: string;
  model: string;
  dimension: number;
  configFingerprint: string;
  documentId: string;
  jobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentEmbeddingJobChunksDto = {
  job: DocumentEmbeddingJobDto;
  chunks: DocumentEmbeddingChunkDto[];
};

export type RetryEmbeddingJobResponse = {
  job: DocumentEmbeddingJobDto;
};

export type KnowledgeChatCitationDto = {
  id: string;
  index: number;
  excerpt: string;
  score?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  documentId?: string | null;
  chunkId?: string | null;
  documentTitle: string;
  documentSource?: string | null;
  documentArchivedAt?: string | null;
  documentCreatedAt?: string | null;
  sourceDeleted: boolean;
  createdAt: string;
};

export type KnowledgeChatMessageDto = {
  id: string;
  question: string;
  answer?: string | null;
  status: KnowledgeChatMessageStatus;
  provider?: string | null;
  model?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
  citations: KnowledgeChatCitationDto[];
};

export type KnowledgeChatSessionDto = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: KnowledgeChatMessageDto[];
};

export type CreateKnowledgeChatRequest = {
  question: string;
};

export type UpdateKnowledgeChatSessionRequest = {
  title: string;
};
