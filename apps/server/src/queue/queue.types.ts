export type IngestQueueJobName = 'ingest:url' | 'ingest:html';

export type IngestQueueJobData = {
  jobId: string;
};

export type AiAnalysisQueueJobName = 'ai:analyze-document';

export type AiAnalysisQueueJobData = {
  documentId: string;
  userId: string;
};
