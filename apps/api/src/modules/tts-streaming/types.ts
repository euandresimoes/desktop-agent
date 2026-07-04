export type TTSStreamEventType =
  | 'session.start'
  | 'audio.chunk'
  | 'text.chunk'
  | 'metrics'
  | 'status'
  | 'warning'
  | 'session.complete'
  | 'session.cancelled'
  | 'session.error';

export type TTSStreamEnvelope<TType extends TTSStreamEventType, TPayload> = {
  version: 'v1';
  type: TType;
  sessionId: string;
  timestamp: number;
  payload: TPayload;
};

export type TTSSessionStartPayload = {
  voiceId: string;
  provider: string;
  sampleRate: number;
  channels: number;
  sampleFormat: 'pcm_s16le';
};

export type TTSAudioChunkPayload = {
  sequence: number;
  chunkId: string;
  encoding: 'pcm_s16le';
  sampleRate: number;
  channels: number;
  frameCount: number;
  durationMs: number;
  audioBase64: string;
};

export type TTSTextChunkPayload = {
  sequence: number;
  text: string;
  isFinal: boolean;
};

export type TTSMetricsPayload = {
  timeToFirstChunkMs: number;
  audioChunksSent: number;
  textChunksSent: number;
  generatedAudioDurationMs: number;
  elapsedMs: number;
};
