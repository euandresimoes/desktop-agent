# Electron Status Bar Dropdown Design

## Goal

Add a reusable dropdown base component to the Electron frontend and use it in the left side of the status bar so active `LLM`, `STT`, and `TTS` entries can switch between installed models and voices.

## Scope

Included:
- create a reusable base dropdown component
- use the dropdown in the left side of the status bar
- show icon + active model name only, without the `LLM`, `STT`, `TTS` text labels
- reduce the status bar item padding back to a tighter footprint
- add reusable SCSS mixins and tokens support for dropdown styling
- filter footer options to installed items only

Excluded:
- changes to backend APIs
- replacing the settings modal selectors
- changes to the right-side latency items besides styling consistency

## Recommended Approach

Create a `BaseDropdown.vue` component in the shared base layer and keep the status bar responsible only for composing trigger content and passing installed options plus selection handlers.

Why this approach:
- the dropdown becomes reusable across the app
- the status bar stays focused on app-specific wiring
- styling can be centralized through SCSS mixins instead of one-off component CSS

## Target Architecture

### 1. Base dropdown component

Create a generic dropdown with:
- trigger slot
- options array prop
- selected id prop
- open/close internal state
- click-outside handling
- item selection emit
- panel positioned above the trigger

Suggested option shape:
- `id`
- `label`
- optional `meta` or `description`

### 2. Status bar integration

Replace the three left-side passive items with dropdown triggers:
- `LLM` icon + active model name
- `STT` icon + active model name
- `TTS` icon + active voice name

Behavior:
- clicking the trigger opens the dropdown above the item
- selecting an option calls `handleSetActive`
- after switching, the settings/status data refreshes and the visible active name updates

### 3. Installed-only filtering

Footer dropdowns should display only usable options:
- LLM: models where `installed === true`
- TTS: voices where `installed === true`
- STT: installed/practical options only, based on current available shape and without inventing backend data

### 4. Shared styling

Add reusable mixins for:
- dropdown trigger surface
- dropdown panel
- dropdown option item
- active option state

Use current theme/token colors instead of hardcoded values so the dropdown matches the existing shell.

## File-Level Changes

Expected additions:
- `apps/electron/src/shared/components/Base/BaseDropdown.vue`
- optionally a small status-bar-specific helper/composable if needed for installed option shaping

Expected updates:
- `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- `apps/electron/src/shared/components/layout/Statusbar/StatusBarItem.vue`
- `apps/electron/src/assets/styles/mixins.scss`
- `apps/electron/src/assets/styles/themes.scss`
- `apps/electron/src/assets/styles/tokens.scss`

## Styling Notes

The current status bar item padding is larger than desired. Restore a tighter density close to the original shell look:
- smaller horizontal padding
- compact gaps
- preserve ellipsis for long model names

The dropdown should feel anchored to the footer item:
- open upward
- compact width
- border and surface aligned with existing shell tones

## Data Flow

1. status bar reads active config from the existing shared status layer
2. status bar loads installed model lists from the settings service
3. dropdown emits selected option id
4. status bar calls `handleSetActive`
5. status refresh event updates the active labels

## Risks

- `useSettingsService` may need light adaptation to support read-only dropdown usage cleanly
- STT readiness may not expose an `installed` flag as directly as LLM/TTS
- click-outside and upward positioning need to be implemented carefully to avoid footer clipping

## Verification Plan

After implementation:
- left-side footer items show icon + active name only
- clicking `LLM`, `STT`, or `TTS` trigger opens a dropdown above the item
- only installed options appear
- selecting an option updates the active model or voice
- status bar density looks tighter than the current padded version
- package/build still succeeds
