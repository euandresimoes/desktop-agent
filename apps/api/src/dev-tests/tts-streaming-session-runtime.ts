import assert from 'node:assert/strict';

import { createTTSStreamingSessionManager } from '../modules/tts-streaming/session-manager.ts';

const sent: unknown[] = [];
const manager = createTTSStreamingSessionManager({
  sendToClient(message) {
    sent.push(message);
  },
});

manager.register('session-a');
assert.equal(manager.isActive('session-a'), true);

manager.cancel('session-a', 'user_cancelled');
assert.equal(manager.isActive('session-a'), false);
assert.equal(sent.length, 1);

console.log('tts streaming session runtime checks passed');
