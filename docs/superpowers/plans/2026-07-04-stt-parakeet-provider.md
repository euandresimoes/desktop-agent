# STT Parakeet Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `parakeet` STT provider across `stt-server`, API, and frontend model download flows.

**Architecture:** Introduce a first-class `parakeet` provider alongside `faster-whisper` and `transformers`, with its own validation and runtime dependency boundary while reusing shared audio loading and general provider plumbing.

**Tech Stack:** Python FastAPI, Transformers, Torch, Electron, Vue, TypeScript

---

### Task 1: Add backend provider contract support

**Files:**
- Modify: `apps/api/src/modules/stt/types.ts`
- Modify: `apps/api/src/modules/stt/services.ts`
- Modify: `apps/stt-server/main.py`

- [ ] Add `parakeet` to STT provider unions and supported provider sets.
- [ ] Register the new provider in `stt-server` bootstrapping.
- [ ] Keep existing provider behavior unchanged for `faster-whisper` and `transformers`.

### Task 2: Implement Parakeet provider

**Files:**
- Create: `apps/stt-server/providers/parakeet_provider.py`
- Modify: `apps/stt-server/requirements.txt`

- [ ] Add provider-specific runtime imports and explicit dependency errors.
- [ ] Add bundle validation heuristics for Parakeet-compatible repositories.
- [ ] Implement model loading and transcription through the Transformers pipeline path tuned for Parakeet.
- [ ] Keep streaming disabled explicitly for this provider.

### Task 3: Teach API and downloader compatibility detection

**Files:**
- Modify: `apps/api/src/modules/stt/services.ts`
- Modify: `apps/api/src/modules/hub-downloads/services.ts`

- [ ] Detect Parakeet bundles separately from generic Transformers bundles.
- [ ] Return provider `parakeet` when repository files match Parakeet heuristics.
- [ ] Preserve current Faster-Whisper and Transformers compatibility behavior.

### Task 4: Expose Parakeet in frontend STT flows

**Files:**
- Modify: `apps/electron/src/shared/services/hubDownloadsService.ts`
- Modify: `apps/electron/src/shared/components/Downloader/AIModelDownloaderModal.vue`
- Modify: `apps/electron/src/views/voice-turn/services/settingsService.ts`

- [ ] Add `parakeet` to frontend provider typing.
- [ ] Show Parakeet compatibility badges and use provider `parakeet` on install.
- [ ] Keep existing STT UI behavior unchanged apart from the new provider option/detection.

### Task 5: Verify end-to-end behavior

**Files:**
- Verify existing and new flows

- [ ] Build `apps/api`
- [ ] Package or typecheck `apps/electron`
- [ ] Confirm no typing regressions from the new provider union
