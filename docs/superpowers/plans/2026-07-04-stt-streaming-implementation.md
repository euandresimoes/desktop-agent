# STT Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time STT streaming through the public `api`, so the voice-turn view can show partial and confirmed user speech while recording and still hand only the final transcription to the LLM flow.

**Architecture:** Mirror the `tts-streaming` pattern: a public WebSocket module in `apps/api`, an internal session-based streaming engine in `apps/stt-server`, and a focused frontend integration in `voiceTurnService` plus the left-side caption UI. Keep provider-specific logic inside the STT providers, expose explicit capabilities, and fail clearly when the active model does not support streaming.

**Tech Stack:** Fastify WebSocket, FastAPI, Python provider registry/engine/session services, Vue 3 Composition API, TypeScript runtime tests, Electron renderer audio capture.

---

## File Structure

### API

- Create: `apps/api/src/modules/stt-streaming/types.ts`
  - Public WebSocket envelopes, client commands, server events, capability payloads.
- Create: `apps/api/src/modules/stt-streaming/protocol.ts`
  - Envelope factories and message parsers.
- Create: `apps/api/src/modules/stt-streaming/session-manager.ts`
  - Public session lifecycle and cleanup.
- Create: `apps/api/src/modules/stt-streaming/client.ts`
  - Internal WebSocket client from `api` to `stt-server`.
- Create: `apps/api/src/modules/stt-streaming/gateway.ts`
  - Orchestrates frontend socket <-> internal STT streaming socket.
- Create: `apps/api/src/modules/stt-streaming/capabilities.ts`
  - Maps active STT model/provider support to renderer-facing capabilities.
- Create: `apps/api/src/modules/stt-streaming/routes.ts`
  - Public `/api/v1/stt-streaming` websocket route.
- Create: `apps/api/src/dev-tests/stt-streaming-protocol-runtime.ts`
- Create: `apps/api/src/dev-tests/stt-streaming-session-runtime.ts`
- Create: `apps/api/src/dev-tests/stt-streaming-route-runtime.ts`
- Modify: `apps/api/src/index.ts`
  - Register the new module.
- Modify: `apps/api/src/modules/stt/services.ts`
  - Expose active-model streaming capabilities and any internal URL/config needed by the gateway.
- Modify: `apps/api/src/modules/assistant/services.ts`
  - Accept an externally supplied final transcript for the voice-turn path.

### STT server

- Create: `apps/stt-server/streaming/types.py`
  - Session models, audio chunk model, internal event model.
- Create: `apps/stt-server/streaming/session_manager.py`
  - In-memory session storage and guardrails.
- Create: `apps/stt-server/streaming/event_mapper.py`
  - Provider event normalization.
- Create: `apps/stt-server/streaming/engine.py`
  - Streaming engine entry point.
- Modify: `apps/stt-server/providers/base.py`
  - Add streaming support contract.
- Modify: `apps/stt-server/providers/faster_whisper_provider.py`
  - Implement real streaming session behavior.
- Modify: `apps/stt-server/providers/transformers_provider.py`
  - Explicitly report streaming unsupported.
- Modify: `apps/stt-server/api/routes.py`
  - Add internal websocket endpoint and streaming health/capabilities endpoint.
- Modify: `apps/stt-server/main.py`
  - Construct and inject the streaming engine.

### Electron

- Create: `apps/electron/src/shared/services/sttStreamingCapabilitiesService.ts`
  - Fetch active streaming support from `api`.
- Create: `apps/electron/src/views/voice-turn/services/stt-streaming-client.ts`
  - Renderer WebSocket client wrapper for STT streaming.
- Modify: `apps/electron/src/shared/utils/audio-recorder.ts`
  - Emit PCM chunks while still supporting final WAV export.
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
  - Run STT streaming while recording, keep final transcript for voice-turn, and branch cleanly on capability support.
- Modify: `apps/electron/src/views/voice-turn/VoiceTurnView.vue`
  - Render partial and confirmed transcript sections in the left caption panel.

---

### Task 1: Define the public STT streaming protocol in `api`

**Files:**
- Create: `apps/api/src/modules/stt-streaming/types.ts`
- Create: `apps/api/src/modules/stt-streaming/protocol.ts`
- Create: `apps/api/src/dev-tests/stt-streaming-protocol-runtime.ts`

- [ ] **Step 1: Write the failing protocol runtime test**

```ts
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
});

assert.equal(readyEvent.type, 'session.ready');

const partialEvent = createTranscriptPartialEvent({
  sessionId: 'session-1',
  text: 'boa no',
  revision: 2,
});

assert.equal(partialEvent.payload.text, 'boa no');

console.log('stt streaming public protocol runtime checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ts-node-esm src/dev-tests/stt-streaming-protocol-runtime.ts`
Expected: FAIL with module not found for `stt-streaming/protocol.ts`

- [ ] **Step 3: Write the public message types**

```ts
export type STTStreamingClientMessage =
  | {
      version: 'v1';
      type: 'session.start';
      payload: {
        sampleRate: number;
        channels: number;
        encoding: 'pcm_f32le';
      };
    }
  | {
      version: 'v1';
      type: 'audio.chunk';
      payload: {
        chunkId: string;
        sequence: number;
        audioBase64: string;
        frameCount: number;
      };
    }
  | {
      version: 'v1';
      type: 'session.commit' | 'session.cancel';
      sessionId: string;
      payload?: {
        reason?: string;
      };
    };

export type STTStreamingServerEvent =
  | {
      version: 'v1';
      type: 'session.ready';
      sessionId: string;
      timestamp: number;
      payload: {
        provider: string;
        modelId: string;
        supportsStreaming: boolean;
      };
    }
  | {
      version: 'v1';
      type: 'transcript.partial';
      sessionId: string;
      timestamp: number;
      payload: {
        text: string;
        revision: number;
      };
    };
```

- [ ] **Step 4: Implement protocol helpers**

```ts
function createEnvelope<TType extends STTStreamingServerEvent['type'], TPayload>(
  type: TType,
  sessionId: string,
  payload: TPayload,
) {
  return {
    version: 'v1',
    type,
    sessionId,
    timestamp: Date.now(),
    payload,
  } as const;
}

export function parseClientMessage(rawMessage: string): STTStreamingClientMessage {
  const parsed = JSON.parse(rawMessage) as STTStreamingClientMessage;

  if (parsed.version !== 'v1' || typeof parsed.type !== 'string') {
    throw new Error('Unsupported STT streaming message');
  }

  return parsed;
}

export function createSessionReadyEvent(input: {
  sessionId: string;
  provider: string;
  modelId: string;
  supportsStreaming: boolean;
}) {
  return createEnvelope('session.ready', input.sessionId, {
    provider: input.provider,
    modelId: input.modelId,
    supportsStreaming: input.supportsStreaming,
  });
}

export function createTranscriptPartialEvent(input: {
  sessionId: string;
  text: string;
  revision: number;
}) {
  return createEnvelope('transcript.partial', input.sessionId, {
    text: input.text,
    revision: input.revision,
  });
}
```

- [ ] **Step 5: Run the protocol test**

Run: `npx ts-node-esm src/dev-tests/stt-streaming-protocol-runtime.ts`
Expected: PASS with `stt streaming public protocol runtime checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/stt-streaming/types.ts apps/api/src/modules/stt-streaming/protocol.ts apps/api/src/dev-tests/stt-streaming-protocol-runtime.ts
git commit -m "feat: add stt streaming public protocol"
```

### Task 2: Build the STT server streaming core and provider contract

**Files:**
- Create: `apps/stt-server/streaming/types.py`
- Create: `apps/stt-server/streaming/session_manager.py`
- Create: `apps/stt-server/streaming/event_mapper.py`
- Create: `apps/stt-server/streaming/engine.py`
- Modify: `apps/stt-server/providers/base.py`
- Modify: `apps/stt-server/providers/faster_whisper_provider.py`
- Modify: `apps/stt-server/providers/transformers_provider.py`
- Modify: `apps/stt-server/main.py`

- [ ] **Step 1: Write the failing session manager smoke test**

```python
from streaming.session_manager import StreamingSessionManager

manager = StreamingSessionManager()
session = manager.create(
    provider="faster-whisper",
    model_id="tiny",
    sample_rate=16000,
    channels=1,
)

assert session.session_id
assert manager.get(session.session_id) is session

manager.close(session.session_id)
assert manager.get(session.session_id) is None

print("stt streaming session manager smoke checks passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -c "from streaming.session_manager import StreamingSessionManager"`
Expected: FAIL with `ModuleNotFoundError: No module named 'streaming.session_manager'`

- [ ] **Step 3: Add shared streaming types**

```python
from dataclasses import dataclass, field

@dataclass
class StreamingSessionState:
    session_id: str
    provider: str
    model_id: str
    sample_rate: int
    channels: int
    pcm_chunks: list[bytes] = field(default_factory=list)
    confirmed_segments: list[str] = field(default_factory=list)
    partial_text: str = ""
    revision: int = 0

@dataclass
class StreamingEvent:
    type: str
    payload: dict
```

- [ ] **Step 4: Implement the session manager**

```python
import time
import uuid

from streaming.types import StreamingSessionState

class StreamingSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, StreamingSessionState] = {}

    def create(self, provider: str, model_id: str, sample_rate: int, channels: int):
        session = StreamingSessionState(
            session_id=str(uuid.uuid4()),
            provider=provider,
            model_id=model_id,
            sample_rate=sample_rate,
            channels=channels,
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str):
        return self._sessions.get(session_id)

    def close(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
```

- [ ] **Step 5: Extend the provider contract**

```python
class STTProvider(Protocol):
    provider_name: str

    def supports_streaming(self) -> bool:
        ...

    def open_stream_session(self, config, session_state):
        ...

    def push_stream_audio(self, loaded_model, session_state, pcm_chunk: bytes):
        ...

    def commit_stream_session(self, loaded_model, session_state):
        ...

    def cancel_stream_session(self, session_state):
        ...
```

- [ ] **Step 6: Add the streaming engine skeleton**

```python
class STTStreamingEngine:
    def __init__(self, registry, resolver, cache, sessions) -> None:
        self._registry = registry
        self._resolver = resolver
        self._cache = cache
        self._sessions = sessions

    def create_session(self, request):
        provider = self._registry.get(request.config.provider)
        if not provider.supports_streaming():
            raise ValueError(f"Provider does not support streaming: {request.config.provider}")
        session = self._sessions.create(
            provider=request.config.provider,
            model_id=request.config.model_id,
            sample_rate=request.sample_rate,
            channels=request.channels,
        )
        loaded_model = provider.load_model(request.config)
        provider.open_stream_session(request.config, session)
        return session, loaded_model
```

- [ ] **Step 7: Implement provider behavior**

```python
class TransformersProvider:
    provider_name = "transformers"

    def supports_streaming(self) -> bool:
        return False
```

```python
class FasterWhisperProvider:
    provider_name = "faster-whisper"

    def supports_streaming(self) -> bool:
        return True

    def push_stream_audio(self, loaded_model, session_state, pcm_chunk: bytes):
        session_state.pcm_chunks.append(pcm_chunk)
        return []
```

- [ ] **Step 8: Wire the streaming engine in `main.py`**

```python
from streaming.engine import STTStreamingEngine
from streaming.session_manager import StreamingSessionManager

streaming_sessions = StreamingSessionManager()
streaming_engine = STTStreamingEngine(registry, resolver, cache, streaming_sessions)

app.include_router(create_router(engine, cache, default_config, streaming_engine))
```

- [ ] **Step 9: Run the smoke test**

Run: `python -c "from streaming.session_manager import StreamingSessionManager; manager = StreamingSessionManager(); session = manager.create('faster-whisper', 'tiny', 16000, 1); print(bool(session.session_id))"`
Expected: `True`

- [ ] **Step 10: Commit**

```bash
git add apps/stt-server/streaming apps/stt-server/providers/base.py apps/stt-server/providers/faster_whisper_provider.py apps/stt-server/providers/transformers_provider.py apps/stt-server/main.py
git commit -m "feat: add stt server streaming engine skeleton"
```

### Task 3: Expose public `api` streaming routes and internal gateway

**Files:**
- Create: `apps/api/src/modules/stt-streaming/client.ts`
- Create: `apps/api/src/modules/stt-streaming/gateway.ts`
- Create: `apps/api/src/modules/stt-streaming/session-manager.ts`
- Create: `apps/api/src/modules/stt-streaming/capabilities.ts`
- Create: `apps/api/src/modules/stt-streaming/routes.ts`
- Create: `apps/api/src/dev-tests/stt-streaming-session-runtime.ts`
- Create: `apps/api/src/dev-tests/stt-streaming-route-runtime.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/modules/stt/services.ts`

- [ ] **Step 1: Write the failing route registration test**

```ts
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

import { sttStreamingRoutes } from '../modules/stt-streaming/routes.ts';

const app = Fastify();
await app.register(websocket);
await app.register(sttStreamingRoutes, { prefix: '/api/v1/stt-streaming' });

const routes = app.printRoutes();

assert.match(routes, /api\/v1\/stt-streaming/);

console.log('stt streaming route runtime checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ts-node-esm src/dev-tests/stt-streaming-route-runtime.ts`
Expected: FAIL with missing `stt-streaming/routes.ts`

- [ ] **Step 3: Create the internal gateway contract**

```ts
export type STTStreamingGateway = {
  connect(): Promise<void>;
  startSession(input: {
    requestId: string;
    sampleRate: number;
    channels: number;
    encoding: 'pcm_f32le';
  }): Promise<void>;
  pushChunk(input: {
    sessionId: string;
    sequence: number;
    chunkId: string;
    audioBase64: string;
    frameCount: number;
  }): Promise<void>;
  commitSession(sessionId: string): Promise<void>;
  cancelSession(sessionId: string, reason: string): Promise<void>;
  close(): void;
};
```

- [ ] **Step 4: Implement the route shell**

```ts
export const sttStreamingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    ok: true,
    transport: 'websocket',
    version: 'v1',
  }));

  app.get('/ws', { websocket: true }, (socket, request) => {
    const sendToClient = (message: unknown) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    const gateway = createSTTStreamingGateway({
      requestId: request.id,
      sendToClient,
    });

    void gateway.connect();
```

- [ ] **Step 5: Add capabilities mapping**

```ts
export function getSTTStreamingCapabilities(input: {
  provider: 'faster-whisper' | 'transformers';
}) {
  return {
    provider: input.provider,
    streaming: {
      supported: input.provider === 'faster-whisper',
      kind:
        input.provider === 'faster-whisper'
          ? 'realtime_partial_commit'
          : 'none',
    },
  } as const;
}
```

- [ ] **Step 6: Register the module in `index.ts`**

```ts
import { sttStreamingRoutes } from './modules/stt-streaming/routes.ts';

await app.register(sttStreamingRoutes, {
  prefix: '/api/v1/stt-streaming',
});
```

- [ ] **Step 7: Run the route and session tests**

Run: `npx ts-node-esm src/dev-tests/stt-streaming-route-runtime.ts`
Expected: PASS with `stt streaming route runtime checks passed`

Run: `npx ts-node-esm src/dev-tests/stt-streaming-session-runtime.ts`
Expected: PASS with `stt streaming session runtime checks passed`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/stt-streaming apps/api/src/dev-tests/stt-streaming-session-runtime.ts apps/api/src/dev-tests/stt-streaming-route-runtime.ts apps/api/src/index.ts apps/api/src/modules/stt/services.ts
git commit -m "feat: expose stt streaming api module"
```

### Task 4: Add the internal STT server websocket route and real provider events

**Files:**
- Modify: `apps/stt-server/api/routes.py`
- Modify: `apps/stt-server/streaming/engine.py`
- Modify: `apps/stt-server/providers/faster_whisper_provider.py`
- Modify: `apps/stt-server/providers/transformers_provider.py`

- [ ] **Step 1: Write the failing internal route smoke test**

```python
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

response = client.get("/health")
assert response.status_code == 200

print("stt server health smoke checks passed")
```

- [ ] **Step 2: Run the smoke test**

Run: `python -c "from main import app; print(bool(app.routes))"`
Expected: PASS before changes, then extend it after adding websocket route.

- [ ] **Step 3: Add internal websocket events**

```python
@router.websocket('/ws/stream')
async def stream_audio(websocket: WebSocket):
    await websocket.accept()
    session_id = None

    try:
        while True:
            message = json.loads(await websocket.receive_text())

            if message['type'] == 'session.start':
                session = streaming_engine.create_session(
                    StreamingOpenRequest(
                        sample_rate=message['payload']['sampleRate'],
                        channels=message['payload']['channels'],
                        config=default_config,
                    )
                )
                session_id = session.session_id
                await websocket.send_json({
                    'type': 'session.ready',
                    'sessionId': session_id,
                    'payload': {
                        'provider': default_config.provider,
                        'modelId': default_config.model_id,
                    },
                })
                continue
```

- [ ] **Step 4: Emit partial and confirmed events from faster-whisper**

```python
def push_stream_audio(self, loaded_model, session_state, pcm_chunk: bytes):
    session_state.pcm_chunks.append(pcm_chunk)

    if len(session_state.pcm_chunks) < 4:
        return []

    partial_text = self._transcribe_partial_window(loaded_model, session_state)
    if partial_text == session_state.partial_text:
        return []

    session_state.revision += 1
    session_state.partial_text = partial_text

    return [
        StreamingEvent(
            type='transcript.partial',
            payload={
                'text': partial_text,
                'revision': session_state.revision,
            },
        )
    ]
```

- [ ] **Step 5: Implement commit finalization**

```python
def commit_stream_session(self, loaded_model, session_state):
    final_text = self._transcribe_full_session(loaded_model, session_state)
    confirmed_segments = [segment.strip() for segment in final_text.split('.') if segment.strip()]
    session_state.confirmed_segments = confirmed_segments

    events = [
        StreamingEvent(
            type='transcript.confirmed',
            payload={'text': segment, 'index': index},
        )
        for index, segment in enumerate(confirmed_segments)
    ]
    events.append(
        StreamingEvent(
            type='transcript.final',
            payload={'text': final_text},
        )
    )
    return events
```

- [ ] **Step 6: Fail explicitly for unsupported providers**

```python
if not provider.supports_streaming():
    raise ValueError(
        f'STT streaming is not supported by provider: {request.config.provider}'
    )
```

- [ ] **Step 7: Run the `stt-server` boot smoke test**

Run: `python -c "from main import app; print(any(getattr(route, 'path', '') == '/ws/stream' for route in app.routes))"`
Expected: `True`

- [ ] **Step 8: Commit**

```bash
git add apps/stt-server/api/routes.py apps/stt-server/streaming/engine.py apps/stt-server/providers/faster_whisper_provider.py apps/stt-server/providers/transformers_provider.py
git commit -m "feat: stream partial stt events from stt server"
```

### Task 5: Capture PCM chunks in Electron and show partial + confirmed captions

**Files:**
- Create: `apps/electron/src/shared/services/sttStreamingCapabilitiesService.ts`
- Create: `apps/electron/src/views/voice-turn/services/stt-streaming-client.ts`
- Modify: `apps/electron/src/shared/utils/audio-recorder.ts`
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Modify: `apps/electron/src/views/voice-turn/VoiceTurnView.vue`

- [ ] **Step 1: Write the failing capability/runtime test**

```ts
import assert from 'node:assert/strict';

import { mapSTTStreamingToMode } from './sttStreamingCapabilitiesService.ts';

const mapped = mapSTTStreamingToMode({
  provider: 'faster-whisper',
  streaming: {
    supported: true,
    kind: 'realtime_partial_commit',
  },
});

assert.equal(mapped.supported, true);
assert.equal(mapped.kind, 'realtime_partial_commit');

console.log('stt streaming capabilities runtime checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/shared/services/sttStreamingCapabilitiesService.ts`
Expected: FAIL before file exists

- [ ] **Step 3: Extend `AudioRecorder` with live chunk callback**

```ts
constructor(
  private options: {
    onPcmChunk?: (chunk: {
      samples: Float32Array;
      sampleRate: number;
    }) => void;
  } = {},
) {}

this.processorNode.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0);
  const copy = new Float32Array(inputData);

  this.samples.push(copy);
  this.totalLength += copy.length;

  this.options.onPcmChunk?.({
    samples: copy,
    sampleRate: this.audioContext?.sampleRate ?? 44100,
  });
};
```

- [ ] **Step 4: Add a focused renderer STT streaming client**

```ts
export function createSTTStreamingClient(input: {
  onReady: (payload: { sessionId: string }) => void;
  onPartial: (payload: { text: string; revision: number }) => void;
  onConfirmed: (payload: { text: string; index: number }) => void;
  onFinal: (payload: { text: string }) => void;
  onError: (error: Error) => void;
}) {
  const socket = new WebSocket(`${API_BASE.replace('http', 'ws')}/stt-streaming/ws`);

  return {
    start(sampleRate: number) {
      socket.send(JSON.stringify({
        version: 'v1',
        type: 'session.start',
        payload: {
          sampleRate,
          channels: 1,
          encoding: 'pcm_f32le',
        },
      }));
    },
  };
}
```

- [ ] **Step 5: Integrate streaming into `voiceTurnService.ts`**

```ts
const partialTranscript = ref('');
const confirmedTranscriptSegments = ref<string[]>([]);
const finalTranscript = ref('');

const sttClient = createSTTStreamingClient({
  onPartial: ({ text }) => {
    partialTranscript.value = text;
  },
  onConfirmed: ({ text }) => {
    confirmedTranscriptSegments.value = [...confirmedTranscriptSegments.value, text];
    partialTranscript.value = '';
  },
  onFinal: ({ text }) => {
    finalTranscript.value = text;
    liveCaption.value = text;
  },
  onError: (error) => {
    console.error('[voice-turn] stt streaming failed', error);
  },
});
```

- [ ] **Step 6: Update the voice-turn view**

```vue
<aside v-if="partialCaption || confirmedCaptions.length" class="live-caption-panel">
  <span class="live-caption-label">Live Caption</span>
  <p v-if="partialCaption" class="live-caption-partial">{{ partialCaption }}</p>
  <div v-if="confirmedCaptions.length" class="live-caption-confirmed-list">
    <p
      v-for="(segment, index) in confirmedCaptions"
      :key="`${index}-${segment}`"
      class="live-caption-confirmed"
    >
      {{ segment }}
    </p>
  </div>
</aside>
```

- [ ] **Step 7: Run the renderer package build**

Run: `npm run package`
Expected: PASS in `apps/electron`

- [ ] **Step 8: Commit**

```bash
git add apps/electron/src/shared/services/sttStreamingCapabilitiesService.ts apps/electron/src/views/voice-turn/services/stt-streaming-client.ts apps/electron/src/shared/utils/audio-recorder.ts apps/electron/src/views/voice-turn/services/voiceTurnService.ts apps/electron/src/views/voice-turn/VoiceTurnView.vue
git commit -m "feat: show live stt streaming captions in voice turn"
```

### Task 6: Reuse the final streamed transcript in the assistant flow and verify fallback behavior

**Files:**
- Modify: `apps/api/src/modules/assistant/services.ts`
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Modify: `apps/api/src/modules/stt/services.ts`

- [ ] **Step 1: Write the failing voice-turn regression test**

```ts
import assert from 'node:assert/strict';

import { resolveVoiceTurnTranscript } from '../modules/assistant/services.ts';

assert.equal(
  resolveVoiceTurnTranscript({
    streamedTranscript: 'boa noite',
    fallbackTranscript: 'ignorar',
  }),
  'boa noite',
);

console.log('assistant streamed transcript preference checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ts-node-esm src/dev-tests/assistant-streamed-transcript-runtime.ts`
Expected: FAIL with missing export

- [ ] **Step 3: Prefer the streamed final transcript**

```ts
export function resolveVoiceTurnTranscript(input: {
  streamedTranscript?: string | null;
  fallbackTranscript: string;
}) {
  const streamed = input.streamedTranscript?.trim();
  if (streamed) {
    return streamed;
  }

  return input.fallbackTranscript.trim();
}
```

- [ ] **Step 4: Apply explicit fallback behavior in the renderer**

```ts
if (sttStreamingSupported.value) {
  await streamUserSpeechUntilCommit();
  transcriptText = finalTranscript.value.trim();
} else {
  transcriptText = await transcribeWithTraditionalFlow();
}
```

- [ ] **Step 5: Run cross-app verification**

Run: `npm run build`
Expected: PASS in `apps/api`

Run: `npm run package`
Expected: PASS in `apps/electron`

Run: `python -c "from main import app; print('ok')"`
Expected: `ok` in `apps/stt-server`

- [ ] **Step 6: Manual verification**

Run the app and verify:

- with `faster-whisper` active, the left panel shows a live partial line and confirmed segments while recording
- when stopping speech, the final transcript is used for the assistant request
- with `transformers` active, the UI falls back cleanly to the classic final-only transcription flow
- cancelling during recording closes the STT streaming session without leaving stale text behind

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/assistant/services.ts apps/electron/src/views/voice-turn/services/voiceTurnService.ts apps/api/src/modules/stt/services.ts
git commit -m "feat: route voice turn through streamed stt transcript"
```

## Self-Review

### Spec coverage

- Public `api` WebSocket boundary: covered by Tasks 1 and 3
- `stt-server` streaming engine and session lifecycle: covered by Tasks 2 and 4
- Provider-specific support and explicit failure: covered by Tasks 2, 4, and 6
- Frontend partial + confirmed UX: covered by Task 5
- Final transcript only flowing into LLM: covered by Task 6
- Guardrails, fallback, and regression behavior: covered by Tasks 3, 4, and 6

### Placeholder scan

- No `TODO` or `TBD`
- Every task names exact files
- Every task includes explicit commands
- Each implementation step includes at least one concrete code shape

### Type consistency

- Public event names consistently use `session.ready`, `transcript.partial`, `transcript.confirmed`, and `transcript.final`
- Provider contract consistently uses `supports_streaming`, `open_stream_session`, `push_stream_audio`, and `commit_stream_session`
- Frontend consistently consumes `partial`, `confirmed`, and `final` transcript states

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-stt-streaming-implementation.md`.

You already asked me to proceed with all tasks, so I will use inline execution in this session next, following the plan task by task.
