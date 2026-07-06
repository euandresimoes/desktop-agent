import { randomUUID } from 'node:crypto';
import pino from 'pino';

import { AppError } from '../../shared/errors.ts';
import { createInternalSTTStreamClient } from './client.ts';
import {
  createMetricsEvent,
  createSessionReadyEvent,
} from './protocol.ts';
import { createSTTStreamingSessionManager } from './session-manager.ts';

type Sender = (message: unknown) => void;

type StartSessionInput = {
  requestId?: string;
  provider: string;
  modelId: string;
  modelPath: string;
  device: string;
  computeType: string;
  language?: string;
  beamSize: number;
  vadFilter: boolean;
  cpuThreads?: number;
  supportsStreaming: boolean;
  mode: 'realtime_partial_commit' | 'unsupported';
  sampleRate: number;
  channels: number;
  encoding: 'pcm_f32le';
};

export function createSTTStreamingGateway(sendToClient: Sender) {
  const logger = pino({ name: 'stt-streaming-gateway' });
  const manager = createSTTStreamingSessionManager({ sendToClient });
  const internalClient = createInternalSTTStreamClient({
    onMessage(message) {
      const event = message as { type?: string; sessionId?: string };
      logger.info(
        {
          module: 'stt-streaming-gateway',
          event: 'internal-message',
          type: event.type,
          sessionId: event.sessionId,
        },
        'Received STT streaming internal message',
      );

      if (event.sessionId && event.type === 'transcript.partial') {
        manager.notePartialEvent(event.sessionId);
      }

      if (event.sessionId && event.type === 'transcript.confirmed') {
        manager.noteConfirmedEvent(event.sessionId);
      }

      if (
        event.sessionId &&
        (event.type === 'transcript.final' ||
          event.type === 'session.cancelled' ||
          event.type === 'session.error')
      ) {
        const metrics = manager.getMetrics(event.sessionId);
        if (metrics) {
          sendToClient(
            createMetricsEvent({
              sessionId: event.sessionId,
              ...metrics,
            }),
          );
        }
        manager.unregister(event.sessionId);
      }

      sendToClient(message);
    },
    onError(error) {
      const details = error.stack ?? error.message;

      for (const sessionId of manager.activeSessionIds()) {
        manager.fail(sessionId, error.message || 'Internal STT streaming failed', details);
      }
    },
    onClose() {
      for (const sessionId of manager.activeSessionIds()) {
        manager.fail(sessionId, 'Internal STT streaming connection closed');
      }
    },
  });

  return {
    async connect() {
      await internalClient.connect();
    },
    async startSession(input: StartSessionInput) {
      if (!input.supportsStreaming) {
        throw new AppError({
          message: `STT streaming is not supported by provider: ${input.provider}`,
          statusCode: 400,
        });
      }

      const sessionId = `stt_${randomUUID()}`;
      manager.register(sessionId);
      logger.info(
        {
          module: 'stt-streaming-gateway',
          event: 'start-session',
          sessionId,
          provider: input.provider,
          modelId: input.modelId,
          sampleRate: input.sampleRate,
          channels: input.channels,
        },
        'Starting STT streaming session',
      );

      internalClient.send({
        type: 'session.start',
        sessionId,
        payload: {
          requestId: input.requestId,
          provider: input.provider,
          modelId: input.modelId,
          modelPath: input.modelPath,
          device: input.device,
          computeType: input.computeType,
          language: input.language,
          beamSize: input.beamSize,
          vadFilter: input.vadFilter,
          cpuThreads: input.cpuThreads,
          sampleRate: input.sampleRate,
          channels: input.channels,
          encoding: input.encoding,
        },
      });

      sendToClient(
        createSessionReadyEvent({
          sessionId,
          provider: input.provider,
          modelId: input.modelId,
          supportsStreaming: input.supportsStreaming,
          mode: input.mode,
        }),
      );

      return sessionId;
    },
    pushChunk(input: {
      sessionId: string;
      sequence: number;
      chunkId: string;
      audioBase64: string;
      frameCount: number;
    }) {
      if (!manager.isActive(input.sessionId)) {
        return;
      }

      manager.noteAudioChunk(input.sessionId);
      if (input.sequence <= 4 || input.sequence % 12 === 0) {
        logger.info(
          {
            module: 'stt-streaming-gateway',
            event: 'push-chunk',
            sessionId: input.sessionId,
            sequence: input.sequence,
            frameCount: input.frameCount,
          },
          'Forwarding STT streaming audio chunk',
        );
      }

      internalClient.send({
        type: 'audio.chunk',
        sessionId: input.sessionId,
        payload: {
          sequence: input.sequence,
          chunkId: input.chunkId,
          audioBase64: input.audioBase64,
          frameCount: input.frameCount,
        },
      });
    },
    commitSession(sessionId: string, reason?: string) {
      if (!manager.isActive(sessionId)) {
        return;
      }
      logger.info(
        {
          module: 'stt-streaming-gateway',
          event: 'commit-session',
          sessionId,
          reason,
        },
        'Forwarding STT streaming commit',
      );

      internalClient.send({
        type: 'session.commit',
        sessionId,
        payload: {
          reason,
        },
      });
    },
    cancelSession(sessionId: string, reason: string) {
      if (!manager.isActive(sessionId)) {
        return;
      }
      logger.info(
        {
          module: 'stt-streaming-gateway',
          event: 'cancel-session',
          sessionId,
          reason,
        },
        'Forwarding STT streaming cancel',
      );

      internalClient.send({
        type: 'session.cancel',
        sessionId,
        payload: { reason },
      });
    },
    close() {
      internalClient.close();
    },
  };
}
