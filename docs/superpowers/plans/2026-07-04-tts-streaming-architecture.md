# TTS Streaming Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar streaming de TTS em tempo real via WebSocket, com protocolo publico versionado na `api`, chunks PCM, eventos textuais incrementais e reproducao progressiva no Electron.

**Architecture:** O Electron falara apenas com a `api` por WebSocket. A `api` sera a fronteira publica do protocolo e traduzira mensagens para um protocolo interno do `tts-server`. O `tts-server` ganhara uma trilha de streaming separada da sintese completa atual, preservando SRP e permitindo futuros providers.

**Tech Stack:** TypeScript, Fastify/WebSocket, Python, FastAPI/WebSocket, Piper, Vue, Web Audio API, PowerShell, git

---

### Task 1: Definir o protocolo publico de streaming na API

**Files:**
- Create: `apps/api/src/modules/tts-streaming/types.ts`
- Create: `apps/api/src/modules/tts-streaming/protocol.ts`
- Test: `apps/api/src/dev-tests/tts-streaming-protocol-runtime.ts`

- [ ] **Step 1: Escrever o teste de runtime do protocolo publico**

```ts
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
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-protocol-runtime.ts`
Workdir: `apps/api`
Expected: FAIL com erro de imports ausentes de `tts-streaming/protocol.ts`

- [ ] **Step 3: Criar os tipos publicos do protocolo**

```ts
// apps/api/src/modules/tts-streaming/types.ts
export type TTSStreamEventType =
  | 'session.start'
  | 'audio.chunk'
  | 'text.chunk'
  | 'metrics'
  | 'status'
  | 'warning'
  | 'session.complete'
  | 'session.cancelled'
  | 'session.error';

export type TTSStreamEnvelope<TType extends TTSStreamEventType, TPayload> = {
  version: 'v1';
  type: TType;
  sessionId: string;
  timestamp: number;
  payload: TPayload;
};

export type TTSSessionStartPayload = {
  voiceId: string;
  provider: string;
  sampleRate: number;
  channels: number;
  sampleFormat: 'pcm_s16le';
};

export type TTSAudioChunkPayload = {
  sequence: number;
  chunkId: string;
  encoding: 'pcm_s16le';
  sampleRate: number;
  channels: number;
  frameCount: number;
  durationMs: number;
  audioBase64: string;
};

export type TTSTextChunkPayload = {
  sequence: number;
  text: string;
  isFinal: boolean;
};

export type TTSMetricsPayload = {
  timeToFirstChunkMs: number;
  audioChunksSent: number;
  textChunksSent: number;
  generatedAudioDurationMs: number;
  elapsedMs: number;
};
```

- [ ] **Step 4: Criar helpers do protocolo publico**

```ts
// apps/api/src/modules/tts-streaming/protocol.ts
import type {
  TTSAudioChunkPayload,
  TTSMetricsPayload,
  TTSSessionStartPayload,
  TTSTextChunkPayload,
  TTSStreamEnvelope,
} from './types.ts';

function createEnvelope<TType extends string, TPayload>(
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

export function createSessionStartEvent(
  input: { sessionId: string } & TTSSessionStartPayload,
): TTSStreamEnvelope<'session.start', TTSSessionStartPayload> {
  return createEnvelope('session.start', input.sessionId, {
    voiceId: input.voiceId,
    provider: input.provider,
    sampleRate: input.sampleRate,
    channels: input.channels,
    sampleFormat: input.sampleFormat,
  });
}

export function createAudioChunkEvent(
  input: { sessionId: string } & Omit<TTSAudioChunkPayload, 'encoding'>,
): TTSStreamEnvelope<'audio.chunk', TTSAudioChunkPayload> {
  return createEnvelope('audio.chunk', input.sessionId, {
    ...input,
    encoding: 'pcm_s16le',
  });
}

export function createTextChunkEvent(
  input: { sessionId: string } & TTSTextChunkPayload,
): TTSStreamEnvelope<'text.chunk', TTSTextChunkPayload> {
  return createEnvelope('text.chunk', input.sessionId, {
    sequence: input.sequence,
    text: input.text,
    isFinal: input.isFinal,
  });
}

export function createMetricsEvent(
  input: { sessionId: string } & TTSMetricsPayload,
): TTSStreamEnvelope<'metrics', TTSMetricsPayload> {
  return createEnvelope('metrics', input.sessionId, {
    timeToFirstChunkMs: input.timeToFirstChunkMs,
    audioChunksSent: input.audioChunksSent,
    textChunksSent: input.textChunksSent,
    generatedAudioDurationMs: input.generatedAudioDurationMs,
    elapsedMs: input.elapsedMs,
  });
}
```

- [ ] **Step 5: Rodar o teste para verificar que passa**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-protocol-runtime.ts`
Workdir: `apps/api`
Expected: PASS com `tts streaming public protocol runtime checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tts-streaming apps/api/src/dev-tests/tts-streaming-protocol-runtime.ts
git commit -m "feat: add tts streaming public protocol"
```

### Task 2: Criar o cliente e o session manager de streaming na API

**Files:**
- Create: `apps/api/src/modules/tts-streaming/client.ts`
- Create: `apps/api/src/modules/tts-streaming/session-manager.ts`
- Create: `apps/api/src/modules/tts-streaming/gateway.ts`
- Test: `apps/api/src/dev-tests/tts-streaming-session-runtime.ts`

- [ ] **Step 1: Escrever o teste de session manager**

```ts
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
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-session-runtime.ts`
Workdir: `apps/api`
Expected: FAIL com imports ausentes de `session-manager.ts`

- [ ] **Step 3: Criar o cliente interno para o tts-server**

```ts
// apps/api/src/modules/tts-streaming/client.ts
export type InternalTTSStreamClient = {
  connect(sessionId: string): Promise<void>;
  sendStart(message: unknown): void;
  sendCancel(reason: string): void;
  close(): void;
};

export function createInternalTTSStreamClient(): InternalTTSStreamClient {
  return {
    async connect() {
      return;
    },
    sendStart() {},
    sendCancel() {},
    close() {},
  };
}
```

- [ ] **Step 4: Criar o session manager**

```ts
// apps/api/src/modules/tts-streaming/session-manager.ts
type SessionSender = {
  sendToClient(message: unknown): void;
};

export function createTTSStreamingSessionManager(sender: SessionSender) {
  const activeSessions = new Set<string>();

  return {
    register(sessionId: string) {
      activeSessions.add(sessionId);
    },
    isActive(sessionId: string) {
      return activeSessions.has(sessionId);
    },
    cancel(sessionId: string, reason: string) {
      if (!activeSessions.has(sessionId)) {
        return;
      }

      activeSessions.delete(sessionId);
      sender.sendToClient({
        version: 'v1',
        type: 'session.cancelled',
        sessionId,
        timestamp: Date.now(),
        payload: { reason },
      });
    },
  };
}
```

- [ ] **Step 5: Criar o gateway de streaming**

```ts
// apps/api/src/modules/tts-streaming/gateway.ts
import { randomUUID } from 'node:crypto';

import { createSessionStartEvent } from './protocol.ts';
import { createTTSStreamingSessionManager } from './session-manager.ts';

export function createTTSStreamingGateway(sendToClient: (message: unknown) => void) {
  const manager = createTTSStreamingSessionManager({ sendToClient });

  return {
    startSession(input: {
      voiceId: string;
      provider: string;
      sampleRate: number;
      channels: number;
    }) {
      const sessionId = `tts_${randomUUID()}`;
      manager.register(sessionId);
      sendToClient(
        createSessionStartEvent({
          sessionId,
          voiceId: input.voiceId,
          provider: input.provider,
          sampleRate: input.sampleRate,
          channels: input.channels,
          sampleFormat: 'pcm_s16le',
        }),
      );
      return sessionId;
    },
    cancelSession(sessionId: string, reason: string) {
      manager.cancel(sessionId, reason);
    },
  };
}
```

- [ ] **Step 6: Rodar o teste para verificar que passa**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-session-runtime.ts`
Workdir: `apps/api`
Expected: PASS com `tts streaming session runtime checks passed`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tts-streaming/client.ts apps/api/src/modules/tts-streaming/session-manager.ts apps/api/src/modules/tts-streaming/gateway.ts apps/api/src/dev-tests/tts-streaming-session-runtime.ts
git commit -m "feat: add api tts streaming session manager"
```

### Task 3: Expor endpoint WebSocket publico de TTS streaming na API

**Files:**
- Create: `apps/api/src/modules/tts-streaming/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/dev-tests/tts-streaming-route-runtime.ts`

- [ ] **Step 1: Escrever o teste de registracao de rota**

```ts
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { ttsStreamingRoutes } from '../modules/tts-streaming/routes.ts';

const app = Fastify();
await app.register(ttsStreamingRoutes, { prefix: '/api/v1/tts-streaming' });
await app.ready();

const routePaths = app.printRoutes();
assert.match(routePaths, /\/api\/v1\/tts-streaming/);

await app.close();

console.log('tts streaming route runtime checks passed');
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-route-runtime.ts`
Workdir: `apps/api`
Expected: FAIL com import ausente de `routes.ts`

- [ ] **Step 3: Criar o modulo de rotas WebSocket**

```ts
// apps/api/src/modules/tts-streaming/routes.ts
import type { FastifyPluginAsync } from 'fastify';

export const ttsStreamingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return {
      ok: true,
      transport: 'websocket',
      version: 'v1',
    };
  });
};
```

- [ ] **Step 4: Registrar o modulo no bootstrap da API**

```ts
// apps/api/src/index.ts
import { ttsStreamingRoutes } from './modules/tts-streaming/routes.ts';

await app.register(ttsStreamingRoutes, {
  prefix: '/api/v1/tts-streaming',
});
```

- [ ] **Step 5: Rodar o teste para verificar que passa**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-route-runtime.ts`
Workdir: `apps/api`
Expected: PASS com `tts streaming route runtime checks passed`

- [ ] **Step 6: Rodar build da API**

Run: `npm run build`
Workdir: `apps/api`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tts-streaming/routes.ts apps/api/src/index.ts apps/api/src/dev-tests/tts-streaming-route-runtime.ts
git commit -m "feat: add api tts streaming routes"
```

### Task 4: Criar a trilha interna de streaming no tts-server

**Files:**
- Create: `apps/tts-server/services/pcm_chunker.py`
- Create: `apps/tts-server/services/text_chunker.py`
- Create: `apps/tts-server/services/session_metrics.py`
- Create: `apps/tts-server/core/streaming_engine.py`
- Create: `apps/tts-server/api/ws_routes.py`
- Test: `apps/tts-server/tests/test_streaming_engine.py`

- [ ] **Step 1: Escrever o teste do engine de streaming**

```python
import unittest

from core.streaming_engine import build_audio_chunk_message


class StreamingEngineTests(unittest.TestCase):
    def test_build_audio_chunk_message_uses_pcm_payload(self) -> None:
        message = build_audio_chunk_message(
            session_id="tts_1",
            sequence=1,
            sample_rate=22050,
            channels=1,
            frame_count=4,
            audio_bytes=b"\x01\x02\x03\x04",
        )

        self.assertEqual(message["type"], "audio.chunk")
        self.assertEqual(message["sessionId"], "tts_1")
        self.assertEqual(message["payload"]["encoding"], "pcm_s16le")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `apps/tts-server/.venv/Scripts/python.exe -m unittest apps/tts-server/tests/test_streaming_engine.py`
Workdir: `C:\Workspace\desktop-agent`
Expected: FAIL com import ausente de `core.streaming_engine`

- [ ] **Step 3: Criar utilitarios de chunking e metricas**

```python
# apps/tts-server/services/pcm_chunker.py
def chunk_pcm_bytes(audio_bytes: bytes, chunk_size: int = 4096) -> list[bytes]:
    return [
        audio_bytes[index:index + chunk_size]
        for index in range(0, len(audio_bytes), chunk_size)
    ]
```

```python
# apps/tts-server/services/text_chunker.py
def chunk_text(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    return [' '.join(words[:index]) for index in range(1, len(words) + 1)]
```

```python
# apps/tts-server/services/session_metrics.py
from dataclasses import dataclass


@dataclass
class StreamingSessionMetrics:
    audio_chunks_sent: int = 0
    text_chunks_sent: int = 0
```

- [ ] **Step 4: Criar o engine de streaming**

```python
# apps/tts-server/core/streaming_engine.py
import base64


def build_audio_chunk_message(
    session_id: str,
    sequence: int,
    sample_rate: int,
    channels: int,
    frame_count: int,
    audio_bytes: bytes,
):
    return {
        "type": "audio.chunk",
        "sessionId": session_id,
        "payload": {
            "sequence": sequence,
            "chunkId": f"{session_id}_{sequence}",
            "encoding": "pcm_s16le",
            "sampleRate": sample_rate,
            "channels": channels,
            "frameCount": frame_count,
            "durationMs": 0,
            "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
        },
    }
```

- [ ] **Step 5: Criar rota interna WebSocket inicial**

```python
# apps/tts-server/api/ws_routes.py
from fastapi import APIRouter


def create_ws_router():
    router = APIRouter()
    return router
```

- [ ] **Step 6: Rodar o teste para verificar que passa**

Run: `apps/tts-server/.venv/Scripts/python.exe -m unittest apps/tts-server/tests/test_streaming_engine.py`
Workdir: `C:\Workspace\desktop-agent`
Expected: PASS

- [ ] **Step 7: Rodar compile Python**

Run: `apps/tts-server/.venv/Scripts/python.exe -m py_compile apps/tts-server/core/streaming_engine.py apps/tts-server/api/ws_routes.py apps/tts-server/services/pcm_chunker.py apps/tts-server/services/text_chunker.py apps/tts-server/services/session_metrics.py`
Workdir: `C:\Workspace\desktop-agent`
Expected: exit code 0

- [ ] **Step 8: Commit**

```bash
git add apps/tts-server/core/streaming_engine.py apps/tts-server/api/ws_routes.py apps/tts-server/services/pcm_chunker.py apps/tts-server/services/text_chunker.py apps/tts-server/services/session_metrics.py apps/tts-server/tests/test_streaming_engine.py
git commit -m "feat: add tts server streaming engine scaffolding"
```

### Task 5: Construir player incremental no Electron

**Files:**
- Create: `apps/electron/src/shared/utils/tts-stream-player.ts`
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Test: `apps/electron/src/shared/utils/tts-stream-player.test.ts`

- [ ] **Step 1: Escrever o teste do player incremental**

```ts
import assert from 'node:assert/strict';

import { decodePcm16ToFloat32 } from './tts-stream-player.ts';

const decoded = decodePcm16ToFloat32(new Uint8Array([0, 0, 255, 127]));

assert.equal(decoded.length, 2);
assert.equal(decoded[0], 0);
assert.ok(decoded[1] > 0.99);

console.log('tts stream player runtime checks passed');
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `node --loader ts-node/esm src/shared/utils/tts-stream-player.test.ts`
Workdir: `apps/electron`
Expected: FAIL com import ausente de `tts-stream-player.ts`

- [ ] **Step 3: Criar utilitario do player**

```ts
// apps/electron/src/shared/utils/tts-stream-player.ts
export function decodePcm16ToFloat32(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const output = new Float32Array(input.byteLength / 2);

  for (let index = 0; index < output.length; index += 1) {
    const value = view.getInt16(index * 2, true);
    output[index] = Math.max(-1, value / 32768);
  }

  return output;
}
```

- [ ] **Step 4: Adaptar o `voiceTurnService` para nova trilha de sessao streaming**

```ts
// apps/electron/src/views/voice-turn/services/voiceTurnService.ts
// adicionar estado dedicado:
// - activeTTSStreamSessionId
// - liveCaption
// - stream player instance
// - cancelamento da sessao atual antes de abrir outra
```

- [ ] **Step 5: Rodar o teste para verificar que passa**

Run: `node --loader ts-node/esm src/shared/utils/tts-stream-player.test.ts`
Workdir: `apps/electron`
Expected: PASS com `tts stream player runtime checks passed`

- [ ] **Step 6: Rodar package do Electron**

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/shared/utils/tts-stream-player.ts apps/electron/src/shared/utils/tts-stream-player.test.ts apps/electron/src/views/voice-turn/services/voiceTurnService.ts
git commit -m "feat: add electron tts stream playback base"
```

### Task 6: Integrar legenda incremental, cancelamento e fluxo completo

**Files:**
- Modify: `apps/electron/src/views/voice-turn/VoiceTurnView.vue`
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Modify: `apps/api/src/modules/assistant/services.ts`
- Test: `apps/api/src/dev-tests/tts-streaming-protocol-runtime.ts`
- Test: `apps/electron/src/shared/utils/tts-stream-player.test.ts`

- [ ] **Step 1: Expor legenda incremental no service**

```ts
// apps/electron/src/views/voice-turn/services/voiceTurnService.ts
// adicionar:
// const liveCaption = ref('');
// atualizar liveCaption a cada `text.chunk`
// limpar liveCaption em complete, error e cancel
```

- [ ] **Step 2: Renderizar legenda incremental na view**

```vue
<!-- apps/electron/src/views/voice-turn/VoiceTurnView.vue -->
<!-- adicionar uma area lateral ligada a `liveCaption` -->
```

- [ ] **Step 3: Garantir cancelamento seguro da sessao**

```ts
// apps/electron/src/views/voice-turn/services/voiceTurnService.ts
// ao cancelar:
// - enviar cancel para a sessao ativa
// - aplicar fade-out curto no player
// - zerar referencias locais
```

- [ ] **Step 4: Adaptar assistant para futura reutilizacao do stream**

```ts
// apps/api/src/modules/assistant/services.ts
// manter endpoint atual estavel, mas introduzir ponto de extensao para
// stream de TTS quando a UI passar a consumi-lo no fluxo completo
```

- [ ] **Step 5: Rodar os testes de runtime**

Run: `node --loader ts-node/esm src/dev-tests/tts-streaming-protocol-runtime.ts`
Workdir: `apps/api`
Expected: PASS

Run: `node --loader ts-node/esm src/shared/utils/tts-stream-player.test.ts`
Workdir: `apps/electron`
Expected: PASS

- [ ] **Step 6: Rodar build/package final**

Run: `npm run build`
Workdir: `apps/api`
Expected: exit code 0

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/views/voice-turn/VoiceTurnView.vue apps/electron/src/views/voice-turn/services/voiceTurnService.ts apps/api/src/modules/assistant/services.ts
git commit -m "feat: integrate live tts captions and cancellation"
```

### Task 7: Verificacao integrada do streaming de TTS

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-tts-streaming-architecture-design.md` (only if implementation decisions change)

- [ ] **Step 1: Verificar compile Python**

Run: `apps/tts-server/.venv/Scripts/python.exe -m py_compile apps/tts-server/main.py apps/tts-server/server.py apps/tts-server/api/*.py apps/tts-server/core/*.py apps/tts-server/providers/*.py apps/tts-server/services/*.py`
Workdir: `C:\Workspace\desktop-agent`
Expected: exit code 0

- [ ] **Step 2: Verificar build da API**

Run: `npm run build`
Workdir: `apps/api`
Expected: exit code 0

- [ ] **Step 3: Verificar package do Electron**

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

- [ ] **Step 4: Validar o boot real e o fluxo WebSocket**

Run: `npm run dev`
Workdir: `apps/api`
Expected:
- `tts-server` sobe sem derrubar a API
- endpoint de streaming registra conexao
- `session.start` chega primeiro
- `audio.chunk` e `text.chunk` chegam incrementalmente
- cancelamento encerra a sessao sem fallback

- [ ] **Step 5: Commit final**

```bash
git add apps/api apps/tts-server apps/electron
git commit -m "feat: add end-to-end tts streaming"
```
