# TTS Provider Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o `apps/tts-server` para a mesma arquitetura modular do `apps/stt-server`, com engine central, provider `piper`, cache separado e tratamento de erro estruturado, sem mudar o comportamento externo atual.

**Architecture:** O `tts-server` sera reorganizado em `api`, `core`, `providers` e `services`, com `main.py` montando app, registry, resolver, cache e engine. O provider `piper` sera abstraido atras de uma interface base para permitir futuros providers como `kokoro` sem reescrever o servidor.

**Tech Stack:** Python, FastAPI, Piper, TypeScript (API integrator validation), PowerShell, git

---

### Task 1: Extrair tipos, config e cache centrais do `tts-server`

**Files:**
- Create: `apps/tts-server/__init__.py`
- Create: `apps/tts-server/core/__init__.py`
- Create: `apps/tts-server/core/types.py`
- Create: `apps/tts-server/core/config.py`
- Create: `apps/tts-server/services/__init__.py`
- Create: `apps/tts-server/services/voice_cache.py`
- Create: `apps/tts-server/services/audio_buffer.py`
- Modify: `apps/tts-server/server.py`

- [ ] **Step 1: Criar os tipos centrais do runtime TTS**

```python
# apps/tts-server/core/types.py
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class ProviderVoiceConfig:
    voice_id: str
    provider: str
    model_path: str
    config_path: str
    length_scale: float
    noise_scale: float
    noise_w: float


@dataclass(frozen=True)
class ProviderVoiceKey:
    provider: str
    voice_id: str
    model_path: str
    config_path: str


@dataclass(frozen=True)
class SynthesisRequest:
    text: str
    config: ProviderVoiceConfig
    request_id: Optional[str] = None


@dataclass(frozen=True)
class SynthesisResult:
    audio_bytes: bytes
    audio_content_type: str
    duration_ms: int
    provider: str
    voice_id: str


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    reason: Optional[str] = None
    normalized_model_path: Optional[str] = None
    normalized_config_path: Optional[str] = None


LoadedProviderVoice = Any
```

- [ ] **Step 2: Criar a leitura de configuracao default do TTS**

```python
# apps/tts-server/core/config.py
import os
from typing import Optional

from core.types import ProviderVoiceConfig


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


TTS_PROVIDER = os.environ.get("TTS_PROVIDER", "piper")
TTS_MODEL_PATH = os.environ["PIPER_MODEL_PATH"]
TTS_CONFIG_PATH = os.environ["PIPER_CONFIG_PATH"]
TTS_VOICE_ID = clean_optional(os.environ.get("PIPER_VOICE_ID"))


def build_config(
    provider: Optional[str] = None,
    voice_id: Optional[str] = None,
    model_path: Optional[str] = None,
    config_path: Optional[str] = None,
    length_scale: Optional[float] = None,
    noise_scale: Optional[float] = None,
    noise_w: Optional[float] = None,
) -> ProviderVoiceConfig:
    resolved_model_path = clean_optional(model_path) or TTS_MODEL_PATH
    resolved_config_path = clean_optional(config_path) or TTS_CONFIG_PATH
    resolved_voice_id = (
        clean_optional(voice_id)
        or TTS_VOICE_ID
        or resolved_model_path
    )

    return ProviderVoiceConfig(
        voice_id=resolved_voice_id,
        provider=clean_optional(provider) or TTS_PROVIDER,
        model_path=resolved_model_path,
        config_path=resolved_config_path,
        length_scale=length_scale if length_scale is not None else 1.15,
        noise_scale=noise_scale if noise_scale is not None else 0.667,
        noise_w=noise_w if noise_w is not None else 0.8,
    )
```

- [ ] **Step 3: Criar cache thread-safe de vozes**

```python
# apps/tts-server/services/voice_cache.py
import threading

from core.types import LoadedProviderVoice, ProviderVoiceKey


class VoiceCache:
    def __init__(self) -> None:
        self._voices: dict[ProviderVoiceKey, LoadedProviderVoice] = {}
        self._lock = threading.Lock()

    def get(self, key: ProviderVoiceKey) -> LoadedProviderVoice | None:
        return self._voices.get(key)

    def set(self, key: ProviderVoiceKey, voice: LoadedProviderVoice) -> None:
        with self._lock:
            self._voices[key] = voice

    def snapshot(self) -> list[dict[str, str]]:
        return [
            {
                "provider": key.provider,
                "voiceId": key.voice_id,
                "modelPath": key.model_path,
                "configPath": key.config_path,
            }
            for key in self._voices.keys()
        ]
```

- [ ] **Step 4: Criar servico de buffer de audio**

```python
# apps/tts-server/services/audio_buffer.py
import os
import tempfile


class AudioBufferStore:
    def create_temp_path(self, suffix: str = ".wav") -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            return temp_file.name

    def remove(self, file_path: str) -> None:
        if os.path.exists(file_path):
            os.remove(file_path)
```

- [ ] **Step 5: Criar arquivos `__init__.py` minimos**

```python
# apps/tts-server/__init__.py
```

```python
# apps/tts-server/core/__init__.py
```

```python
# apps/tts-server/services/__init__.py
```

- [ ] **Step 6: Rodar compile Python para validar a base**

Run: `python -m py_compile apps/tts-server/core/types.py apps/tts-server/core/config.py apps/tts-server/services/voice_cache.py apps/tts-server/services/audio_buffer.py`

Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add apps/tts-server/__init__.py apps/tts-server/core apps/tts-server/services
git commit -m "refactor: add tts runtime core primitives"
```

### Task 2: Criar registry, resolver, interface base e provider `piper`

**Files:**
- Create: `apps/tts-server/providers/__init__.py`
- Create: `apps/tts-server/providers/base.py`
- Create: `apps/tts-server/providers/piper_provider.py`
- Create: `apps/tts-server/core/registry.py`
- Create: `apps/tts-server/core/voice_resolver.py`

- [ ] **Step 1: Criar interface base de provider TTS**

```python
# apps/tts-server/providers/base.py
from abc import ABC, abstractmethod

from core.types import (
    LoadedProviderVoice,
    ProviderVoiceConfig,
    SynthesisRequest,
    SynthesisResult,
    ValidationResult,
)


class TTSProvider(ABC):
    provider_name: str

    @abstractmethod
    def validate_voice(self, config: ProviderVoiceConfig) -> ValidationResult:
        raise NotImplementedError

    @abstractmethod
    def load_voice(self, config: ProviderVoiceConfig) -> LoadedProviderVoice:
        raise NotImplementedError

    @abstractmethod
    def synthesize(
        self,
        loaded_voice: LoadedProviderVoice,
        request: SynthesisRequest,
    ) -> SynthesisResult:
        raise NotImplementedError
```

- [ ] **Step 2: Criar registry de providers**

```python
# apps/tts-server/core/registry.py
from providers.base import TTSProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, TTSProvider] = {}

    def register(self, provider: TTSProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get(self, provider_name: str) -> TTSProvider:
        provider = self._providers.get(provider_name)
        if provider is None:
            raise ValueError(f"Unsupported TTS provider: {provider_name}")
        return provider

    def list_names(self) -> list[str]:
        return sorted(self._providers.keys())
```

- [ ] **Step 3: Criar resolver de voz**

```python
# apps/tts-server/core/voice_resolver.py
from core.registry import ProviderRegistry
from core.types import ProviderVoiceConfig, ValidationResult


class VoiceResolver:
    def __init__(self, registry: ProviderRegistry) -> None:
        self._registry = registry

    def validate(self, config: ProviderVoiceConfig) -> ValidationResult:
        provider = self._registry.get(config.provider)
        return provider.validate_voice(config)
```

- [ ] **Step 4: Implementar provider Piper**

```python
# apps/tts-server/providers/piper_provider.py
import time
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

from core.types import (
    ProviderVoiceConfig,
    SynthesisRequest,
    SynthesisResult,
    ValidationResult,
)
from providers.base import TTSProvider
from services.audio_buffer import AudioBufferStore


class PiperProvider(TTSProvider):
    provider_name = "piper"

    def __init__(self) -> None:
        self._buffer_store = AudioBufferStore()

    def validate_voice(self, config: ProviderVoiceConfig) -> ValidationResult:
        model_path = Path(config.model_path)
        config_path = Path(config.config_path)

        if not model_path.exists():
            return ValidationResult(False, reason="Piper model path does not exist")

        if not config_path.exists():
            return ValidationResult(False, reason="Piper config path does not exist")

        return ValidationResult(
            True,
            normalized_model_path=str(model_path),
            normalized_config_path=str(config_path),
        )

    def load_voice(self, config: ProviderVoiceConfig) -> PiperVoice:
        return PiperVoice.load(
            config.model_path,
            config_path=config.config_path,
        )

    def synthesize(self, loaded_voice: PiperVoice, request: SynthesisRequest) -> SynthesisResult:
        started_at = time.perf_counter()
        temp_path = self._buffer_store.create_temp_path(".wav")

        try:
            syn_config = SynthesisConfig(
                length_scale=request.config.length_scale,
                noise_scale=request.config.noise_scale,
                noise_w_scale=request.config.noise_w,
                normalize_audio=True,
            )

            with wave.open(temp_path, "wb") as wav_file:
                loaded_voice.synthesize_wav(
                    request.text,
                    wav_file,
                    syn_config=syn_config,
                )

            with open(temp_path, "rb") as audio_file:
                audio_bytes = audio_file.read()

            return SynthesisResult(
                audio_bytes=audio_bytes,
                audio_content_type="audio/wav",
                duration_ms=round((time.perf_counter() - started_at) * 1000),
                provider=self.provider_name,
                voice_id=request.config.voice_id,
            )
        finally:
            self._buffer_store.remove(temp_path)
```

- [ ] **Step 5: Criar `__init__.py` do modulo de providers**

```python
# apps/tts-server/providers/__init__.py
```

- [ ] **Step 6: Rodar compile Python nos novos modulos**

Run: `python -m py_compile apps/tts-server/providers/base.py apps/tts-server/providers/piper_provider.py apps/tts-server/core/registry.py apps/tts-server/core/voice_resolver.py`

Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add apps/tts-server/providers apps/tts-server/core/registry.py apps/tts-server/core/voice_resolver.py
git commit -m "refactor: add tts provider registry and piper provider"
```

### Task 3: Implementar engine, API e boot modular

**Files:**
- Create: `apps/tts-server/core/engine.py`
- Create: `apps/tts-server/api/__init__.py`
- Create: `apps/tts-server/api/errors.py`
- Create: `apps/tts-server/api/routes.py`
- Create: `apps/tts-server/api/schemas.py`
- Create: `apps/tts-server/main.py`
- Modify: `apps/tts-server/server.py`
- Modify: `apps/tts-server/errors.py`

- [ ] **Step 1: Criar engine de sintese**

```python
# apps/tts-server/core/engine.py
from core.registry import ProviderRegistry
from core.types import ProviderVoiceKey, SynthesisRequest
from core.voice_resolver import VoiceResolver
from services.voice_cache import VoiceCache


class TTSEngine:
    def __init__(
        self,
        registry: ProviderRegistry,
        resolver: VoiceResolver,
        cache: VoiceCache,
    ) -> None:
        self._registry = registry
        self._resolver = resolver
        self._cache = cache

    def preload(self, request: SynthesisRequest) -> None:
        self._get_or_load_voice(request)

    def synthesize(self, request: SynthesisRequest):
        provider = self._registry.get(request.config.provider)
        loaded_voice = self._get_or_load_voice(request)
        return provider.synthesize(loaded_voice, request)

    def _get_or_load_voice(self, request: SynthesisRequest):
        validation = self._resolver.validate(request.config)
        if not validation.valid:
            raise ValueError(validation.reason or "Invalid TTS voice")

        normalized_config = type(request.config)(
            voice_id=request.config.voice_id,
            provider=request.config.provider,
            model_path=validation.normalized_model_path or request.config.model_path,
            config_path=validation.normalized_config_path or request.config.config_path,
            length_scale=request.config.length_scale,
            noise_scale=request.config.noise_scale,
            noise_w=request.config.noise_w,
        )
        provider = self._registry.get(normalized_config.provider)
        key = ProviderVoiceKey(
            provider=normalized_config.provider,
            voice_id=normalized_config.voice_id,
            model_path=normalized_config.model_path,
            config_path=normalized_config.config_path,
        )

        loaded_voice = self._cache.get(key)
        if loaded_voice is None:
            loaded_voice = provider.load_voice(normalized_config)
            self._cache.set(key, loaded_voice)

        return loaded_voice
```

- [ ] **Step 2: Criar rotas e handlers de erro**

```python
# apps/tts-server/api/routes.py
from fastapi import APIRouter, Response

from core.config import build_config
from core.types import SynthesisRequest


def create_router(engine, cache, default_config):
    router = APIRouter()

    @router.get("/health")
    def health():
        return {
            "ok": True,
            "defaultVoiceId": default_config.voice_id,
            "defaultProvider": default_config.provider,
            "defaultModelPath": default_config.model_path,
            "defaultConfigPath": default_config.config_path,
            "cachedVoices": cache.snapshot(),
        }

    @router.post("/speak")
    def speak(body):
        config = build_config(
            provider=getattr(body, "provider", None),
            voice_id=body.voiceId,
            model_path=body.modelPath,
            config_path=body.configPath,
            length_scale=body.lengthScale,
            noise_scale=body.noiseScale,
            noise_w=body.noiseW,
        )
        result = engine.synthesize(
            SynthesisRequest(
                text=body.text,
                config=config,
            )
        )
        return Response(
            content=result.audio_bytes,
            media_type=result.audio_content_type,
        )

    return router
```

```python
# apps/tts-server/api/errors.py
from errors import register_exception_handlers
```

- [ ] **Step 3: Criar schema de request**

```python
# apps/tts-server/api/schemas.py
from typing import Optional

from pydantic import BaseModel


class SpeakRequest(BaseModel):
    text: str
    voiceId: Optional[str] = None
    provider: Optional[str] = None
    modelPath: Optional[str] = None
    configPath: Optional[str] = None
    lengthScale: float = 1.15
    noiseScale: float = 0.667
    noiseW: float = 0.8
```

- [ ] **Step 4: Criar `main.py` e reexport em `server.py`**

```python
# apps/tts-server/main.py
from fastapi import FastAPI

from api.routes import create_router
from core.config import build_config
from core.engine import TTSEngine
from core.registry import ProviderRegistry
from core.types import SynthesisRequest
from core.voice_resolver import VoiceResolver
from errors import register_exception_handlers
from providers.piper_provider import PiperProvider
from services.voice_cache import VoiceCache

app = FastAPI()
register_exception_handlers(app)

registry = ProviderRegistry()
registry.register(PiperProvider())

cache = VoiceCache()
resolver = VoiceResolver(registry)
engine = TTSEngine(registry, resolver, cache)
default_config = build_config()

try:
    engine.preload(
        SynthesisRequest(
            text="preload",
            config=default_config,
        )
    )
except Exception as error:
    print(
        {
            "module": "tts-server",
            "event": "voice-preload-failed",
            "provider": default_config.provider,
            "voiceId": default_config.voice_id,
            "modelPath": default_config.model_path,
            "configPath": default_config.config_path,
            "error": str(error),
        }
    )

app.include_router(create_router(engine, cache, default_config))
```

```python
# apps/tts-server/server.py
from main import app
```

- [ ] **Step 5: Criar `api/__init__.py` minimo**

```python
# apps/tts-server/api/__init__.py
```

- [ ] **Step 6: Rodar compile Python do servidor inteiro**

Run: `python -m py_compile apps/tts-server/main.py apps/tts-server/server.py apps/tts-server/api/routes.py apps/tts-server/api/schemas.py apps/tts-server/core/engine.py`

Expected: sem erros

- [ ] **Step 7: Commit**

```bash
git add apps/tts-server/main.py apps/tts-server/server.py apps/tts-server/api apps/tts-server/core/engine.py
git commit -m "refactor: modularize tts server boot and api"
```

### Task 4: Alinhar a integracao do backend Node com a nova estrutura

**Files:**
- Modify: `apps/api/src/modules/piper-tts/services.ts`
- Modify: `apps/api/src/scripts/start-tts-dev.ts`

- [ ] **Step 1: Revisar o cliente Node do TTS para manter compatibilidade de payload**

```ts
// apps/api/src/modules/piper-tts/services.ts
const response = await fetch(`${TTS_SERVER_URL}/speak`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(input.requestId
      ? {
          'x-request-id': input.requestId,
        }
      : {}),
  },
  body: JSON.stringify({
    text: input.text,
    voiceId: input.voiceId,
    provider: 'piper',
    modelPath: input.modelPath,
    configPath: input.configPath,
    lengthScale: input.lengthScale ?? 1.15,
    noiseScale: input.noiseScale ?? 0.667,
    noiseW: input.noiseW ?? 0.8,
  }),
});
```

- [ ] **Step 2: Revisar o boot script para continuar usando `server:app` sem mudar protocolo**

```ts
// apps/api/src/scripts/start-tts-dev.ts
const child = spawn(
  pythonPath,
  [
    '-m',
    'uvicorn',
    'server:app',
    '--host',
    '127.0.0.1',
    '--port',
    process.env.TTS_SERVER_PORT ?? '35422',
  ],
  {
    cwd: ttsServerDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      TTS_PROVIDER: 'piper',
      PIPER_VOICE_ID: activeVoice.id,
      PIPER_MODEL_PATH: activeVoice.modelPath,
      PIPER_CONFIG_PATH: activeVoice.configPath,
    },
  }
);
```

- [ ] **Step 3: Rodar build da API**

Run: `npm run build`
Workdir: `apps/api`
Expected: `tsc` finaliza com exit code 0

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/piper-tts/services.ts apps/api/src/scripts/start-tts-dev.ts
git commit -m "refactor: align api tts client with modular server"
```

### Task 5: Verificacao integrada do `tts-server`

**Files:**
- Modify: `docs/superpowers/specs/2026-07-03-tts-provider-architecture-design.md` (only if implementation decisions change)

- [ ] **Step 1: Verificar compile Python**

Run: `python -m py_compile apps/tts-server/main.py apps/tts-server/server.py apps/tts-server/api/*.py apps/tts-server/core/*.py apps/tts-server/providers/*.py apps/tts-server/services/*.py`

Expected: sem erros

- [ ] **Step 2: Verificar build da API**

Run: `npm run build`
Workdir: `apps/api`
Expected: `tsc` com exit code 0

- [ ] **Step 3: Verificar package do Electron**

Run: `npm run package`
Workdir: `apps/electron`
Expected: empacotamento concluido com sucesso

- [ ] **Step 4: Testar boot manual do TTS**

Run: `npm run dev`

Expected:
- `tts-server` sobe com a voz default
- preload failure nao derruba processo
- `/health` responde com `defaultProvider` e `cachedVoices`
- `POST /speak` continua retornando `audio/wav`

- [ ] **Step 5: Commit final**

```bash
git add apps/tts-server apps/api/src/modules/piper-tts apps/api/src/scripts/start-tts-dev.ts
git commit -m "refactor: modularize tts server providers"
```
