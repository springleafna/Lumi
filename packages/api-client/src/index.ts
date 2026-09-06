import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type {
  AddDocumentTagRequest,
  AnnotationDto,
  AiAnalysisDto,
  AiConversationDto,
  AiProviderTestResultDto,
  AiSettingsDto,
  ApiResponse,
  CreateAnnotationRequest,
  CreateAiConversationRequest,
  CreateKnowledgeChatRequest,
  DocumentDetail,
  DocumentEmbeddingJobChunksDto,
  DocumentEmbeddingJobDto,
  DocumentFacets,
  DocumentSummary,
  IngestFileResponse,
  IngestHtmlRequest,
  IngestHtmlResponse,
  VideoTranscriptDto,
  IngestSelectionRequest,
  IngestSelectionResponse,
  IngestUrlRequest,
  IngestUrlResponse,
  KnowledgeChatSessionDto,
  ListEmbeddingJobsParams,
  ListDocumentsParams,
  LoginRequest,
  LoginResponse,
  PageResult,
  RegisterRequest,
  RetryAiAnalysisResponse,
  RetryEmbeddingJobResponse,
  RetryIngestResponse,
  UpdateAnnotationRequest,
  UpdateAiProviderConfigRequest,
  UpdateFavoriteRequest,
  UpdateKnowledgeChatSessionRequest,
  UpdateReadingStatusRequest,
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
      register: (payload: RegisterRequest) =>
        request<LoginResponse>(http, 'post', '/auth/register', payload),
      me: () => request<UserDto>(http, 'get', '/auth/me'),
    },
    ingest: {
      url: (payload: IngestUrlRequest) =>
        request<IngestUrlResponse>(http, 'post', '/ingest/url', payload),
      html: (payload: IngestHtmlRequest) =>
        request<IngestHtmlResponse>(http, 'post', '/ingest/html', payload),
      file: (payload: FormData) =>
        request<IngestFileResponse>(http, 'post', '/ingest/file', payload),
      selection: (payload: IngestSelectionRequest) =>
        request<IngestSelectionResponse>(http, 'post', '/ingest/selection', payload),
    },
    settings: {
      getAiSettings: () => request<AiSettingsDto>(http, 'get', '/settings/ai'),
      updateChatConfig: (payload: UpdateAiProviderConfigRequest) =>
        request<AiSettingsDto>(http, 'put', '/settings/ai/chat', payload),
      updateEmbeddingConfig: (payload: UpdateAiProviderConfigRequest) =>
        request<AiSettingsDto>(http, 'put', '/settings/ai/embedding', payload),
      clearChatConfig: () => request<AiSettingsDto>(http, 'delete', '/settings/ai/chat'),
      clearEmbeddingConfig: () =>
        request<AiSettingsDto>(http, 'delete', '/settings/ai/embedding'),
      testChatConfig: () =>
        request<AiProviderTestResultDto>(http, 'post', '/settings/ai/chat/test'),
      testEmbeddingConfig: () =>
        request<AiProviderTestResultDto>(http, 'post', '/settings/ai/embedding/test'),
    },
    embeddingJobs: {
      list: (params: ListEmbeddingJobsParams = {}) =>
        request<PageResult<DocumentEmbeddingJobDto>>(
          http,
          'get',
          '/settings/embedding-jobs',
          undefined,
          { params },
        ),
      retry: (id: string) =>
        request<RetryEmbeddingJobResponse>(
          http,
          'post',
          `/settings/embedding-jobs/${id}/retry`,
        ),
      chunks: (id: string) =>
        request<DocumentEmbeddingJobChunksDto>(
          http,
          'get',
          `/settings/embedding-jobs/${id}/chunks`,
        ),
    },
    knowledgeChat: {
      listSessions: () =>
        request<KnowledgeChatSessionDto[]>(http, 'get', '/knowledge-chat/sessions'),
      getSession: (id: string) =>
        request<KnowledgeChatSessionDto>(http, 'get', `/knowledge-chat/sessions/${id}`),
      updateSession: (id: string, payload: UpdateKnowledgeChatSessionRequest) =>
        request<KnowledgeChatSessionDto>(
          http,
          'patch',
          `/knowledge-chat/sessions/${id}`,
          payload,
        ),
      deleteSession: (id: string) =>
        request<{ id: string }>(http, 'delete', `/knowledge-chat/sessions/${id}`),
      askNewSession: (
        payload: CreateKnowledgeChatRequest,
        onEvent: (event: LumiSseEvent) => void,
        signal?: AbortSignal,
      ) =>
        streamSseRequest(
          options.baseUrl.replace(/\/$/, ''),
          options.getToken?.(),
          '/knowledge-chat/sessions/ask',
          payload,
          onEvent,
          signal,
        ),
      askInSession: (
        id: string,
        payload: CreateKnowledgeChatRequest,
        onEvent: (event: LumiSseEvent) => void,
        signal?: AbortSignal,
      ) =>
        streamSseRequest(
          options.baseUrl.replace(/\/$/, ''),
          options.getToken?.(),
          `/knowledge-chat/sessions/${id}/messages`,
          payload,
          onEvent,
          signal,
        ),
      regenerate: (
        messageId: string,
        onEvent: (event: LumiSseEvent) => void,
        signal?: AbortSignal,
      ) =>
        streamSseRequest(
          options.baseUrl.replace(/\/$/, ''),
          options.getToken?.(),
          `/knowledge-chat/messages/${messageId}/regenerate`,
          {},
          onEvent,
          signal,
        ),
    },
    documents: {
      list: (params: ListDocumentsParams = {}) =>
        request<PageResult<DocumentSummary>>(http, 'get', '/documents', undefined, {
          params,
        }),
      facets: () => request<DocumentFacets>(http, 'get', '/documents/facets'),
      get: (id: string) => request<DocumentDetail>(http, 'get', `/documents/${id}`),
      getTranscript: (id: string) =>
        request<VideoTranscriptDto>(http, 'get', `/documents/${id}/transcript`),
      delete: (id: string) => request<{ id: string }>(http, 'delete', `/documents/${id}`),
      archive: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/archive`),
      unarchive: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/unarchive`),
      restore: (id: string) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/restore`),
      permanentDelete: (id: string) =>
        request<{ id: string }>(http, 'delete', `/documents/${id}/permanent`),
      updateReadingStatus: (id: string, payload: UpdateReadingStatusRequest) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/reading-status`, payload),
      updateFavorite: (id: string, payload: UpdateFavoriteRequest) =>
        request<DocumentDetail>(http, 'patch', `/documents/${id}/favorite`, payload),
      addTag: (id: string, payload: AddDocumentTagRequest) =>
        request<DocumentDetail>(http, 'post', `/documents/${id}/tags`, payload),
      removeTag: (id: string, tagId: string) =>
        request<DocumentDetail>(http, 'delete', `/documents/${id}/tags/${tagId}`),
      listAnnotations: (id: string) =>
        request<AnnotationDto[]>(http, 'get', `/documents/${id}/annotations`),
      createAnnotation: (id: string, payload: CreateAnnotationRequest) =>
        request<AnnotationDto>(http, 'post', `/documents/${id}/annotations`, payload),
      updateAnnotation: (
        id: string,
        annotationId: string,
        payload: UpdateAnnotationRequest,
      ) =>
        request<AnnotationDto>(
          http,
          'patch',
          `/documents/${id}/annotations/${annotationId}`,
          payload,
        ),
      deleteAnnotation: (id: string, annotationId: string) =>
        request<{ id: string }>(
          http,
          'delete',
          `/documents/${id}/annotations/${annotationId}`,
        ),
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

export type LumiSseEvent = {
  event: string;
  data: unknown;
};

async function request<T>(
  http: AxiosInstance,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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

async function streamSseRequest(
  baseUrl: string,
  token: string | null | undefined,
  url: string,
  data: unknown,
  onEvent: (event: LumiSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal,
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
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() || '';
    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      if (parsed) onEvent(parsed);
    }
  }

  const parsed = parseSseEvent(buffer);
  if (parsed) onEvent(parsed);
}

function parseSseEvent(raw: string): LumiSseEvent | null {
  const lines = raw.split(/\n/);
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;
  const rawData = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
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
