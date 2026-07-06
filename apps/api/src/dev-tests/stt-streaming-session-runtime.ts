import assert from 'node:assert/strict';

import { createSTTStreamingSessionManager } from '../modules/stt-streaming/session-manager.ts';

const sentMessages: unknown[] = [];
const manager = createSTTStreamingSessionManager({
  sendToClient(message) {
    sentMessages.push(message);
  },
});

manager.register('session-1');
assert.equal(manager.isActive('session-1'), true);

manager.noteAudioChunk('session-1');
manager.notePartialEvent('session-1');
manager.noteConfirmedEvent('session-1');

const metrics = manager.getMetrics('session-1');
assert.equal(metrics?.audioChunksReceived, 1);
assert.equal(metrics?.partialEventsSent, 1);
assert.equal(metrics?.confirmedEventsSent, 1);

manager.cancel('session-1', 'test');
assert.equal(manager.isActive('session-1'), false);
assert.equal(sentMessages.length, 1);

console.log('stt streaming session runtime checks passed');
