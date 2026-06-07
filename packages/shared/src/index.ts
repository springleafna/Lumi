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
export type AiAnalysisStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type AiConversationStatus = 'processing' | 'succeeded' | 'failed';

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
  aiAnalysisStatus?: AiAnalysisStatus | null;
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

export type IngestUrlResponse = {
  document: DocumentDetail;
  job: IngestJobDto;
};

export type IngestHtmlResponse = IngestUrlResponse;

export type ListDocumentsParams = {
  keyword?: string;
  status?: DocumentStatus;
  type?: DocumentType;
  tag?: string;
  source?: string;
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
