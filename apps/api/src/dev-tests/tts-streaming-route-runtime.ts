import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { ttsStreamingRoutes } from '../modules/tts-streaming/routes.ts';

const app = Fastify();
await app.register(ttsStreamingRoutes, { prefix: '/api/v1/tts-streaming' });
await app.ready();

const routePaths = app.printRoutes();
assert.match(routePaths, /api\/v1\/tts-streaming/);

await app.close();

console.log('tts streaming route runtime checks passed');
