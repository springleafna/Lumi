import type { VideoSummaryMode } from '@lumi/shared';

export type IngestQueueJobName = 'ingest:url' | 'ingest:html' | 'ingest:video';

export type IngestQueueJobData = {
  jobId: string;
};

export type AiAnalysisQueueJobName = 'ai:analyze-document';

export type AiAnalysisQueueJobData = {
  documentId: string;
  userId: string;
  /** 视频总结模式；不传时按速览（brief）处理 */
  mode?: VideoSummaryMode;
};

export type EmbeddingQueueJobName = 'embedding:index-document';

export type EmbeddingQueueJobData = {
  jobId: string;
};
