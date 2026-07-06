# STT Playback Mode And Faster-Whisper Diagnostics Design

## Goal

Restore a stable default voice-turn experience by making STT run in `standard` mode by default, while keeping the newer streaming STT path as an optional manual mode and adding enough diagnostics to explain the current faster-whisper latency anomaly.

## Context

After introducing STT streaming and TTS streaming, the perceived end-to-end latency increased significantly for some setups, especially when using the `faster-whisper` provider. Real stopwatch measurements are materially higher than the UI metrics, and the previous faster standard flow felt much faster and more predictable.

Two distinct needs exist:

1. Product need: users should get the stable, low-risk path by default.
2. Engineering need: we must isolate why `faster-whisper` is now much slower than expected in this architecture.

## Requirements

### Functional

- Add a global STT mode setting with two values:
  - `standard`
  - `stream`
- Default value must be `standard`.
- Users must be able to change STT mode manually in app settings.
- In `standard` mode:
  - do not open the STT streaming websocket
  - do not send live STT chunks
  - use the stable final transcription flow only
- In `stream` mode:
  - keep the current STT streaming path available
  - only enable it when the active provider reports streaming support
- TTS playback behavior remains independent from STT mode.

### UX

- App settings must expose STT mode in the Audio section beside the existing TTS playback mode.
- The UI copy should clearly present `stream` as optional/advanced behavior, not the default expected path.
- If streaming is not supported by the active STT provider, the mode should gracefully normalize back to `standard`.

### Diagnostics

- Add explicit timing instrumentation for the voice-turn path so we can distinguish:
  - recording duration
  - wait-for-silence duration
  - STT websocket lifetime
  - `/assistant/voice-turn` or `/assistant/voice-turn/prepare` request duration
  - backend STT duration
  - backend LLM duration
  - backend TTS duration
  - time until first TTS streamed text event
  - time until first TTS streamed audio chunk
- Include which STT mode was active in logs/telemetry.
- Make it obvious when the system is using:
  - standard STT only
  - streaming STT with transcript override
  - streaming STT for UX only, with final backend transcription still used

## Recommended Approach

### Approach A: Full rollback of STT streaming

Remove the streaming path entirely until faster-whisper is solved.

Pros:
- simplest behavior
- least runtime complexity

Cons:
- throws away the UX groundwork
- no path for users who still want experimental streaming

### Approach B: Dual-mode architecture with `standard` default

Keep both flows, but make `standard` the default and only use STT streaming when the user explicitly enables it.

Pros:
- restores stable behavior now
- preserves experimental path for future tuning
- aligns with the TTS playback-mode architecture already in the app

Cons:
- requires maintaining two STT paths
- needs careful mode normalization

### Approach C: Always stream, but optimize harder

Keep streaming as the default and continue tuning faster-whisper until it matches the old path.

Pros:
- one long-term code path

Cons:
- forces all users through an unstable path
- does not solve the immediate regression risk

### Recommendation

Use Approach B.

It matches the existing product pattern for TTS, restores a reliable default immediately, and gives us a safe place to investigate faster-whisper streaming without penalizing all users.

## Architecture

### Frontend settings

- Extend app settings types with `sttPlaybackMode`.
- Normalize STT mode against active provider capabilities, similar to TTS.
- Expose selectable STT mode options in `AppSettingsModal.vue`.

### Voice-turn runtime

- `standard` mode:
  - microphone recording behaves normally
  - stop recording
  - send full audio to backend STT path only
  - no STT streaming socket is created
- `stream` mode:
  - existing STT streaming client can run
  - partial captions remain optional UI feedback
  - final backend request path must clearly log whether transcript override was used

### Diagnostics boundary

- Frontend logs should measure wall-clock milestones.
- Backend logs should measure server-side phase durations.
- The two should be comparable, so perceived delays can be explained instead of guessed.

## Data Flow

### Standard mode

1. User speaks.
2. Recorder gathers audio locally.
3. Silence threshold ends capture.
4. Audio is uploaded once.
5. Backend runs STT -> LLM -> TTS.
6. Response plays normally or through existing TTS playback mode.

### Streaming mode

1. User speaks.
2. Recorder sends PCM chunks to STT websocket.
3. UI may show partial transcript updates.
4. Final assistant request still executes afterward.
5. Diagnostics must record whether stream output affected the final request.

## Error Handling

- Invalid or unsupported STT streaming mode should normalize to `standard`.
- If streaming socket setup fails while mode is `stream`, fallback should not block the main voice turn.
- Any diagnostics failure must never break the user flow.

## Testing Strategy

- Runtime tests for new STT playback-mode type guards and defaults.
- Normalization tests for STT mode against capabilities.
- Voice-turn behavior verification:
  - `standard` mode does not create STT streaming client
  - `stream` mode only starts streaming when capability says supported
- Build/package validation for API and Electron.

## Success Criteria

- Fresh installs use `standard` STT mode automatically.
- Voice turns in `standard` mode avoid the new streaming latency path.
- Users can still opt into streaming manually.
- Logs clearly show where time is spent, especially for faster-whisper.
- We can compare `standard` vs `stream` with the same active model and stop guessing.
