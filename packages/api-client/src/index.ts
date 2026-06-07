import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type {
  AddDocumentTagRequest,
  AiAnalysisDto,
  AiConversationDto,
  ApiResponse,
  CreateAiConversationRequest,
  DocumentDetail,
  DocumentFacets,
  DocumentSummary,
  IngestHtmlRequest,
  IngestHtmlResponse,
  IngestUrlRequest,
  IngestUrlResponse,
  ListDocumentsParams,
  LoginRequest,
  LoginResponse,
  PageResult,
  RetryAiAnalysisResponse,
  RetryIngestResponse,
  UserDto,
} from '@lumi/shared';

export type LumiClientOptions = {
  baseUrl: string;
  getToken?: () => string | null | undefined;
};

export class LumiApiError extends Error {
  code: number | string;
  data: unknown;
  status?: number;

  constructor(input: {
    code: number | string;
    message: string;
    data?: unknown;
    status?: number;
  }) {
    super(input.message);
    this.name = 'LumiApiError';
    this.code = input.code;
    this.data = input.data;
    this.status = input.status;
  }
}

export function createLumiClient(options: LumiClientOptions) {
  const http = axios.create({
    baseURL: options.baseUrl.replace(/\/$/, ''),
    timeout: 20000,
  });

  http.interceptors.request.use((config) => {
    const token = options.getToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return {
    auth: {
      login: (payload: LoginRequest) =>
        request<LoginResponse>(http, 'post', '/auth/login', payload),
      me: () => request<UserDto>(http, 'get', '/auth/me'),
    },
    ingest: {
      url: (payload: IngestUrlRequest) =>
        request<IngestUrlResponse>(http, 'post', '/ingest/url', payload),
      html: (payload: IngestHtmlRequest) =>
        request<IngestHtmlResponse>(http, 'post', '/ingest/html', payload),
    },
    documents: {
      list: (params: ListDocumentsParams = {}) =>
        request<PageResult<DocumentSummary>>(http, 'get', '/documents', undefined, {
          params,
        }),
      facets: () => request<DocumentFacets>(http, 'get', '/documents/facets'),
      get: (id: string) => request<DocumentDetail>(http, 'get', `/documents/${id}`),
      delete: (id: string) => request<{ id: string }>(http, 'delete', `/documents/${id}`),
      archive: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/archive`),
      unarchive: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/unarchive`),
      restore: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/restore`),
      permanentDelete: (id: string) =>
        request<{ id: string }>(http, 'delete', `/documents/${id}/permanent`),
      addTag: (id: string, payload: AddDocumentTagRequest) =>
        request<DocumentDetail>(http, 'post', `/documents/${id}/tags`, payload),
      removeTag: (id: string, tagId: string) =>
        request<DocumentDetail>(http, 'delete', `/documents/${id}/tags/${tagId}`),
      retryIngest: (id: string) =>
        request<RetryIngestResponse>(http, 'post', `/documents/${id}/retry-ingest`),
      getAiAnalysis: (id: string) =>
        request<AiAnalysisDto | null>(http, 'get', `/documents/${id}/ai-analysis`),
      retryAiAnalysis: (id: string) =>
        request<RetryAiAnalysisResponse>(http, 'post', `/documents/${id}/ai-analysis/retry`),
      listAiConversations: (id: string) =>
        request<AiConversationDto[]>(http, 'get', `/documents/${id}/ai-conversations`),
      streamAiConversation: (
        id: string,
        payload: CreateAiConversationRequest,
        onChunk: (chunk: string) => void,
      ) =>
        streamRequest(
          options.baseUrl.replace(/\/$/, ''),
          options.getToken?.(),
          `/documents/${id}/ai-conversations`,
          payload,
          onChunk,
        ),
    },
  };
}

async function request<T>(
  http: AxiosInstance,
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  data?: unknown,
  config?: Record<string, unknown>,
): Promise<T> {
  try {
    const response = await http.request<ApiResponse<T>>({
      method,
      url,
      data,
      ...config,
    });

    if (response.data.code !== 0) {
      throw new LumiApiError({
        code: response.data.code,
        message: response.data.message,
        data: response.data.data,
        status: response.status,
      });
    }

    return response.data.data;
  } catch (error) {
    if (error instanceof LumiApiError) {
      throw error;
    }

    const axiosError = error as AxiosError<ApiResponse<unknown>>;
    const response = axiosError.response;
    if (response?.data) {
      throw new LumiApiError({
        code: response.data.code,
        message: response.data.message,
        data: response.data.data,
        status: response.status,
      });
    }

    throw new LumiApiError({
      code: 'NETWORK_ERROR',
      message: axiosError.message || '请求失败',
      status: response?.status,
    });
  }
}

async function streamRequest(
  baseUrl: string,
  token: string | null | undefined,
  url: string,
  data: unknown,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const response = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new LumiApiError({
      code: response.status,
      message: await response.text(),
      status: response.status,
    });
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
