import { randomUUID } from 'node:crypto';

import { AppError } from '../../shared/errors.ts';
import { createSessionStartEvent } from './protocol.ts';
import { createInternalTTSStreamClient } from './client.ts';
import { createTTSStreamingSessionManager } from './session-manager.ts';

type StartSessionInput = {
  text: string;
  requestId?: string;
  voiceId: string;
  provider: string;
  modelPath: string;
  configPath: string;
  lengthScale?: number;
  noiseScale?: number;
  noiseW?: number;
  sampleRate?: number;
  channels?: number;
};

export function createTTSStreamingGateway(sendToClient: (message: unknown) => void) {
  const manager = createTTSStreamingSessionManager({ sendToClient });
  const internalClient = createInternalTTSStreamClient({
    onMessage(message) {
      const event = message as {
        type?: string;
        sessionId?: string;
      };

      if (
        event.sessionId &&
        (event.type === 'session.complete' ||
          event.type === 'session.cancelled' ||
          event.type === 'session.error')
      ) {
        manager.unregister(event.sessionId);
      }

      sendToClient(message);
    },
    onError(error) {
      const details = error.stack ?? error.message;

      for (const sessionId of manager.activeSessionIds()) {
        sendToClient({
          version: 'v1',
          type: 'session.error',
          sessionId,
          timestamp: Date.now(),
          payload: {
            error: error.message || 'Internal TTS streaming failed',
            details,
          },
        });
        manager.unregister(sessionId);
      }
    },
    onClose() {
      for (const sessionId of manager.activeSessionIds()) {
        sendToClient({
          version: 'v1',
          type: 'session.error',
          sessionId,
          timestamp: Date.now(),
          payload: {
            error: 'Internal TTS streaming connection closed',
            details: null,
          },
        });
        manager.unregister(sessionId);
      }
    },
  });

  return {
    async connect() {
      await internalClient.connect();
    },
    async startSession(input: StartSessionInput) {
      if (!input.text.trim()) {
        throw new AppError({
          message: 'Streaming text cannot be empty',
          statusCode: 400,
        });
      }

      const sessionId = `tts_${randomUUID()}`;
      manager.register(sessionId);

      internalClient.sendStart({
        type: 'session.start',
        sessionId,
        payload: {
          text: input.text,
          requestId: input.requestId,
          voiceId: input.voiceId,
          provider: input.provider,
          modelPath: input.modelPath,
          configPath: input.configPath,
          lengthScale: input.lengthScale,
          noiseScale: input.noiseScale,
          noiseW: input.noiseW,
        },
      });

      sendToClient(
        createSessionStartEvent({
          sessionId,
          voiceId: input.voiceId,
          provider: input.provider,
          sampleRate: input.sampleRate ?? 22050,
          channels: input.channels ?? 1,
          sampleFormat: 'pcm_s16le',
        }),
      );
      return sessionId;
    },
    cancelSession(sessionId: string, reason: string) {
      if (!manager.isActive(sessionId)) {
        return;
      }

      internalClient.sendCancel({
        type: 'session.cancel',
        sessionId,
        payload: { reason },
      });
    },
    forceCancelSession(sessionId: string, reason: string) {
      manager.cancel(sessionId, reason);
    },
    close() {
      internalClient.close();
    },
  };
}
