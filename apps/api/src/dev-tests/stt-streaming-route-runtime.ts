import assert from 'node:assert/strict';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

import { sttStreamingRoutes } from '../modules/stt-streaming/routes.ts';

const app = Fastify();
await app.register(websocket);
await app.register(sttStreamingRoutes, { prefix: '/api/v1/stt-streaming' });

const routePaths = app.printRoutes();

assert.match(routePaths, /api\/v1\/stt-streaming/);

console.log('stt streaming route runtime checks passed');
