import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../../shared/errors.ts';
import { sttService } from '../stt/services.ts';
import { getSTTStreamingCapabilities } from './capabilities.ts';
import { createSTTStreamingGateway } from './gateway.ts';
import { parseClientMessage } from './protocol.ts';

export const sttStreamingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const activeModel = await sttService.getActiveModel();

    if (!activeModel) {
      return {
        ok: true,
        transport: 'websocket',
        version: 'v1',
        capabilities: null,
      };
    }

    return {
      ok: true,
      transport: 'websocket',
      version: 'v1',
      capabilities: getSTTStreamingCapabilities({
        provider: activeModel.provider,
        modelId: activeModel.id,
      }),
    };
  });

  app.get('/capabilities', async (_request, reply) => {
    const activeModel = await sttService.getActiveModel();

    if (!activeModel) {
      return reply.status(404).send({
        error: 'No active STT model configured',
      });
    }

    return getSTTStreamingCapabilities({
      provider: activeModel.provider,
      modelId: activeModel.id,
    });
  });

  app.get('/ws', { websocket: true }, (socket, request) => {
    const sendToClient = (message: unknown) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    const gateway = createSTTStreamingGateway(sendToClient);
    const gatewayReady = gateway.connect();

    void gatewayReady.catch((error) => {
      sendToClient({
        version: 'v1',
        type: 'session.error',
        sessionId: 'unknown',
        timestamp: Date.now(),
        payload: {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to connect internal STT streaming gateway',
          details: error instanceof Error ? error.stack ?? null : null,
        },
      });
      socket.close();
    });

    socket.on('message', (rawMessage) => {
      void (async () => {
        try {
          const message = parseClientMessage(rawMessage.toString());
          app.log.info(
            {
              module: 'stt-streaming-route',
              event: 'client-message',
              requestId: request.id,
              type: message.type,
              sessionId: 'sessionId' in message ? message.sessionId : undefined,
            },
            'Received STT streaming client message',
          );

          if (message.type === 'session.start') {
            await gatewayReady;

            const activeModel = await sttService.getActiveModel();

            if (!activeModel) {
              throw new AppError({
                message: 'No active STT model configured for streaming',
                statusCode: 400,
              });
            }

            const capabilities = getSTTStreamingCapabilities({
              provider: activeModel.provider,
              modelId: activeModel.id,
            });

            await gateway.startSession({
              requestId: request.id,
              provider: activeModel.provider,
              modelId: activeModel.id,
              modelPath: activeModel.modelPath,
              device: activeModel.device,
              computeType: activeModel.computeType,
              language: activeModel.language,
              beamSize: activeModel.beamSize,
              vadFilter: activeModel.vadFilter,
              supportsStreaming: capabilities.streaming.supported,
              mode: capabilities.streaming.mode,
              sampleRate: message.payload.sampleRate,
              channels: message.payload.channels,
              encoding: message.payload.encoding,
            });
            return;
          }

          if (message.type === 'audio.chunk') {
            await gatewayReady;
            gateway.pushChunk({
              sessionId: message.sessionId,
              sequence: message.payload.sequence,
              chunkId: message.payload.chunkId,
              audioBase64: message.payload.audioBase64,
              frameCount: message.payload.frameCount,
            });
            return;
          }

          if (message.type === 'session.commit') {
            await gatewayReady;
            gateway.commitSession(message.sessionId, message.payload?.reason);
            return;
          }

          if (message.type === 'session.cancel') {
            await gatewayReady;
            gateway.cancelSession(
              message.sessionId,
              message.payload?.reason ?? 'client_cancelled',
            );
            return;
          }

          if (message.type === 'session.ping') {
            return;
          }

          throw new AppError({
            message: 'Unsupported STT streaming command',
            statusCode: 400,
          });
        } catch (error) {
          sendToClient({
            version: 'v1',
            type: 'session.error',
            sessionId: 'unknown',
            timestamp: Date.now(),
            payload: {
              error:
                error instanceof Error
                  ? error.message
                  : 'Unexpected STT streaming route error',
              details: error instanceof Error ? error.stack ?? null : null,
            },
          });
        }
      })();
    });

    socket.on('close', () => {
      app.log.info(
        {
          module: 'stt-streaming-route',
          event: 'client-socket-closed',
          requestId: request.id,
        },
        'Closed STT streaming client socket',
      );
      gateway.close();
    });
  });
};
