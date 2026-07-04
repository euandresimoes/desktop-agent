export type InternalTTSStreamClient = {
  connect(sessionId: string): Promise<void>;
  sendStart(message: unknown): void;
  sendCancel(reason: string): void;
  close(): void;
};

export function createInternalTTSStreamClient(): InternalTTSStreamClient {
  return {
    async connect() {
      return;
    },
    sendStart() {},
    sendCancel() {},
    close() {},
  };
}
