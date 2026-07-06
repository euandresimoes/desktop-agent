import {
  createSessionCancelledEvent,
  createSessionErrorEvent,
} from './protocol.ts';

type SessionSender = {
  sendToClient(message: unknown): void;
};

type SessionState = {
  startedAt: number;
  audioChunksReceived: number;
  partialEventsSent: number;
  confirmedEventsSent: number;
};

export function createSTTStreamingSessionManager(sender: SessionSender) {
  const activeSessions = new Map<string, SessionState>();

  return {
    register(sessionId: string) {
      activeSessions.set(sessionId, {
        startedAt: Date.now(),
        audioChunksReceived: 0,
        partialEventsSent: 0,
        confirmedEventsSent: 0,
      });
    },
    isActive(sessionId: string) {
      return activeSessions.has(sessionId);
    },
    unregister(sessionId: string) {
      activeSessions.delete(sessionId);
    },
    activeSessionIds() {
      return [...activeSessions.keys()];
    },
    noteAudioChunk(sessionId: string) {
      const session = activeSessions.get(sessionId);
      if (!session) {
        return;
      }

      session.audioChunksReceived += 1;
    },
    notePartialEvent(sessionId: string) {
      const session = activeSessions.get(sessionId);
      if (!session) {
        return;
      }

      session.partialEventsSent += 1;
    },
    noteConfirmedEvent(sessionId: string) {
      const session = activeSessions.get(sessionId);
      if (!session) {
        return;
      }

      session.confirmedEventsSent += 1;
    },
    getMetrics(sessionId: string) {
      const session = activeSessions.get(sessionId);
      if (!session) {
        return null;
      }

      return {
        elapsedMs: Date.now() - session.startedAt,
        audioChunksReceived: session.audioChunksReceived,
        partialEventsSent: session.partialEventsSent,
        confirmedEventsSent: session.confirmedEventsSent,
      };
    },
    cancel(sessionId: string, reason: string) {
      if (!activeSessions.has(sessionId)) {
        return;
      }

      activeSessions.delete(sessionId);
      sender.sendToClient(
        createSessionCancelledEvent({
          sessionId,
          reason,
        }),
      );
    },
    fail(sessionId: string, error: string, details?: string | null) {
      sender.sendToClient(
        createSessionErrorEvent({
          sessionId,
          error,
          details,
        }),
      );
      activeSessions.delete(sessionId);
    },
  };
}
