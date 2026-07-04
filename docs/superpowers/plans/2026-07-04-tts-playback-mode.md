# TTS Playback Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma preferência global de modo de reprodução TTS (`standard` ou `stream`) com capacidades publicadas pelo backend e seleção segura no frontend.

**Architecture:** O frontend persistirá `ttsPlaybackMode` em `AppSettings`, consultará capacidades do TTS ativo via API e resolverá o fluxo efetivo em `voiceTurnService`. A API será a fronteira de verdade para capacidades do provider, enquanto o `tts-server` só informa o que o provider suporta.

**Tech Stack:** Vue 3, TypeScript, Electron IPC, Fastify, Python, FastAPI, WebSocket

---

### Task 1: Modelar a preferência global de playback mode no Electron

**Files:**
- Modify: `apps/electron/src/shared/types/app-settings.ts`
- Modify: `apps/electron/src/shared/services/appSettingsService.ts`
- Test: `apps/electron/src/shared/services/appSettingsService.playback-mode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {
  DEFAULT_APP_SETTINGS,
  APP_TTS_PLAYBACK_MODES,
  isAppTtsPlaybackMode,
} from "../types/app-settings";

assert.deepEqual(APP_TTS_PLAYBACK_MODES, ["standard", "stream"]);
assert.equal(DEFAULT_APP_SETTINGS.ttsPlaybackMode, "standard");
assert.equal(isAppTtsPlaybackMode("standard"), true);
assert.equal(isAppTtsPlaybackMode("stream"), true);
assert.equal(isAppTtsPlaybackMode("invalid"), false);

console.log("app settings playback mode runtime checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/shared/services/appSettingsService.playback-mode.test.ts`
Workdir: `apps/electron`
Expected: FAIL com erro de export ausente para `APP_TTS_PLAYBACK_MODES`, `isAppTtsPlaybackMode` ou `ttsPlaybackMode`

- [ ] **Step 3: Write minimal implementation**

```ts
export const APP_TTS_PLAYBACK_MODES = ["standard", "stream"] as const;
export type AppTtsPlaybackMode = (typeof APP_TTS_PLAYBACK_MODES)[number];

export interface AppSettings {
  // ...
  ttsPlaybackMode: AppTtsPlaybackMode;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // ...
  ttsPlaybackMode: "standard",
};

export const isAppTtsPlaybackMode = (
  value: unknown,
): value is AppTtsPlaybackMode =>
  typeof value === "string" &&
  APP_TTS_PLAYBACK_MODES.includes(value as AppTtsPlaybackMode);
```

- [ ] **Step 4: Normalize persisted settings in the service**

```ts
let ttsPlaybackMode = DEFAULT_APP_SETTINGS.ttsPlaybackMode;

if (isAppTtsPlaybackMode(patch?.ttsPlaybackMode)) {
  ttsPlaybackMode = patch.ttsPlaybackMode;
}

return {
  ...DEFAULT_APP_SETTINGS,
  ...patch,
  themeId,
  accentMode,
  accentColor,
  ttsPlaybackMode,
} satisfies AppSettings;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types src/shared/services/appSettingsService.playback-mode.test.ts`
Workdir: `apps/electron`
Expected: PASS com `app settings playback mode runtime checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/shared/types/app-settings.ts apps/electron/src/shared/services/appSettingsService.ts apps/electron/src/shared/services/appSettingsService.playback-mode.test.ts
git commit -m "feat: add global tts playback mode setting"
```

### Task 2: Publicar capacidades TTS na API

**Files:**
- Create: `apps/api/src/modules/piper-tts/capabilities.ts`
- Modify: `apps/api/src/modules/piper-tts/routes.ts`
- Test: `apps/api/src/dev-tests/tts-capabilities-runtime.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { getTTSCapabilities } from "../modules/piper-tts/capabilities.ts";

const capabilities = getTTSCapabilities({
  provider: "piper",
  supportsChunkedPostSynthesis: true,
});

assert.equal(capabilities.provider, "piper");
assert.equal(capabilities.playbackModes.standard.supported, true);
assert.equal(capabilities.playbackModes.standard.recommended, true);
assert.equal(capabilities.playbackModes.stream.supported, true);
assert.equal(capabilities.playbackModes.stream.experimental, true);
assert.equal(
  capabilities.playbackModes.stream.kind,
  "post_synthesis_chunked",
);

console.log("tts capabilities runtime checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ts-node-esm src/dev-tests/tts-capabilities-runtime.ts`
Workdir: `apps/api`
Expected: FAIL com import ausente de `capabilities.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
export type TTSCapabilitiesResponse = {
  provider: string;
  playbackModes: {
    standard: {
      supported: boolean;
      recommended: boolean;
    };
    stream: {
      supported: boolean;
      recommended: boolean;
      experimental: boolean;
      kind: "realtime" | "post_synthesis_chunked" | "unsupported";
    };
  };
};

export function getTTSCapabilities(input: {
  provider: string;
  supportsChunkedPostSynthesis: boolean;
}): TTSCapabilitiesResponse {
  return {
    provider: input.provider,
    playbackModes: {
      standard: {
        supported: true,
        recommended: true,
      },
      stream: {
        supported: input.supportsChunkedPostSynthesis,
        recommended: false,
        experimental: input.supportsChunkedPostSynthesis,
        kind: input.supportsChunkedPostSynthesis
          ? "post_synthesis_chunked"
          : "unsupported",
      },
    },
  };
}
```

- [ ] **Step 4: Expose the route**

```ts
app.get("/capabilities", async () => {
  return getTTSCapabilities({
    provider: "piper",
    supportsChunkedPostSynthesis: true,
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ts-node-esm src/dev-tests/tts-capabilities-runtime.ts`
Workdir: `apps/api`
Expected: PASS com `tts capabilities runtime checks passed`

- [ ] **Step 6: Run build**

Run: `npm run build`
Workdir: `apps/api`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/piper-tts/capabilities.ts apps/api/src/modules/piper-tts/routes.ts apps/api/src/dev-tests/tts-capabilities-runtime.ts
git commit -m "feat: expose tts playback capabilities"
```

### Task 3: Criar serviço frontend para consultar capacidades TTS

**Files:**
- Create: `apps/electron/src/shared/services/ttsCapabilitiesService.ts`
- Test: `apps/electron/src/shared/services/ttsCapabilitiesService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { mapTTSCapabilitiesToModeOptions } from "./ttsCapabilitiesService.ts";

const options = mapTTSCapabilitiesToModeOptions({
  provider: "piper",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: true,
      recommended: false,
      experimental: true,
      kind: "post_synthesis_chunked",
    },
  },
});

assert.equal(options.length, 2);
assert.equal(options[0]?.value, "standard");
assert.equal(options[1]?.label, "Streaming (Experimental)");

console.log("tts capabilities frontend runtime checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/shared/services/ttsCapabilitiesService.test.ts`
Workdir: `apps/electron`
Expected: FAIL com import ausente

- [ ] **Step 3: Write minimal implementation**

```ts
export type TTSPlaybackMode = "standard" | "stream";

export type TTSCapabilitiesResponse = {
  provider: string;
  playbackModes: {
    standard: {
      supported: boolean;
      recommended: boolean;
    };
    stream: {
      supported: boolean;
      recommended: boolean;
      experimental: boolean;
      kind: "realtime" | "post_synthesis_chunked" | "unsupported";
    };
  };
};

export function mapTTSCapabilitiesToModeOptions(
  capabilities: TTSCapabilitiesResponse,
) {
  const options = [];

  if (capabilities.playbackModes.standard.supported) {
    options.push({ value: "standard", label: "Standard" });
  }

  if (capabilities.playbackModes.stream.supported) {
    options.push({
      value: "stream",
      label: capabilities.playbackModes.stream.experimental
        ? "Streaming (Experimental)"
        : "Streaming",
    });
  }

  return options;
}

export async function fetchTTSCapabilities() {
  const response = await fetch("http://localhost:35421/api/v1/tts/capabilities");
  if (!response.ok) {
    throw new Error("Failed to load TTS capabilities");
  }
  return (await response.json()) as TTSCapabilitiesResponse;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/shared/services/ttsCapabilitiesService.test.ts`
Workdir: `apps/electron`
Expected: PASS com `tts capabilities frontend runtime checks passed`

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/shared/services/ttsCapabilitiesService.ts apps/electron/src/shared/services/ttsCapabilitiesService.test.ts
git commit -m "feat: add frontend tts capabilities service"
```

### Task 4: Adicionar o seletor de playback mode no App Settings

**Files:**
- Modify: `apps/electron/src/views/app-settings/AppSettingsModal.vue`
- Modify: `apps/electron/src/shared/types/app-settings.ts`
- Test: `apps/electron/src/shared/services/ttsCapabilitiesService.test.ts`

- [ ] **Step 1: Add the new select options in the settings modal**

```ts
import {
  fetchTTSCapabilities,
  mapTTSCapabilitiesToModeOptions,
  type TTSCapabilitiesResponse,
} from "../../shared/services/ttsCapabilitiesService";

const ttsCapabilities = ref<TTSCapabilitiesResponse | null>(null);

const ttsPlaybackModeOptions = computed<BaseSelectOption[]>(() => {
  if (!ttsCapabilities.value) {
    return [{ value: "standard", label: "Standard" }];
  }

  return mapTTSCapabilitiesToModeOptions(ttsCapabilities.value);
});

const refreshTTSCapabilities = async () => {
  try {
    ttsCapabilities.value = await fetchTTSCapabilities();
  } catch {
    ttsCapabilities.value = null;
  }
};
```

- [ ] **Step 2: Load capabilities when the modal opens**

```ts
if (isOpen) {
  void loadSettings().then(() => {
    syncDraftsFromSettings();
  });
  void refreshAudioDevices();
  void refreshTTSCapabilities();
  navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioDevices);
  return;
}
```

- [ ] **Step 3: Render the new row in the Audio tab**

```vue
<BaseSettingsRow>
  <template #copy>
    <strong>TTS playback mode</strong>
    <span>
      {{
        ttsCapabilities?.playbackModes.stream.experimental
          ? "Choose between standard playback and an experimental streamed delivery mode."
          : "Choose whether spoken responses should play after full synthesis or as streamed chunks."
      }}
    </span>
  </template>
  <template #control>
    <BaseSelect
      :model-value="settings.ttsPlaybackMode"
      :options="ttsPlaybackModeOptions"
      @update:modelValue="(value) => updateSettings({ ttsPlaybackMode: value as AppSettings['ttsPlaybackMode'] })"
    />
  </template>
</BaseSettingsRow>
```

- [ ] **Step 4: Manually verify conservative fallback**

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

Check:
- sem capabilities carregadas, o select mostra `Standard`
- com Piper, a opção `Streaming (Experimental)` aparece se suportada pelo backend

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/views/app-settings/AppSettingsModal.vue apps/electron/src/shared/types/app-settings.ts
git commit -m "feat: add tts playback mode control to app settings"
```

### Task 5: Resolver o modo efetivo no voice turn runtime

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Modify: `apps/electron/src/shared/services/ttsCapabilitiesService.ts`
- Test: `apps/electron/src/shared/utils/tts-stream-player.test.ts`
- Test: `apps/electron/src/views/voice-turn/services/voiceTurnService.playback-mode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { resolveTTSPlaybackMode } from "./voiceTurnService.ts";

const standard = resolveTTSPlaybackMode("standard", {
  provider: "piper",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: true,
      recommended: false,
      experimental: true,
      kind: "post_synthesis_chunked",
    },
  },
});

assert.equal(standard, "standard");

const streamed = resolveTTSPlaybackMode("stream", {
  provider: "piper",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: true,
      recommended: false,
      experimental: true,
      kind: "post_synthesis_chunked",
    },
  },
});

assert.equal(streamed, "stream");

console.log("voice turn playback mode runtime checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/views/voice-turn/services/voiceTurnService.playback-mode.test.ts`
Workdir: `apps/electron`
Expected: FAIL com export ausente

- [ ] **Step 3: Add the resolver**

```ts
export function resolveTTSPlaybackMode(
  preferredMode: "standard" | "stream",
  capabilities: TTSCapabilitiesResponse | null,
) {
  if (!capabilities) {
    return "standard";
  }

  if (preferredMode === "stream" && capabilities.playbackModes.stream.supported) {
    return "stream";
  }

  return "standard";
}
```

- [ ] **Step 4: Branch runtime execution**

```ts
const effectivePlaybackMode = resolveTTSPlaybackMode(
  settings.value.ttsPlaybackMode,
  ttsCapabilities.value,
);

if (effectivePlaybackMode === "stream") {
  // open websocket flow
} else {
  // keep current response payload flow
}
```

- [ ] **Step 5: Run tests**

Run: `node --experimental-strip-types src/views/voice-turn/services/voiceTurnService.playback-mode.test.ts`
Workdir: `apps/electron`
Expected: PASS com `voice turn playback mode runtime checks passed`

Run: `node --experimental-strip-types src/shared/utils/tts-stream-player.test.ts`
Workdir: `apps/electron`
Expected: PASS

- [ ] **Step 6: Run package**

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/views/voice-turn/services/voiceTurnService.ts apps/electron/src/shared/services/ttsCapabilitiesService.ts apps/electron/src/views/voice-turn/services/voiceTurnService.playback-mode.test.ts
git commit -m "feat: route voice turn through selected tts playback mode"
```

### Task 6: Normalizar preferências inválidas quando capacidades mudarem

**Files:**
- Modify: `apps/electron/src/shared/services/appSettingsService.ts`
- Modify: `apps/electron/src/views/app-settings/AppSettingsModal.vue`
- Modify: `apps/electron/src/shared/services/ttsCapabilitiesService.ts`
- Test: `apps/electron/src/shared/services/appSettingsService.playback-mode-normalization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { normalizePlaybackModeAgainstCapabilities } from "./ttsCapabilitiesService.ts";

const normalized = normalizePlaybackModeAgainstCapabilities("stream", {
  provider: "future-provider",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: false,
      recommended: false,
      experimental: false,
      kind: "unsupported",
    },
  },
});

assert.equal(normalized, "standard");
console.log("tts playback normalization runtime checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/shared/services/appSettingsService.playback-mode-normalization.test.ts`
Workdir: `apps/electron`
Expected: FAIL com export ausente

- [ ] **Step 3: Add normalization helper**

```ts
export function normalizePlaybackModeAgainstCapabilities(
  preferredMode: "standard" | "stream",
  capabilities: TTSCapabilitiesResponse | null,
) {
  if (!capabilities) {
    return "standard";
  }

  if (preferredMode === "stream" && !capabilities.playbackModes.stream.supported) {
    return "standard";
  }

  return preferredMode;
}
```

- [ ] **Step 4: Persist normalized fallback**

```ts
const normalizedMode = normalizePlaybackModeAgainstCapabilities(
  settings.value.ttsPlaybackMode,
  ttsCapabilities.value,
);

if (normalizedMode !== settings.value.ttsPlaybackMode) {
  void updateSettings({ ttsPlaybackMode: normalizedMode });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types src/shared/services/appSettingsService.playback-mode-normalization.test.ts`
Workdir: `apps/electron`
Expected: PASS com `tts playback normalization runtime checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/shared/services/appSettingsService.ts apps/electron/src/views/app-settings/AppSettingsModal.vue apps/electron/src/shared/services/ttsCapabilitiesService.ts apps/electron/src/shared/services/appSettingsService.playback-mode-normalization.test.ts
git commit -m "feat: normalize invalid tts playback mode preferences"
```

### Task 7: Verificação integrada e documentação final

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-tts-playback-mode-design.md` (only if implementation decisions change)

- [ ] **Step 1: Verify API build**

Run: `npm run build`
Workdir: `apps/api`
Expected: exit code 0

- [ ] **Step 2: Verify Electron package**

Run: `npm run package`
Workdir: `apps/electron`
Expected: exit code 0

- [ ] **Step 3: Manual UX validation**

Run: `npm run dev`
Workdir: `apps/api`
Expected:
- API sobe normalmente
- `GET /api/v1/tts/capabilities` retorna capacidades coerentes com Piper
- App Settings mostra `TTS playback mode`
- `standard` continua funcionando como hoje
- `stream` só aparece quando suportado

- [ ] **Step 4: Commit final**

```bash
git add apps/api apps/electron docs/superpowers/specs/2026-07-04-tts-playback-mode-design.md
git commit -m "feat: add configurable tts playback modes"
```
