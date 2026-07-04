# Electron Settings Modal Redesign Design

## Goal

Completely redesign the Electron voice-turn settings experience to match the clean, dense, modern preferences-panel style shown in the provided references, while introducing reusable base form primitives for future UI work.

## Scope

Included:
- redesign `SettingsModal.vue` structure and styling
- replace large cards and accent-heavy treatment with a flatter preferences layout
- add reusable base primitives:
  - `BaseInput.vue`
  - `BaseSelect.vue`
  - `BaseToggle.vue`
  - `BaseOption.vue`
- move create/install flows into secondary modals
- add reusable theme tokens and SCSS mixins for the new controls

Excluded:
- backend API changes
- changing the functional model-management workflow beyond presentation and modal decomposition
- redesigning unrelated app surfaces

## Visual Direction

The new UI should follow the reference closely:
- sidebar on `color-surface`
- main content on `color-base`
- flat, modern, macOS-adjacent control styling
- thin separators instead of heavy cards
- restrained color system with accent used only in approved cases

Accent usage rules:
- active toggle
- selected option
- focused input border

Accent should not be used for general section decoration, panel fills, or random emphasis.

## Recommended Approach

Refactor the settings surface into a preferences shell plus reusable controls, instead of trying to restyle the current card-based structure.

Why this approach:
- the current structure fights the desired visual result
- reusable base controls give the app a cleaner UI foundation
- secondary creation modals keep the primary preferences screen calm and readable

## Target Architecture

### 1. Primary settings shell

`SettingsModal.vue` becomes a preferences window with:
- left navigation sidebar
- right content panel
- per-tab settings grouped as rows

Each tab should feel like a native preferences page:
- section title
- rows with label, optional description, and right-aligned control
- soft separators between rows
- sparse, disciplined spacing

### 2. Secondary creation modals

Creation/install flows move out of the primary modal into focused secondary modals:
- `CreateLlmModal.vue`
- `CreateSttModal.vue`
- `CreateTtsModal.vue`

These modals can still use the same service methods and file picker flow, but they should avoid the noisy “big dashboard card” structure.

### 3. Reusable base controls

#### `BaseInput.vue`

Simple text/number input with:
- consistent height
- subtle surface/background
- muted border
- accent border only on focus/active

#### `BaseSelect.vue`

Simple custom select inspired by the reference:
- compact trigger
- dropdown panel
- selected state handling
- optional label/value display
- chevron icon

Should visually align with the new `BaseDropdown` language where possible, but remain a form control rather than a footer action.

#### `BaseToggle.vue`

Compact switch matching the reference:
- small rounded track
- neutral inactive state
- accent active state
- smooth knob movement

#### `BaseOption.vue`

Single horizontal radio-like option row inspired by the reference:
- circular marker
- text label
- accent only for selected state

Useful for things like language choice, device modes, grouped pickers, and future segmented radio rows.

## Layout Behavior

### Sidebar

Sidebar should:
- use `color-surface`
- have subtle border separation from the main content
- use ghost-style tab buttons
- keep active item understated and clean

### Main content

Main panel should:
- use `color-base`
- present each setting as a flat row
- use separators for rhythm
- avoid boxed cards except where strictly needed

### Rows

Preferred row structure:
- title on the left
- optional help text below title
- control on the right

This mirrors the reference and keeps the scanning pattern simple.

## Data and Interaction Flow

Existing service logic should be reused:
- fetch models/voices
- set active item
- update existing items
- delete existing items
- create new items via secondary modals

The redesign should be structural and visual, not a rewrite of business logic.

## File-Level Changes

Expected additions:
- `apps/electron/src/shared/components/Base/BaseInput.vue`
- `apps/electron/src/shared/components/Base/BaseSelect.vue`
- `apps/electron/src/shared/components/Base/BaseToggle.vue`
- `apps/electron/src/shared/components/Base/BaseOption.vue`
- `apps/electron/src/views/voice-turn/components/CreateLlmModal.vue`
- `apps/electron/src/views/voice-turn/components/CreateSttModal.vue`
- `apps/electron/src/views/voice-turn/components/CreateTtsModal.vue`

Expected updates:
- `apps/electron/src/views/voice-turn/components/SettingsModal.vue`
- `apps/electron/src/assets/styles/mixins.scss`
- `apps/electron/src/assets/styles/themes.scss`
- `apps/electron/src/assets/styles/tokens.scss`

Potential light updates:
- `apps/electron/src/views/voice-turn/services/settingsService.ts`
- `apps/electron/src/shared/components/Base/BaseModal.vue`

## Styling System Changes

Add reusable tokens and mixins for:
- input background, border, text, focus state
- select trigger, panel, option rows
- toggle track and thumb
- option marker and label states
- settings row separators
- settings sidebar ghost items
- settings content spacing

Colors should be based on existing palette values where possible so future theme tuning stays centralized.

## Tab Content Strategy

Each tab should follow the same composition:
- active selection row
- compact configuration rows for existing installed items
- secondary actions for edit/delete/create

The old pattern of giant “installed models” cards should be removed.

If item detail is too large for a single row, use compact grouped rows or a sub-list, but still keep the overall preferences feel.

## Risks

- the current `SettingsModal.vue` is doing too much and may benefit from splitting tab content into smaller subcomponents
- custom select and option primitives need careful interaction handling to stay simple and robust
- moving creation flows into secondary modals introduces more components, so naming and responsibility boundaries must stay clean

## Verification Plan

After implementation:
- settings modal visually matches the reference direction
- sidebar uses `color-surface`
- main panel uses `color-base`
- custom primitives render consistently
- accent appears only on:
  - active toggle
  - selected option
  - active input border
- creation flows open in secondary modals
- package/build succeeds
