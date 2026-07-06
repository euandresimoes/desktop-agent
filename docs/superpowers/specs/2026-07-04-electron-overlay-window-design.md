# Electron Overlay Window Design

## Goal

Add a compact assistant overlay window to the Electron app that can be opened from the system tray flow with `Ctrl + Space`, starts recording immediately, stops recording on the same hotkey, and closes on `Esc`.

## Context

The desktop app already has:

- a primary `BrowserWindow` for the full application
- tray-aware close behavior
- a mature voice pipeline for `STT -> LLM -> TTS`
- global app settings persisted in the main process

The next product step is to make the assistant available from anywhere without reopening the full application window.

## User Experience

### First release scope

The overlay will be:

- compact, floating, and dedicated to voice interaction
- visually inspired by Superwhisper
- opened with `Ctrl + Space`
- immediately switched into recording mode when shown
- stopped with `Ctrl + Space` while recording
- closed with `Esc`

The first release will not include:

- persistent conversation history
- wake word detection
- editable commands
- multi-step tool execution from the overlay

### Overlay behavior

When the user presses `Ctrl + Space`:

1. If the overlay is hidden, the app shows it in the configured screen position.
2. The overlay gains focus.
3. The renderer starts recording immediately.

When the user presses `Ctrl + Space` again:

1. If the overlay is actively recording, the renderer stops recording.
2. The existing voice-turn flow continues through processing and playback.

When the user presses `Esc` while the overlay is visible:

1. The renderer cancels any active interaction.
2. The overlay hides immediately.

The overlay stays visible while processing and speaking. It does not auto-close in the first release.

## Window Architecture

### Recommended approach

Use a dedicated secondary `BrowserWindow` instead of repurposing the main app window.

This keeps the overlay isolated from the primary layout, avoids coupling overlay behavior to the main view tree, and prepares the app for future triggers such as wake word activation. It also gives the main process full control over:

- global hotkey routing
- screen placement
- focus management
- tray/minimized behavior

### Window characteristics

The overlay window should be:

- frameless
- transparent
- hidden from the taskbar
- always on top
- non-resizable
- small fixed-size layout
- focusable when shown via hotkey

It should behave like a utility overlay rather than a normal app window.

## Positioning Model

### Saved setting

Introduce a persisted app setting:

- `overlayPosition`

Valid values:

- `top-left`
- `top-center`
- `top-right`
- `left`
- `center`
- `right`
- `bottom-left`
- `bottom-center`
- `bottom-right`

### Placement rules

The main process computes the final window coordinates from:

- the active display work area
- the overlay window size
- the semantic position selected by the user

This avoids storing fragile pixel coordinates and keeps placement stable across:

- resolution changes
- taskbar changes
- multiple monitor setups

## Settings UX

Add a new `Overlay` tab in `AppSettingsModal`.

The tab includes a visual `3 x 3` picker instead of a text select. Each cell acts like a clickable mini-screen preview that represents one screen anchor. The active selection is highlighted and persisted immediately through the existing app settings bridge.

The first overlay settings scope is:

- `overlayPosition`

Future settings can be added later, such as:

- `overlayEnabled`
- `overlayAutoClose`
- `overlayDisplayPreference`
- `overlayScale`

Those are intentionally out of scope for the first pass.

## Main Process Responsibilities

Create two focused services.

### Overlay window controller

Responsibilities:

- lazily create the overlay window
- show and hide it
- reposition it from app settings
- keep the window focused when opened
- expose a small command surface to the renderer and main process

### Overlay hotkey controller

Responsibilities:

- register `Ctrl + Space` after app readiness
- unregister shortcuts on quit/reload paths
- route the hotkey action based on overlay visibility and recording state

The hotkey controller must not know renderer details. It should call higher-level overlay commands such as:

- `openAndStartRecording`
- `stopRecording`
- `hideAndCancel`

## Renderer Responsibilities

Create a dedicated overlay view instead of embedding the main application shell.

### Overlay view

Responsibilities:

- show compact audio bars / waveform
- show state labels like `Recording`, `Processing`, `Speaking`
- show shortcut hints
- drive the existing voice-turn service
- listen for overlay commands from preload

The overlay renderer should reuse the existing voice engine behavior where possible, but its presentation layer should remain separate from `VoiceTurnView`.

## IPC and Bridge Design

Add a small overlay API to preload.

The renderer needs to:

- know when the main process wants it to start recording
- know when it should stop recording
- know when it should cancel and close
- optionally request the main process to hide the overlay

Recommended command surface:

- main -> renderer event: `overlay:start-recording`
- main -> renderer event: `overlay:stop-recording`
- main -> renderer event: `overlay:cancel-and-hide`
- renderer -> main invoke/send: `overlay:hide`
- renderer -> main invoke/send: `overlay:set-recording-state`

The main process needs lightweight state awareness so the hotkey controller knows whether the overlay is currently recording.

## State Synchronization

The overlay hotkey logic depends on a minimal state model:

- hidden
- visible-idle
- visible-recording
- visible-processing
- visible-speaking

The renderer remains the source of truth for voice activity, but the main process keeps a mirrored summary state sent from renderer over IPC. This is enough to decide:

- open and start
- stop recording
- cancel and hide

This avoids duplicating the voice pipeline in the main process.

## Error Handling

### Overlay open failures

If the overlay window cannot be created or shown:

- log the failure in the main process
- avoid crashing the main app
- leave the primary window behavior untouched

### Voice flow failures

If recording or processing fails inside the overlay:

- keep the overlay visible
- show the existing toast/error UI or a compact inline error state
- allow the user to retry immediately

### Hotkey conflicts

If Electron cannot register `Ctrl + Space`:

- log the failure
- keep the app functional
- do not crash startup

The settings UI for remapping the hotkey is out of scope for this release.

## Testing Strategy

### Main process

Add focused tests for:

- app settings persistence for `overlayPosition`
- position calculation logic
- overlay state transitions in the controller

### Renderer

Add focused tests for:

- overlay settings picker behavior
- overlay view command handling
- state-driven rendering of status / compact controls

### Manual verification

Verify:

- `Ctrl + Space` opens overlay and starts recording
- `Ctrl + Space` during recording stops recording
- `Esc` closes overlay and cancels active work
- overlay respects configured position
- overlay still works when main window is hidden to tray
- app package still builds successfully

## File-Level Design

### Main process

- `apps/electron/src/main-process/services/overlayWindowController.ts`
  Creates, owns, positions, shows, and hides the overlay window.

- `apps/electron/src/main-process/services/overlayHotkeyController.ts`
  Registers and routes global hotkey actions.

- `apps/electron/src/main.ts`
  Wires overlay services into app startup and shutdown.

### Shared settings

- `apps/electron/src/shared/types/app-settings.ts`
  Adds `overlayPosition` type and default.

- `apps/electron/src/main-process/services/appSettingsStore.ts`
  Persists and validates `overlayPosition`.

### Preload

- `apps/electron/src/preload.ts`
  Exposes overlay IPC helpers/events.

### Renderer

- `apps/electron/src/views/overlay/OverlayView.vue`
  Compact overlay interface.

- `apps/electron/src/views/overlay/useOverlayController.ts`
  Small controller that binds preload commands to the voice-turn service.

- `apps/electron/src/shared/components/Base/BaseScreenPositionPicker.vue`
  Reusable visual `3 x 3` picker for overlay placement.

- `apps/electron/src/views/app-settings/AppSettingsModal.vue`
  Adds the `Overlay` tab and picker row.

## Out of Scope

This design intentionally excludes:

- wake word activation
- user-defined wake commands
- tool calling
- overlay conversation history
- text input mode
- overlay hotkey remapping
- drag-to-reposition

## Recommendation

Implement the overlay as an isolated `BrowserWindow` with main-process-controlled hotkeys and renderer-driven voice behavior. This gives the cleanest boundary today and the safest foundation for future wake word and assistant-presence features.
