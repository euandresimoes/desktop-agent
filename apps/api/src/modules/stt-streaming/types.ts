export type STTStreamingEncoding = 'pcm_f32le';

export type STTStreamingClientCommandType =
  | 'session.start'
  | 'audio.chunk'
  | 'session.commit'
  | 'session.cancel'
  | 'session.ping';

export type STTStreamingServerEventType =
  | 'session.ready'
  | 'transcript.partial'
  | 'transcript.confirmed'
  | 'transcript.final'
  | 'metrics'
  | 'session.cancelled'
  | 'session.error';

export type STTStreamingEnvelope<TType extends string, TPayload> = {
  version: 'v1';
  type: TType;
  sessionId: string;
  timestamp: number;
  payload: TPayload;
};

export type STTStreamingSessionStartPayload = {
  sampleRate: number;
  channels: number;
  encoding: STTStreamingEncoding;
};

export type STTStreamingAudioChunkPayload = {
  chunkId: string;
  sequence: number;
  audioBase64: string;
  frameCount: number;
};

export type STTStreamingSessionCommitPayload = {
  reason?: string;
};

export type STTStreamingSessionReadyPayload = {
  provider: string;
  modelId: string;
  supportsStreaming: boolean;
  mode: 'realtime_partial_commit' | 'unsupported';
};

export type STTStreamingTranscriptPartialPayload = {
  text: string;
  revision: number;
};

export type STTStreamingTranscriptConfirmedPayload = {
  text: string;
  index: number;
};

export type STTStreamingTranscriptFinalPayload = {
  text: string;
};

export type STTStreamingMetricsPayload = {
  elapsedMs: number;
  audioChunksReceived: number;
  partialEventsSent: number;
  confirmedEventsSent: number;
};

export type STTStreamingErrorPayload = {
  error: string;
  details?: string | null;
};

export type STTStreamingClientMessage =
  | {
      version: 'v1';
      type: 'session.start';
      payload: STTStreamingSessionStartPayload;
    }
  | {
      version: 'v1';
      type: 'audio.chunk';
      sessionId: string;
      payload: STTStreamingAudioChunkPayload;
    }
  | {
      version: 'v1';
      type: 'session.commit' | 'session.cancel';
      sessionId: string;
      payload?: STTStreamingSessionCommitPayload;
    }
  | {
      version: 'v1';
      type: 'session.ping';
      sessionId: string;
      payload?: Record<string, never>;
    };

export type STTStreamingServerMessage =
  | STTStreamingEnvelope<'session.ready', STTStreamingSessionReadyPayload>
  | STTStreamingEnvelope<'transcript.partial', STTStreamingTranscriptPartialPayload>
  | STTStreamingEnvelope<
      'transcript.confirmed',
      STTStreamingTranscriptConfirmedPayload
    >
  | STTStreamingEnvelope<'transcript.final', STTStreamingTranscriptFinalPayload>
  | STTStreamingEnvelope<'metrics', STTStreamingMetricsPayload>
  | STTStreamingEnvelope<'session.cancelled', STTStreamingSessionCommitPayload>
  | STTStreamingEnvelope<'session.error', STTStreamingErrorPayload>;

export type STTStreamingCapabilitiesResponse = {
  provider: string;
  modelId: string | null;
  streaming: {
    supported: boolean;
    mode: 'realtime_partial_commit' | 'unsupported';
  };
};
