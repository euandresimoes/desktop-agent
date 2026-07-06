import WebSocket from 'ws';

const INTERNAL_STT_STREAM_URL =
  process.env.STT_STREAM_SERVER_URL ?? 'ws://127.0.0.1:35423/ws/stream';

type InternalSTTStreamClientOptions = {
  onMessage(message: unknown): void;
  onError(error: Error): void;
  onClose(): void;
  url?: string;
};

export type InternalSTTStreamClient = {
  connect(): Promise<void>;
  send(message: unknown): void;
  close(): void;
};

export function createInternalSTTStreamClient(
  options: InternalSTTStreamClientOptions,
): InternalSTTStreamClient {
  let socket: WebSocket | null = null;

  const ensureOpenSocket = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Internal STT streaming socket is not connected');
    }

    return socket;
  };

  return {
    async connect() {
      if (socket && socket.readyState === WebSocket.OPEN) {
        return;
      }

      socket = new WebSocket(options.url ?? INTERNAL_STT_STREAM_URL);

      await new Promise<void>((resolve, reject) => {
        const currentSocket = socket as WebSocket;

        const handleOpen = () => {
          currentSocket.off('error', handleError);
          resolve();
        };

        const handleError = (error: Error) => {
          currentSocket.off('open', handleOpen);
          reject(error);
        };

        currentSocket.once('open', handleOpen);
        currentSocket.once('error', handleError);
      });

      socket.on('message', (data) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString();
          options.onMessage(JSON.parse(raw));
        } catch (error) {
          options.onError(
            error instanceof Error
              ? error
              : new Error('Failed to parse internal STT stream message'),
          );
        }
      });

      socket.on('error', (error) => {
        options.onError(error);
      });

      socket.on('close', () => {
        options.onClose();
      });
    },
    send(message: unknown) {
      ensureOpenSocket().send(JSON.stringify(message));
    },
    close() {
      if (!socket) {
        return;
      }

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }

      socket = null;
    },
  };
}
