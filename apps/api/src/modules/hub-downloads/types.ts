export type HubModelSearchResult = {
  id: string;
  author: string;
  repoId: string;
  downloads: number;
  likes: number;
  lastModified: string | null;
  pipelineTag: string | null;
  files: Array<{
    fileName: string;
    fileSizeBytes: number | null;
  }>;
};

export type HubModelSearchResponse = {
  items: HubModelSearchResult[];
  nextCursor: string | null;
};

export type DownloadJobStatus =
  | 'pending'
  | 'downloading'
  | 'installing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DownloadJobSnapshot = {
  id: string;
  status: DownloadJobStatus;
  modelType: 'llm' | 'stt' | 'tts';
  repoId: string;
  fileName: string;
  displayName: string;
  totalBytes: number | null;
  downloadedBytes: number;
  progressPercent: number | null;
  bytesPerSecond: number;
  etaSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  installedModelId: string | null;
};
