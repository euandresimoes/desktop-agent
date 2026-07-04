import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../../shared/errors.ts';
import { appSetupService } from '../app-setup/services.ts';
import { createTTSStreamingGateway } from './gateway.ts';

export const ttsStreamingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return {
      ok: true,
      transport: 'websocket',
      version: 'v1',
    };
  });

  app.get('/ws', { websocket: true }, (socket, request) => {
    const sendToClient = (message: unknown) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    const gateway = createTTSStreamingGateway(sendToClient);
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
              : 'Failed to connect internal TTS streaming gateway',
          details: error instanceof Error ? error.stack ?? null : null,
        },
      });
      socket.close();
    });

    socket.on('message', (rawMessage) => {
      void (async () => {
        try {
          const message = JSON.parse(rawMessage.toString()) as {
            type?: string;
            sessionId?: string;
            payload?: {
              text?: string;
              reason?: string;
            };
          };

          if (message.type === 'session.start') {
            await gatewayReady;

            const activeVoice = await appSetupService.getActiveVoice();

            if (!activeVoice) {
              throw new AppError({
                message: 'No active voice configured for streaming',
                statusCode: 400,
              });
            }

            await gateway.startSession({
              text: message.payload?.text ?? '',
              requestId: request.id,
              voiceId: activeVoice.id,
              provider: 'piper',
              modelPath: activeVoice.modelPath,
              configPath: activeVoice.configPath,
              lengthScale: activeVoice.lengthScale,
              noiseScale: activeVoice.noiseScale,
              noiseW: activeVoice.noiseW,
            });

            return;
          }

          if (message.type === 'session.cancel' && message.sessionId) {
            await gatewayReady;

            gateway.cancelSession(
              message.sessionId,
              message.payload?.reason ?? 'client_cancelled',
            );
            return;
          }

          throw new AppError({
            message: 'Unsupported TTS streaming command',
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
                  : 'Unexpected TTS streaming route error',
              details: error instanceof Error ? error.stack ?? null : null,
            },
          });
        }
      })();
    });

    socket.on('close', () => {
      gateway.close();
    });
  });
};
