import { randomUUID } from 'node:crypto';

import { createSessionStartEvent } from './protocol.ts';
import { createTTSStreamingSessionManager } from './session-manager.ts';

export function createTTSStreamingGateway(sendToClient: (message: unknown) => void) {
  const manager = createTTSStreamingSessionManager({ sendToClient });

  return {
    startSession(input: {
      voiceId: string;
      provider: string;
      sampleRate: number;
      channels: number;
    }) {
      const sessionId = `tts_${randomUUID()}`;
      manager.register(sessionId);
      sendToClient(
        createSessionStartEvent({
          sessionId,
          voiceId: input.voiceId,
          provider: input.provider,
          sampleRate: input.sampleRate,
          channels: input.channels,
          sampleFormat: 'pcm_s16le',
        }),
      );
      return sessionId;
    },
    cancelSession(sessionId: string, reason: string) {
      manager.cancel(sessionId, reason);
    },
  };
}
