type SessionSender = {
  sendToClient(message: unknown): void;
};

export function createTTSStreamingSessionManager(sender: SessionSender) {
  const activeSessions = new Set<string>();

  return {
    register(sessionId: string) {
      activeSessions.add(sessionId);
    },
    isActive(sessionId: string) {
      return activeSessions.has(sessionId);
    },
    unregister(sessionId: string) {
      activeSessions.delete(sessionId);
    },
    activeSessionIds() {
      return [...activeSessions];
    },
    cancel(sessionId: string, reason: string) {
      if (!activeSessions.has(sessionId)) {
        return;
      }

      activeSessions.delete(sessionId);
      sender.sendToClient({
        version: 'v1',
        type: 'session.cancelled',
        sessionId,
        timestamp: Date.now(),
        payload: { reason },
      });
    },
  };
}
