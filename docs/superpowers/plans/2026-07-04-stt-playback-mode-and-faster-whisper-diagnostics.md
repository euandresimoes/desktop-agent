# STT Playback Mode And Faster-Whisper Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make STT run in `standard` mode by default, keep `stream` optional, and add focused diagnostics to expose the faster-whisper latency bottleneck.

**Architecture:** Extend app settings with a dedicated STT playback mode, branch the voice-turn frontend flow on that setting, and add low-noise timing logs around STT streaming and end-to-end voice-turn phases. Preserve the existing streaming path, but stop making it the default experience.

**Tech Stack:** Vue 3, TypeScript, Fastify, Python STT server, existing app settings and capability services

---

### Task 1: Add STT playback mode to app settings

**Files:**
- Modify: `apps/electron/src/shared/types/app-settings.ts`
- Modify: `apps/electron/src/shared/services/appSettingsService.ts`
- Test: `apps/electron/src/shared/services/appSettingsService.playback-mode.test.ts`

- [ ] Add `APP_STT_PLAYBACK_MODES`, `AppSttPlaybackMode`, `sttPlaybackMode`, and `isAppSttPlaybackMode`.
- [ ] Set the default STT mode to `standard`.
- [ ] Persist and merge the new value in `appSettingsService`.
- [ ] Add a runtime test that proves `standard` is the default and `stream` is recognized.

### Task 2: Add STT mode normalization/capability mapping helpers

**Files:**
- Create: `apps/electron/src/shared/services/sttPlaybackModeService.ts`
- Test: `apps/electron/src/shared/services/sttPlaybackModeService.test.ts`

- [ ] Add a helper that normalizes the preferred STT mode against active capabilities.
- [ ] Return `standard` whenever streaming is unsupported.
- [ ] Cover both supported and unsupported cases in a lightweight runtime test.

### Task 3: Expose STT mode in App Settings

**Files:**
- Modify: `apps/electron/src/views/app-settings/AppSettingsModal.vue`

- [ ] Add a `BaseSelect` row for “STT recognition mode”.
- [ ] Use copy that describes `standard` as the stable default and `stream` as optional live caption behavior.
- [ ] Normalize stored value after fetching STT capabilities, mirroring the TTS settings pattern.

### Task 4: Branch the voice-turn flow by STT mode

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`

- [ ] Prevent STT streaming websocket startup when `sttPlaybackMode !== "stream"`.
- [ ] Keep the existing standard post-recording request flow intact.
- [ ] Keep streaming as an optional path only when the setting is `stream` and the provider supports it.
- [ ] Preserve current TTS playback behavior independent from STT mode.

### Task 5: Add frontend latency diagnostics

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`

- [ ] Add timestamp markers for recording start, recording stop, request start, response arrival, first streamed text, first streamed audio, and playback start.
- [ ] Log which STT mode was active for each voice turn.
- [ ] Keep logs structured and concise so manual debugging remains readable.

### Task 6: Add backend assistant diagnostics

**Files:**
- Modify: `apps/api/src/modules/assistant/services.ts`
- Modify: `apps/api/src/modules/assistant/routes.ts`

- [ ] Log whether a voice turn used transcript override or full backend STT.
- [ ] Log server-side phase timings in a structured way for easier comparison with frontend wall-clock logs.
- [ ] Keep response payloads unchanged unless already required by previous work.

### Task 7: Verify faster-whisper standard vs streaming behavior

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts` (only if needed for clearer log labels)

- [ ] Make sure logs distinguish `standard` and `stream` STT runs clearly.
- [ ] Confirm that `standard` mode never opens STT streaming websocket.
- [ ] Confirm that `stream` mode still can open it when provider supports it.

### Task 8: Validation

**Files:**
- Verify only

- [ ] Run API build.
- [ ] Run Electron package/build validation.
- [ ] Run Python compile validation for touched STT server files if any changed.
- [ ] Manually confirm there are no type or packaging regressions.
