import assert from 'node:assert/strict';

import {
  createSessionReadyEvent,
  createTranscriptPartialEvent,
  parseClientMessage,
} from '../modules/stt-streaming/protocol.ts';

const startMessage = parseClientMessage(
  JSON.stringify({
    version: 'v1',
    type: 'session.start',
    payload: {
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_f32le',
    },
  }),
);

assert.equal(startMessage.type, 'session.start');

const readyEvent = createSessionReadyEvent({
  sessionId: 'session-1',
  provider: 'faster-whisper',
  modelId: 'whisper-tiny',
  supportsStreaming: true,
  mode: 'realtime_partial_commit',
});

assert.equal(readyEvent.type, 'session.ready');

const partialEvent = createTranscriptPartialEvent({
  sessionId: 'session-1',
  text: 'boa no',
  revision: 2,
});

assert.equal(partialEvent.payload.text, 'boa no');

console.log('stt streaming public protocol runtime checks passed');
