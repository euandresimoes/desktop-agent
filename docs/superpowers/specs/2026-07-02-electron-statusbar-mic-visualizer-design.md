# Electron Status Bar Microphone Visualizer Design

## Goal

Add a centered microphone visualizer to the Electron status bar that reacts to the user's real microphone input while the app is in the `recording` state.

## Scope

Included:
- add a center section to the status bar
- create a microphone visualizer component for the center section
- drive the visualizer from real recording-time microphone volume
- keep the visualizer transparent, with bars in `$color-text-primary`

Excluded:
- always-on microphone monitoring outside recording
- FFT/spectrum-analysis style visualization
- backend changes

## Recommended Approach

Use the real microphone volume already available during recording and transform it into a multi-bar animated display with controlled variation.

Why this approach:
- uses real signal, not fake idle animation
- avoids deeper analyzer-pipeline changes
- gives a richer result than a single volume blob
- keeps the implementation light enough for the status bar

## Target Architecture

### 1. Shared recording status for layout consumers

Expose enough shared UI state so the status bar can know:
- whether the app is currently `recording`
- the current microphone volume level during recording

This should come from the same voice-turn state source already used by the main view, not from a second microphone capture.

### 2. Center visualizer component

Create a dedicated component, for example:
- `StatusBarMicrophoneVisualizer.vue`

Responsibilities:
- render a row of thin vertical bars
- react only while `recording`
- distribute the live volume across bars with slight offset/attenuation so the waveform feels alive
- remain visually calm when not recording

### 3. Status bar layout update

Update `StatusBarComponent.vue` to have:
- left section for active model selectors
- center section for the visualizer
- right section for metrics

The center section should not push the layout into instability and should remain balanced between left and right areas.

## Visual Rules

- background transparent
- bars use `$color-text-primary`
- bars are thin, compact, and horizontally centered
- movement only when recording
- no fake pulsing while idle

## Data Flow

1. voice-turn service updates recording state and current volume
2. shared status/composable exposes `isRecording` and `currentVolume`
3. center visualizer consumes those values
4. bars update smoothly while recording

## File-Level Changes

Expected additions:
- `apps/electron/src/shared/components/layout/Statusbar/StatusBarMicrophoneVisualizer.vue`

Expected updates:
- `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- shared status/composable used by the status bar
- potentially `apps/electron/src/views/voice-turn/services/voiceTurnService.ts` if the layout needs shared event propagation for recording state
- `apps/electron/src/assets/styles/mixins.scss` only if a shared visualizer mixin is useful

## Risks

- if the recording state is not currently exposed outside the voice-turn view, a small shared-state bridge will be needed
- too much randomized bar movement could feel fake, so the response should stay anchored to the real volume value
- the center visualizer must not interfere with existing status-bar spacing or dropdown interactions

## Verification Plan

After implementation:
- center section appears in the status bar
- visualizer is idle when not recording
- visualizer animates only during recording
- movement clearly responds to real mic volume
- packaging/build succeeds
