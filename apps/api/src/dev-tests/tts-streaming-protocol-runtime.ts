import assert from 'node:assert/strict';

import {
  createSessionStartEvent,
  createAudioChunkEvent,
  createTextChunkEvent,
  createMetricsEvent,
} from '../modules/tts-streaming/protocol.ts';

const startedAt = createSessionStartEvent({
  sessionId: 'tts_1',
  voiceId: 'voice-a',
  provider: 'piper',
  sampleRate: 22050,
  channels: 1,
  sampleFormat: 'pcm_s16le',
});

assert.equal(startedAt.version, 'v1');
assert.equal(startedAt.type, 'session.start');

const audio = createAudioChunkEvent({
  sessionId: 'tts_1',
  sequence: 1,
  chunkId: 'chunk-1',
  sampleRate: 22050,
  channels: 1,
  frameCount: 1024,
  durationMs: 46,
  audioBase64: 'AQID',
});

assert.equal(audio.type, 'audio.chunk');
assert.equal(audio.payload.encoding, 'pcm_s16le');

const text = createTextChunkEvent({
  sessionId: 'tts_1',
  sequence: 2,
  text: 'Ola',
  isFinal: false,
});

assert.equal(text.type, 'text.chunk');

const metrics = createMetricsEvent({
  sessionId: 'tts_1',
  timeToFirstChunkMs: 120,
  audioChunksSent: 3,
  textChunksSent: 1,
  generatedAudioDurationMs: 138,
  elapsedMs: 150,
});

assert.equal(metrics.type, 'metrics');

console.log('tts streaming public protocol runtime checks passed');
