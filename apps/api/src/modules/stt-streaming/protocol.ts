import type {
  STTStreamingClientMessage,
  STTStreamingEnvelope,
  STTStreamingErrorPayload,
  STTStreamingMetricsPayload,
  STTStreamingSessionCommitPayload,
  STTStreamingSessionReadyPayload,
  STTStreamingServerEventType,
  STTStreamingTranscriptConfirmedPayload,
  STTStreamingTranscriptFinalPayload,
  STTStreamingTranscriptPartialPayload,
} from './types.ts';

function createEnvelope<TType extends STTStreamingServerEventType, TPayload>(
  type: TType,
  sessionId: string,
  payload: TPayload,
): STTStreamingEnvelope<TType, TPayload> {
  return {
    version: 'v1',
    type,
    sessionId,
    timestamp: Date.now(),
    payload,
  };
}

export function parseClientMessage(rawMessage: string): STTStreamingClientMessage {
  const parsed = JSON.parse(rawMessage) as Partial<STTStreamingClientMessage>;

  if (parsed.version !== 'v1' || typeof parsed.type !== 'string') {
    throw new Error('Unsupported STT streaming message');
  }

  return parsed as STTStreamingClientMessage;
}

export function createSessionReadyEvent(
  input: { sessionId: string } & STTStreamingSessionReadyPayload,
) {
  return createEnvelope('session.ready', input.sessionId, {
    provider: input.provider,
    modelId: input.modelId,
    supportsStreaming: input.supportsStreaming,
    mode: input.mode,
  });
}

export function createTranscriptPartialEvent(
  input: { sessionId: string } & STTStreamingTranscriptPartialPayload,
) {
  return createEnvelope('transcript.partial', input.sessionId, {
    text: input.text,
    revision: input.revision,
  });
}

export function createTranscriptConfirmedEvent(
  input: { sessionId: string } & STTStreamingTranscriptConfirmedPayload,
) {
  return createEnvelope('transcript.confirmed', input.sessionId, {
    text: input.text,
    index: input.index,
  });
}

export function createTranscriptFinalEvent(
  input: { sessionId: string } & STTStreamingTranscriptFinalPayload,
) {
  return createEnvelope('transcript.final', input.sessionId, {
    text: input.text,
  });
}

export function createMetricsEvent(
  input: { sessionId: string } & STTStreamingMetricsPayload,
) {
  return createEnvelope('metrics', input.sessionId, {
    elapsedMs: input.elapsedMs,
    audioChunksReceived: input.audioChunksReceived,
    partialEventsSent: input.partialEventsSent,
    confirmedEventsSent: input.confirmedEventsSent,
  });
}

export function createSessionCancelledEvent(
  input: { sessionId: string } & STTStreamingSessionCommitPayload,
) {
  return createEnvelope('session.cancelled', input.sessionId, {
    reason: input.reason,
  });
}

export function createSessionErrorEvent(
  input: { sessionId: string } & STTStreamingErrorPayload,
) {
  return createEnvelope('session.error', input.sessionId, {
    error: input.error,
    details: input.details ?? null,
  });
}
