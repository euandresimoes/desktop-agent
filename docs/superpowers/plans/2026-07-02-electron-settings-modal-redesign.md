# Electron Settings Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Electron settings experience into a clean preferences-style modal with reusable base controls and secondary creation modals.

**Architecture:** The primary `SettingsModal.vue` becomes a two-pane preferences shell with sidebar navigation on `color-surface` and content on `color-base`. Shared primitives (`BaseInput`, `BaseSelect`, `BaseToggle`, `BaseOption`) plus secondary create modals replace the current card-heavy, accent-heavy structure.

**Tech Stack:** Vue 3, TypeScript, SCSS, Electron Forge, Vite

---

### Task 1: Build the reusable form primitives and shared style tokens

**Files:**
- Create: `apps/electron/src/shared/components/Base/BaseInput.vue`
- Create: `apps/electron/src/shared/components/Base/BaseSelect.vue`
- Create: `apps/electron/src/shared/components/Base/BaseToggle.vue`
- Create: `apps/electron/src/shared/components/Base/BaseOption.vue`
- Modify: `apps/electron/src/assets/styles/tokens.scss`
- Modify: `apps/electron/src/assets/styles/themes.scss`
- Modify: `apps/electron/src/assets/styles/mixins.scss`

- [ ] **Step 1: Add reusable control tokens**

Add tokens for input, select, toggle, option, settings panel, and separators, reusing existing palette values:

```scss
$color-input-bg: var(--color-input-bg);
$color-input-border: var(--color-input-border);
$color-toggle-bg: var(--color-toggle-bg);
$color-settings-separator: var(--color-settings-separator);
```

- [ ] **Step 2: Add reusable control mixins**

Define shared mixins for:

```scss
@mixin base-input;
@mixin base-select-trigger;
@mixin base-toggle;
@mixin base-option;
@mixin settings-row;
```

- [ ] **Step 3: Implement the base components**

Create compact primitives with minimal props and clean slots/events, matching the spec and references.

### Task 2: Split creation flows into focused secondary modals

**Files:**
- Create: `apps/electron/src/views/voice-turn/components/CreateLlmModal.vue`
- Create: `apps/electron/src/views/voice-turn/components/CreateSttModal.vue`
- Create: `apps/electron/src/views/voice-turn/components/CreateTtsModal.vue`
- Modify: `apps/electron/src/shared/components/Base/BaseModal.vue`

- [ ] **Step 1: Reuse the existing base modal shell**

If needed, make `BaseModal.vue` flexible enough for the redesigned primary and secondary modals without changing its public API unnecessarily.

- [ ] **Step 2: Move create/install forms into separate modals**

Each create modal should own only its type-specific form and submit flow using:

```ts
pickFile(...)
handleCreate(...)
```

- [ ] **Step 3: Use new base primitives inside the create modals**

Replace raw inputs/selects/checkboxes with:
- `BaseInput`
- `BaseSelect`
- `BaseToggle`
- `BaseButton`

### Task 3: Rebuild the primary settings modal as a preferences shell

**Files:**
- Modify: `apps/electron/src/views/voice-turn/components/SettingsModal.vue`
- Potentially create: small tab subcomponents if needed

- [ ] **Step 1: Replace the card-based structure with a two-pane layout**

The shell should be:

```vue
<aside class="settings-sidebar">...</aside>
<main class="settings-main">...</main>
```

- [ ] **Step 2: Convert each tab to row-based preferences groups**

Use title + description + right-side control rows rather than boxed cards.

- [ ] **Step 3: Wire secondary create modals into the main modal**

Primary modal opens the type-specific create modal instead of rendering install forms inline.

### Task 4: Adapt settings interactions to the new primitives

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/settingsService.ts`
- Modify: `apps/electron/src/views/voice-turn/components/SettingsModal.vue`

- [ ] **Step 1: Keep business logic intact while shaping values for base components**

Bridge existing service state into the new select/option/toggle primitives without changing backend behavior.

- [ ] **Step 2: Use accent only in approved states**

Ensure:
- input focus border uses accent
- toggle active uses accent
- selected option uses accent

- [ ] **Step 3: Remove the old card/badge styling assumptions**

Delete or stop using styling patterns that conflict with the new references.

### Task 5: Verify the redesigned modal

**Files:**
- Verify: `apps/electron/src/views/voice-turn/components/SettingsModal.vue`
- Verify: `apps/electron/src/shared/components/Base/*.vue`

- [ ] **Step 1: Run packaging/build validation**

Run:

```bash
npx electron-forge package
```

Expected: packaging completes successfully

- [ ] **Step 2: Search for old inline form/control patterns inside the settings modal**

Run:

```bash
rg -n "<input|<select|type=\"checkbox\"|models-grid|model-card|form-section" apps/electron/src/views/voice-turn/components/SettingsModal.vue
```

Expected: old card-heavy structure and raw controls are removed from the primary modal
