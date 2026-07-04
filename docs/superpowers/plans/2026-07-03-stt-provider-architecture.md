# STT Provider Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o `apps/stt-server` para um processo FastAPI modular com providers `faster-whisper` e `transformers`, e alinhar o backend/frontend para salvar todo modelo STT em `storage/stt-models/...` com provider explícito.

**Architecture:** O `stt-server` passa a ter `core`, `providers`, `services` e `api` separados, com um `engine` central resolvendo o provider e cacheando modelos. O backend Node passa a registrar `provider` explícito nos modelos STT, instala bundles gerenciados no storage local e ajusta o downloader/frontend para refletir compatibilidade por provider.

**Tech Stack:** Python, FastAPI, faster-whisper, transformers, TypeScript, Node.js, Vue, Electron

---

### Task 1: Extrair o `stt-server` para módulos core/providers

**Files:**
- Create: `apps/stt-server/main.py`
- Create: `apps/stt-server/api/routes.py`
- Create: `apps/stt-server/api/schemas.py`
- Create: `apps/stt-server/core/config.py`
- Create: `apps/stt-server/core/types.py`
- Create: `apps/stt-server/core/registry.py`
- Create: `apps/stt-server/core/model_resolver.py`
- Create: `apps/stt-server/core/engine.py`
- Create: `apps/stt-server/providers/base.py`
- Create: `apps/stt-server/providers/faster_whisper_provider.py`
- Create: `apps/stt-server/providers/transformers_provider.py`
- Create: `apps/stt-server/services/model_cache.py`
- Create: `apps/stt-server/services/audio_loader.py`
- Modify: `apps/stt-server/server.py`
- Modify: `apps/stt-server/requirements.txt`

- [ ] **Step 1: Criar os tipos centrais do runtime STT**

```python
# apps/stt-server/core/types.py
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class ProviderModelConfig:
    model_id: str
    provider: str
    model_path: str
    device: str
    compute_type: str
    language: Optional[str]
    beam_size: int
    vad_filter: bool
    cpu_threads: int


@dataclass(frozen=True)
class ProviderModelKey:
    provider: str
    model_id: str
    model_path: str
    device: str
    compute_type: str
    cpu_threads: int


@dataclass(frozen=True)
class TranscriptionRequest:
    audio_path: str
    config: ProviderModelConfig


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: Optional[str]
    language_probability: Optional[float]
    duration_ms: int
    inference_duration_ms: int


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    reason: Optional[str] = None
    normalized_model_path: Optional[str] = None


LoadedProviderModel = Any
```

- [ ] **Step 2: Criar a interface base dos providers**

```python
# apps/stt-server/providers/base.py
from abc import ABC, abstractmethod

from core.types import (
    LoadedProviderModel,
    ProviderModelConfig,
    TranscriptionRequest,
    TranscriptionResult,
    ValidationResult,
)


class STTProvider(ABC):
    provider_name: str

    @abstractmethod
    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        raise NotImplementedError

    @abstractmethod
    def load_model(self, config: ProviderModelConfig) -> LoadedProviderModel:
        raise NotImplementedError

    @abstractmethod
    def transcribe(
        self, loaded_model: LoadedProviderModel, request: TranscriptionRequest
    ) -> TranscriptionResult:
        raise NotImplementedError
```

- [ ] **Step 3: Implementar registry, resolver e cache**

```python
# apps/stt-server/core/registry.py
from providers.base import STTProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, STTProvider] = {}

    def register(self, provider: STTProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get(self, provider_name: str) -> STTProvider:
        provider = self._providers.get(provider_name)

        if provider is None:
            raise ValueError(f'Unsupported STT provider: {provider_name}')

        return provider

    def list_names(self) -> list[str]:
        return sorted(self._providers.keys())
```

```python
# apps/stt-server/services/model_cache.py
import threading

from core.types import LoadedProviderModel, ProviderModelKey


class ModelCache:
    def __init__(self) -> None:
        self._models: dict[ProviderModelKey, LoadedProviderModel] = {}
        self._lock = threading.Lock()

    def get(self, key: ProviderModelKey) -> LoadedProviderModel | None:
        return self._models.get(key)

    def set(self, key: ProviderModelKey, model: LoadedProviderModel) -> None:
        with self._lock:
            self._models[key] = model

    def snapshot(self) -> list[dict[str, str]]:
        return [
            {
                'provider': key.provider,
                'modelId': key.model_id,
                'modelPath': key.model_path,
                'device': key.device,
                'computeType': key.compute_type,
            }
            for key in self._models.keys()
        ]
```

- [ ] **Step 4: Implementar os providers `faster-whisper` e `transformers`**

```python
# apps/stt-server/providers/faster_whisper_provider.py
import time

from faster_whisper import WhisperModel

from core.types import ProviderModelConfig, TranscriptionRequest, TranscriptionResult, ValidationResult
from providers.base import STTProvider


class FasterWhisperProvider(STTProvider):
    provider_name = 'faster-whisper'

    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        return ValidationResult(valid=True, normalized_model_path=config.model_path)

    def load_model(self, config: ProviderModelConfig) -> WhisperModel:
        return WhisperModel(
            config.model_path,
            device=config.device,
            compute_type=config.compute_type,
            cpu_threads=config.cpu_threads,
        )

    def transcribe(self, loaded_model: WhisperModel, request: TranscriptionRequest) -> TranscriptionResult:
        started_at = time.perf_counter()
        segments, info = loaded_model.transcribe(
            request.audio_path,
            language=request.config.language,
            beam_size=request.config.beam_size,
            vad_filter=request.config.vad_filter,
        )
        text = ' '.join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        return TranscriptionResult(
            text=text,
            language=info.language,
            language_probability=info.language_probability,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )
```

```python
# apps/stt-server/providers/transformers_provider.py
import time

import torch
from transformers import pipeline

from core.types import ProviderModelConfig, TranscriptionRequest, TranscriptionResult, ValidationResult
from providers.base import STTProvider


class TransformersProvider(STTProvider):
    provider_name = 'transformers'

    def validate_model(self, config: ProviderModelConfig) -> ValidationResult:
        return ValidationResult(valid=True, normalized_model_path=config.model_path)

    def load_model(self, config: ProviderModelConfig):
        device = 0 if config.device == 'cuda' and torch.cuda.is_available() else -1
        return pipeline(
            task='automatic-speech-recognition',
            model=config.model_path,
            tokenizer=config.model_path,
            feature_extractor=config.model_path,
            device=device,
        )

    def transcribe(self, loaded_model, request: TranscriptionRequest) -> TranscriptionResult:
        started_at = time.perf_counter()
        result = loaded_model(request.audio_path)
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        return TranscriptionResult(
            text=str(result.get('text', '')).strip(),
            language=request.config.language,
            language_probability=None,
            duration_ms=duration_ms,
            inference_duration_ms=duration_ms,
        )
```

- [ ] **Step 5: Implementar o engine e a nova API FastAPI**

```python
# apps/stt-server/core/engine.py
from core.registry import ProviderRegistry
from core.types import ProviderModelConfig, ProviderModelKey, TranscriptionRequest
from services.model_cache import ModelCache


class STTEngine:
    def __init__(self, registry: ProviderRegistry, cache: ModelCache) -> None:
        self._registry = registry
        self._cache = cache

    def transcribe(self, request: TranscriptionRequest):
        provider = self._registry.get(request.config.provider)
        validation = provider.validate_model(request.config)

        if not validation.valid:
            raise ValueError(validation.reason or 'Invalid STT model')

        key = ProviderModelKey(
            provider=request.config.provider,
            model_id=request.config.model_id,
            model_path=validation.normalized_model_path or request.config.model_path,
            device=request.config.device,
            compute_type=request.config.compute_type,
            cpu_threads=request.config.cpu_threads,
        )

        loaded_model = self._cache.get(key)

        if loaded_model is None:
            loaded_model = provider.load_model(request.config)
            self._cache.set(key, loaded_model)

        return provider.transcribe(loaded_model, request)
```

- [ ] **Step 6: Rodar o servidor Python e verificar importação da nova arquitetura**

Run: `python -m compileall apps/stt-server`
Expected: compile sem erros para `main.py`, `core`, `providers`, `services` e `api`

- [ ] **Step 7: Commit**

```bash
git add apps/stt-server apps/api/src/modules/stt apps/api/src/scripts/start-stt-dev.ts
git commit -m "refactor: modularize stt server providers"
```

### Task 2: Alinhar o backend Node para provider explícito e storage gerenciado

**Files:**
- Modify: `apps/api/src/modules/stt/types.ts`
- Modify: `apps/api/src/modules/stt/services.ts`
- Modify: `apps/api/src/modules/stt/routes.ts`
- Modify: `apps/api/src/modules/hub-downloads/services.ts`
- Modify: `apps/api/src/scripts/start-stt-dev.ts`

- [ ] **Step 1: Adicionar `provider` ao tipo de modelo STT**

```ts
// apps/api/src/modules/stt/types.ts
export type STTProvider = 'faster-whisper' | 'transformers';

export type STTModelConfig = {
  id: string;
  name: string;
  provider: STTProvider;
  modelSource: STTModelSource;
  modelPath: string;
  device: STTDevice;
  computeType: STTComputeType;
  language?: string;
  beamSize: number;
  vadFilter: boolean;
};
```

- [ ] **Step 2: Garantir que o serviço STT sempre normalize e grave a pasta local gerenciada**

```ts
// apps/api/src/modules/stt/services.ts
private getManagedPaths(modelId: string) {
  const normalizedModelId = this.normalizeId(modelId);
  const targetDir = path.join(sttModelsDir, normalizedModelId);

  return {
    modelId: normalizedModelId,
    targetDir,
  };
}
```

- [ ] **Step 3: Fazer `addModel`, `addLocalModelFromTemp` e `updateModel` exigirem provider**

```ts
const model: STTModelConfig = {
  id: modelId,
  name: input.name,
  provider: input.provider,
  modelSource: input.modelSource ?? 'local',
  modelPath: normalizedManagedPath,
  device: input.device ?? 'cpu',
  computeType: input.computeType ?? 'int8',
  language: input.language ?? 'pt',
  beamSize: input.beamSize ?? 1,
  vadFilter: input.vadFilter ?? true,
};
```

- [ ] **Step 4: Passar `STT_PROVIDER` no script de boot do servidor**

```ts
// apps/api/src/scripts/start-stt-dev.ts
env: {
  ...process.env,
  STT_PROVIDER: activeModel.provider,
  STT_MODEL_PATH: activeModel.modelPath,
}
```

- [ ] **Step 5: Adaptar o instalador do Hugging Face para salvar snapshots locais em `storage/stt-models/...`**

```ts
// apps/api/src/modules/hub-downloads/services.ts
const provider = detectedProvider;
const registeredModel = await sttService.addLocalModelFromTemp({
  id: modelId,
  name: input.displayName,
  provider,
  modelTempPath: localBundleRoot,
});
```

- [ ] **Step 6: Rodar build do backend Node**

Run: `npm run build`
Workdir: `apps/api`
Expected: `tsc` finaliza com exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/stt apps/api/src/modules/hub-downloads apps/api/src/scripts/start-stt-dev.ts
git commit -m "feat: persist stt provider metadata"
```

### Task 3: Ajustar compatibilidade e UX do frontend para providers STT

**Files:**
- Modify: `apps/electron/src/shared/services/hubDownloadsService.ts`
- Modify: `apps/electron/src/shared/components/Downloader/AIModelDownloaderModal.vue`
- Modify: `apps/electron/src/views/voice-turn/components/SettingsModal.vue`

- [ ] **Step 1: Expor compatibilidade STT por provider no serviço do downloader**

```ts
// apps/electron/src/shared/services/hubDownloadsService.ts
export type HubSttCompatibility =
  | { compatible: false; provider: null }
  | { compatible: true; provider: 'faster-whisper' | 'transformers' };
```

- [ ] **Step 2: Atualizar a UI de arquivos STT para mostrar provider compatível**

```vue
<!-- apps/electron/src/shared/components/Downloader/AIModelDownloaderModal.vue -->
<span
  v-if="props.modelType === 'stt' && row.isCompatible"
  class="compatibility-badge tone-compatible file-name-badge"
>
  {{ row.statusLabel }}
</span>
```

- [ ] **Step 3: Ajustar a tela de settings de STT para exibir provider e caminho gerenciado**

```vue
<!-- apps/electron/src/views/voice-turn/components/SettingsModal.vue -->
<BaseSettingsRow>
  <template #copy>
    <strong>Provider</strong>
    <span>Runtime used to load and transcribe with this STT model.</span>
  </template>
  <template #control>
    <div class="narrow readonly-value">{{ currentStt.provider }}</div>
  </template>
</BaseSettingsRow>
```

- [ ] **Step 4: Rodar package do Electron**

Run: `npm run package`
Workdir: `apps/electron`
Expected: Electron Forge finaliza com exit code 0

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/shared/services/hubDownloadsService.ts apps/electron/src/shared/components/Downloader/AIModelDownloaderModal.vue apps/electron/src/views/voice-turn/components/SettingsModal.vue
git commit -m "feat: surface stt provider compatibility in ui"
```

### Task 4: Verificação integrada do fluxo STT

**Files:**
- Modify: `docs/superpowers/specs/2026-07-03-stt-provider-architecture-design.md` (only if implementation decisions change)

- [ ] **Step 1: Verificar que o root repo está limpo antes dos testes integrados**

Run: `git status --short`
Expected: sem alterações inesperadas além das do plano em execução

- [ ] **Step 2: Verificar build do backend**

Run: `npm run build`
Workdir: `apps/api`
Expected: `tsc` com exit code 0

- [ ] **Step 3: Verificar package do Electron**

Run: `npm run package`
Workdir: `apps/electron`
Expected: empacotamento concluído com sucesso

- [ ] **Step 4: Testar manualmente o cenário alvo**

Run:

```bash
npm run dev
```

Expected:
- servidor STT sobe mesmo se preload de modelo falhar
- modelos STT mostram provider explícito
- downloader só oferece bundles compatíveis
- abrir pasta do modelo STT aponta para `storage/stt-models/...`

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: implement modular stt providers"
```
