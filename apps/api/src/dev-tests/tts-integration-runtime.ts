import assert from 'node:assert/strict';

import { buildSpeakPayload } from '../modules/piper-tts/services.ts';
import { buildTTSServerEnv, getTTSServerPort } from '../scripts/start-tts-dev.ts';

const payload = buildSpeakPayload({
  text: 'hello',
  requestId: 'req-1',
  voiceId: 'voice-a',
  modelPath: 'C:/models/voice.onnx',
  configPath: 'C:/models/voice.json',
  lengthScale: 1.2,
  noiseScale: 0.5,
  noiseW: 0.7,
});

assert.deepEqual(payload, {
  text: 'hello',
  voiceId: 'voice-a',
  provider: 'piper',
  modelPath: 'C:/models/voice.onnx',
  configPath: 'C:/models/voice.json',
  lengthScale: 1.2,
  noiseScale: 0.5,
  noiseW: 0.7,
});

const env = buildTTSServerEnv(
  {
    USER_DATA_PATH: 'C:/storage',
    TTS_SERVER_PORT: '35555',
  },
  {
    id: 'voice-a',
    modelPath: 'C:/models/voice.onnx',
    configPath: 'C:/models/voice.json',
  }
);

assert.equal(env.TTS_PROVIDER, 'piper');
assert.equal(env.PIPER_VOICE_ID, 'voice-a');
assert.equal(env.PIPER_MODEL_PATH, 'C:/models/voice.onnx');
assert.equal(env.PIPER_CONFIG_PATH, 'C:/models/voice.json');
assert.equal(env.PYTHONUTF8, '1');
assert.equal(env.PYTHONIOENCODING, 'utf-8');
assert.equal(getTTSServerPort({ TTS_SERVER_PORT: '35555' }), '35555');
assert.equal(getTTSServerPort({}), '35422');

console.log('tts integration runtime checks passed');
