import type {
  TTSAudioChunkPayload,
  TTSMetricsPayload,
  TTSSessionStartPayload,
  TTSTextChunkPayload,
  TTSStreamEnvelope,
} from './types.ts';

function createEnvelope<TType extends string, TPayload>(
  type: TType,
  sessionId: string,
  payload: TPayload,
) {
  return {
    version: 'v1',
    type,
    sessionId,
    timestamp: Date.now(),
    payload,
  } as const;
}

export function createSessionStartEvent(
  input: { sessionId: string } & TTSSessionStartPayload,
): TTSStreamEnvelope<'session.start', TTSSessionStartPayload> {
  return createEnvelope('session.start', input.sessionId, {
    voiceId: input.voiceId,
    provider: input.provider,
    sampleRate: input.sampleRate,
    channels: input.channels,
    sampleFormat: input.sampleFormat,
  });
}

export function createAudioChunkEvent(
  input: { sessionId: string } & Omit<TTSAudioChunkPayload, 'encoding'>,
): TTSStreamEnvelope<'audio.chunk', TTSAudioChunkPayload> {
  return createEnvelope('audio.chunk', input.sessionId, {
    sequence: input.sequence,
    chunkId: input.chunkId,
    encoding: 'pcm_s16le',
    sampleRate: input.sampleRate,
    channels: input.channels,
    frameCount: input.frameCount,
    durationMs: input.durationMs,
    audioBase64: input.audioBase64,
  });
}

export function createTextChunkEvent(
  input: { sessionId: string } & TTSTextChunkPayload,
): TTSStreamEnvelope<'text.chunk', TTSTextChunkPayload> {
  return createEnvelope('text.chunk', input.sessionId, {
    sequence: input.sequence,
    text: input.text,
    isFinal: input.isFinal,
  });
}

export function createMetricsEvent(
  input: { sessionId: string } & TTSMetricsPayload,
): TTSStreamEnvelope<'metrics', TTSMetricsPayload> {
  return createEnvelope('metrics', input.sessionId, {
    timeToFirstChunkMs: input.timeToFirstChunkMs,
    audioChunksSent: input.audioChunksSent,
    textChunksSent: input.textChunksSent,
    generatedAudioDurationMs: input.generatedAudioDurationMs,
    elapsedMs: input.elapsedMs,
  });
}
