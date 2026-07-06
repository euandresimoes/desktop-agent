const API_BASE = "http://localhost:35421/api/v1";

type StartInput = {
  sampleRate: number;
  channels: number;
  encoding: "pcm_f32le";
};

type STTStreamingClientOptions = {
  onReady: (payload: { sessionId: string }) => void;
  onPartial: (payload: { text: string; revision: number }) => void;
  onConfirmed: (payload: { text: string; index: number }) => void;
  onFinal: (payload: { text: string }) => void;
  onError: (error: Error) => void;
  onCancelled?: () => void;
};

function encodeFloat32ChunkToBase64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.buffer.slice(0));
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

export function createSTTStreamingClient(options: STTStreamingClientOptions) {
  const socketUrl = `${API_BASE.replace("http://", "ws://").replace("https://", "wss://")}/stt-streaming/ws`;
  let socket: WebSocket | null = null;
  let sessionId: string | null = null;
  let isClosed = false;
  let sequence = 0;
  let started = false;
  let sentChunkCount = 0;
  const pendingChunks: Array<{ samples: Float32Array; frameCount: number }> = [];
  let finalResolve: ((text: string) => void) | null = null;
  let finalReject: ((error: Error) => void) | null = null;
  let finalPromise: Promise<string> | null = null;

  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: Error) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const ensureFinalPromise = () => {
    if (!finalPromise) {
      finalPromise = new Promise<string>((resolve, reject) => {
        finalResolve = resolve;
        finalReject = reject;
      });
    }

    return finalPromise;
  };

  const flushPendingChunks = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
      return;
    }

    while (pendingChunks.length > 0) {
      const chunk = pendingChunks.shift();

      if (!chunk) {
        break;
      }

      sequence += 1;
      sentChunkCount += 1;
      if (sentChunkCount <= 4 || sentChunkCount % 12 === 0) {
        console.log("[stt-stream] sending chunk", {
          sessionId,
          sequence,
          frameCount: chunk.frameCount,
          pendingChunks: pendingChunks.length,
        });
      }
      socket.send(
        JSON.stringify({
          version: "v1",
          type: "audio.chunk",
          sessionId,
          payload: {
            chunkId: `chunk_${sequence}`,
            sequence,
            audioBase64: encodeFloat32ChunkToBase64(chunk.samples),
            frameCount: chunk.frameCount,
          },
        }),
      );
    }
  };

  return {
    async connect(input: StartInput) {
      if (started) {
        return readyPromise;
      }

      started = true;
      socket = new WebSocket(socketUrl);

      socket.addEventListener("open", () => {
        console.log("[stt-stream] socket open");
        socket?.send(
          JSON.stringify({
            version: "v1",
            type: "session.start",
            payload: input,
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: string;
          sessionId?: string;
          payload?: Record<string, unknown>;
        };
        console.log("[stt-stream] message", {
          type: message.type,
          sessionId: message.sessionId,
          payloadKeys: Object.keys(message.payload ?? {}),
        });

        if (message.type === "session.ready" && message.sessionId) {
          sessionId = message.sessionId;
          options.onReady({ sessionId });
          flushPendingChunks();
          readyResolve?.();
          return;
        }

        if (message.type === "transcript.partial") {
          options.onPartial({
            text: String(message.payload?.text ?? ""),
            revision: Number(message.payload?.revision ?? 0),
          });
          return;
        }

        if (message.type === "transcript.confirmed") {
          options.onConfirmed({
            text: String(message.payload?.text ?? ""),
            index: Number(message.payload?.index ?? 0),
          });
          return;
        }

        if (message.type === "transcript.final") {
          const text = String(message.payload?.text ?? "");
          options.onFinal({ text });
          finalResolve?.(text);
          return;
        }

        if (message.type === "session.cancelled") {
          options.onCancelled?.();
          finalResolve?.("");
          return;
        }

        if (message.type === "session.error") {
          const error = new Error(
            String(message.payload?.error ?? "STT streaming failed"),
          );
          readyReject?.(error);
          finalReject?.(error);
          options.onError(error);
        }
      });

      socket.addEventListener("error", () => {
        const error = new Error("Failed to open STT streaming socket");
        console.error("[stt-stream] socket error");
        readyReject?.(error);
        finalReject?.(error);
        options.onError(error);
      });

      socket.addEventListener("close", () => {
        console.log("[stt-stream] socket close", {
          hadSession: Boolean(sessionId),
          sentChunkCount,
        });
        if (!isClosed && !sessionId) {
          readyReject?.(new Error("STT streaming socket closed before ready"));
        }
      });

      return readyPromise;
    },
    sendChunk(samples: Float32Array) {
      pendingChunks.push({
        samples: new Float32Array(samples),
        frameCount: samples.length,
      });
      flushPendingChunks();
    },
    async commit(reason?: string) {
      await readyPromise;
      const pendingFinal = ensureFinalPromise();

      if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
        return "";
      }

      console.log("[stt-stream] commit", {
        sessionId,
        reason,
        sentChunkCount,
      });
      socket.send(
        JSON.stringify({
          version: "v1",
          type: "session.commit",
          sessionId,
          payload: {
            reason,
          },
        }),
      );

      return pendingFinal;
    },
    async cancel(reason = "client_cancelled") {
      if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
        return;
      }

      socket.send(
        JSON.stringify({
          version: "v1",
          type: "session.cancel",
          sessionId,
          payload: {
            reason,
          },
        }),
      );
    },
    close() {
      isClosed = true;
      console.log("[stt-stream] close requested", {
        sessionId,
        sentChunkCount,
      });

      if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }

      socket = null;
      sessionId = null;
      pendingChunks.length = 0;
      finalResolve = null;
      finalReject = null;
      finalPromise = null;
    },
  };
}
