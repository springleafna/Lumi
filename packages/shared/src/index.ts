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
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentDetail = DocumentSummary & {
  markdown: string;
  contentText?: string | null;
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

export type IngestUrlResponse = {
  document: DocumentDetail;
  job: IngestJobDto;
};

export type ListDocumentsParams = {
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
