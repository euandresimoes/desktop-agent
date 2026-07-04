import assert from 'node:assert/strict';

import {
  calculateStreamDrainDelayMs,
  decodePcm16ToFloat32,
} from './tts-stream-player.ts';

const decoded = decodePcm16ToFloat32(new Uint8Array([0, 0, 255, 127]));

assert.equal(decoded.length, 2);
assert.equal(decoded[0], 0);
assert.ok(decoded[1] > 0.99);

assert.equal(calculateStreamDrainDelayMs(1.5, 1.2, 20), 321);
assert.equal(calculateStreamDrainDelayMs(1.1, 1.2, 20), 0);

console.log('tts stream player runtime checks passed');
