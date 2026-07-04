import type { FastifyPluginAsync } from 'fastify';

export const ttsStreamingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return {
      ok: true,
      transport: 'websocket',
      version: 'v1',
    };
  });
};
