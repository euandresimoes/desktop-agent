import Fastify, { fastify } from 'fastify';
import { appSetupRoutes } from './modules/app-setup/routes.ts';
import { piperTTSRoutes } from './modules/piper-tts/routes.ts';
import { llmRoutes } from './modules/llama-cpp/routes.ts';
import { llmModelRoutes } from './modules/llm-models/routes.ts';
import { assistantRoutes } from './modules/assistant/routes.ts';
import fastifyMultipart from '@fastify/multipart';
import { sttRoutes } from './modules/stt/routes.ts';
import { hubDownloadsRoutes } from './modules/hub-downloads/routes.ts';
import { assistantPreferencesRoutes } from './modules/assistant-preferences/routes.ts';
import { ttsStreamingRoutes } from './modules/tts-streaming/routes.ts';
import { buildErrorPayload } from './shared/errors.ts';

export const app = Fastify({
  logger: true,
});

(async () => {
  try {
    /**
     * Register global plugins
     */
    await app.register(fastifyMultipart);

    app.addHook('onRequest', async (request, reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (request.method === 'OPTIONS') {
        return reply.status(200).send();
      }
    });

    /**
     * Load the routers
     */
    app.register(appSetupRoutes, {
      prefix: '/api/v1/setup',
    });
    //
    app.register(piperTTSRoutes, {
      prefix: '/api/v1/tts',
    });
    //
    app.register(llmRoutes, {
      prefix: '/api/v1/llm',
    });
    //
    app.register(llmModelRoutes, {
      prefix: '/api/v1/models',
    });
    //
    app.register(assistantRoutes, {
      prefix: '/api/v1/assistant',
    });

    app.setErrorHandler((error, request, reply) => {
      request.log.error(
        {
          err: error,
          requestId: request.id,
          route: request.url,
          method: request.method,
          url: request.url,
        },
        'Unhandled API error'
      );

      const payload = buildErrorPayload(
        error,
        request.id,
        'Unexpected API error',
        'api'
      );
      const statusCode =
        typeof (error as { statusCode?: unknown })?.statusCode === 'number'
          ? Number((error as { statusCode?: number }).statusCode)
          : 500;

      reply.status(statusCode).send(payload);
    });
    //
    app.register(assistantPreferencesRoutes, {
      prefix: '/api/v1/assistant-preferences',
    });
    //
    app.register(sttRoutes, {
      prefix: '/api/v1/stt',
    });
    //
    app.register(hubDownloadsRoutes, {
      prefix: '/api/v1/hub',
    });
    //
    app.register(ttsStreamingRoutes, {
      prefix: '/api/v1/tts-streaming',
    });

    /**
     * Start the web server
     */
    await app.listen({ port: 35421 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
