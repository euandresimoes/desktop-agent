import WebSocket from 'ws';

const INTERNAL_TTS_STREAM_URL =
  process.env.TTS_STREAM_SERVER_URL ?? 'ws://127.0.0.1:35422/ws/stream';

type InternalTTSStreamClientOptions = {
  onMessage(message: unknown): void;
  onError(error: Error): void;
  onClose(): void;
  url?: string;
};

export type InternalTTSStreamClient = {
  connect(): Promise<void>;
  sendStart(message: unknown): void;
  sendCancel(message: unknown): void;
  close(): void;
};

export function createInternalTTSStreamClient(
  options: InternalTTSStreamClientOptions,
): InternalTTSStreamClient {
  let socket: WebSocket | null = null;

  const ensureOpenSocket = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Internal TTS streaming socket is not connected');
    }

    return socket;
  };

  return {
    async connect() {
      if (socket && socket.readyState === WebSocket.OPEN) {
        return;
      }

      socket = new WebSocket(options.url ?? INTERNAL_TTS_STREAM_URL);

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
              : new Error('Failed to parse internal TTS stream message'),
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
    sendStart(message: unknown) {
      ensureOpenSocket().send(JSON.stringify(message));
    },
    sendCancel(message: unknown) {
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
