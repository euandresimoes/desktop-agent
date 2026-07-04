# Electron Frontend Status Bar Consolidation Design

## Goal

Remove the application sidebar from the Electron frontend and consolidate system status information into the bottom status bar. The new architecture should reduce layout complexity, eliminate duplicated status logic, and keep the status bar focused on rendering small informational items.

## Scope

This change applies only to the Electron frontend under `apps/electron/`.

Included:
- Remove `SidebarComponent.vue` from the main application layout.
- Remove sidebar-specific child components that are no longer used by the app shell.
- Move active configuration information (`LLM`, `STT`, `TTS/voice`) into the status bar.
- Move latest latency metrics (`stt`, `llm`, `tts`, `total`) into the status bar.
- Remove sidebar-specific SCSS tokens and mixins that are only used by the shell sidebar.
- Extract shared status/event logic into a composable so the UI layer stays presentation-oriented.

Excluded:
- Changes to the settings modal sidebar.
- Backend API changes.
- Changes to voice-turn business logic beyond status-state extraction.

## Recommended Approach

Use a dedicated composable, tentatively `useSystemStatus`, as the single source of truth for the frontend status payload currently propagated through the `system-config-updated` event.

Why this approach:
- Removes duplicated listener/state code from sidebar-oriented components.
- Keeps `StatusBarComponent.vue` small and focused on layout/composition.
- Makes the system status payload reusable by future footer/header widgets without re-implementing event listeners.

## Target Architecture

### 1. App shell

`App.vue` should no longer render the shell sidebar. The central layout becomes:
- top bar
- main app view occupying the available width
- bottom status bar

This simplifies the shell from a two-column layout into a single content region plus fixed chrome.

### 2. Shared system status composable

Create a shared composable under the layout/shared area that:
- owns `activeConfig`
- owns `metrics`
- listens for the `system-config-updated` browser event
- normalizes fallback labels such as pending/loading states
- exposes formatted status-ready values for the UI

Suggested exposed shape:
- `activeConfig`
- `metrics`
- `statusItems` or formatting helpers for status bar consumption

### 3. Status bar as presentation layer

`StatusBarComponent.vue` should import the composable and render a compact row of `StatusBarItem.vue` entries such as:
- `LLM: <model>`
- `STT: <model>`
- `TTS: <voice>`
- `STT: <ms>`
- `LLM: <ms>`
- `TTS: <ms>`
- `Total: <ms>`

The component should be resilient to empty state and display placeholders when the backend has not yet reported values.

### 4. Status bar item contract

`StatusBarItem.vue` should support informational usage cleanly.

Expected adjustments:
- support compact label/value rendering for longer strings
- support non-clickable mode for passive status entries
- preserve clickable behavior only where explicitly needed

This avoids styling all footer items as if they were actions.

## File-Level Changes

Expected updates:
- `apps/electron/src/App.vue`
- `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- `apps/electron/src/shared/components/layout/Statusbar/StatusBarItem.vue`
- new shared composable for system status
- `apps/electron/src/assets/styles/tokens.scss`
- `apps/electron/src/assets/styles/themes.scss`
- `apps/electron/src/assets/styles/mixins.scss`

Expected removals:
- `apps/electron/src/shared/components/layout/SidebarComponent.vue`
- `apps/electron/src/shared/components/layout/Sidebar/SidebarHeaderComponent.vue`
- `apps/electron/src/shared/components/layout/Sidebar/SidebarMainComponent.vue`
- `apps/electron/src/shared/components/layout/Sidebar/SidebarFooterComponent.vue`

## Styling Impact

Remove shell sidebar styling only where it is not reused:
- sidebar color token
- sidebar theme variable
- sidebar layout/style mixins

Preserve settings modal sidebar styles because they belong to a different feature surface and remain in use.

## Data Flow

1. `useVoiceTurnService` continues to fetch status and emit `system-config-updated`.
2. The new composable listens once at the UI-consumption layer.
3. `StatusBarComponent.vue` consumes the composable output and renders items.

This keeps the existing event contract intact while improving the frontend composition around it.

## Error Handling and Empty States

- If active config is missing, show placeholders such as `Pendente` or `Loading...`, depending on current convention.
- If metrics are missing, render `-` values instead of hiding the items entirely.
- The footer should remain stable in width/height even while data is loading.

## Verification Plan

After implementation:
- ensure the app shell renders without the sidebar
- ensure the main view fills the freed horizontal space
- ensure model/voice data appears in the status bar
- ensure latency metrics update after a voice turn
- ensure removed SCSS tokens/mixins have no lingering references
- run the frontend validation command available in `apps/electron`

## Risks

- `StatusBarItem.vue` may need a small API change to distinguish passive information from clickable actions.
- Long model names may overflow if the footer layout is not constrained properly.
- Removing sidebar shell styles may expose hidden dependencies in the app layout.
