# Electron Status Bar Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable dropdown base component and use it in the left side of the Electron status bar to switch between installed `LLM`, `STT`, and `TTS` options.

**Architecture:** A new `BaseDropdown.vue` will own open/close behavior, click-outside handling, and upward panel positioning. `StatusBarComponent.vue` will compose three installed-only selectors using the existing settings service, while shared SCSS mixins define the dropdown surface and restore the tighter item density.

**Tech Stack:** Vue 3, TypeScript, SCSS, Electron Forge, Vite

---

### Task 1: Create the reusable dropdown primitive

**Files:**
- Create: `apps/electron/src/shared/components/Base/BaseDropdown.vue`
- Modify: `apps/electron/src/assets/styles/mixins.scss`
- Modify: `apps/electron/src/assets/styles/tokens.scss`
- Modify: `apps/electron/src/assets/styles/themes.scss`

- [ ] **Step 1: Define the dropdown option contract and open state**

Create a minimal shared option type and internal state:

```ts
export interface BaseDropdownOption {
  id: string;
  label: string;
  description?: string;
}

const isOpen = ref(false);
```

- [ ] **Step 2: Add trigger slot plus upward-positioned panel**

Render a slotted trigger and a floating menu:

```vue
<button class="dropdown-trigger" type="button" @click="toggle">
  <slot />
</button>

<div v-if="isOpen" class="dropdown-panel">
  <button
    v-for="option in options"
    :key="option.id"
    class="dropdown-option"
    type="button"
    @click="handleSelect(option.id)"
  >
    {{ option.label }}
  </button>
</div>
```

- [ ] **Step 3: Add reusable SCSS tokens and mixins for dropdown styling**

Define shared color tokens and mixins instead of hardcoded colors:

```scss
$color-dropdown-bg: var(--color-dropdown-bg);
$color-dropdown-border: var(--color-dropdown-border);
$color-dropdown-item-hover: var(--color-dropdown-item-hover);
```

and:

```scss
@mixin base-dropdown-panel { ... }
@mixin base-dropdown-trigger { ... }
@mixin base-dropdown-item { ... }
@mixin base-dropdown-item-active { ... }
```

### Task 2: Wire installed-only status selectors into the footer

**Files:**
- Modify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- Modify: `apps/electron/src/views/voice-turn/services/settingsService.ts`

- [ ] **Step 1: Expose installed-ready options from the settings service**

Use the existing settings fetch and active-switch methods while shaping installed-only lists:

```ts
const installedLlmModels = computed(() => llmModels.value.filter((m) => m.installed));
const installedTtsVoices = computed(() => ttsVoices.value.filter((v) => v.installed));
```

- [ ] **Step 2: Load selector options inside the status bar**

Initialize the settings service in read/switch mode:

```ts
const { fetchAll, handleSetActive, installedLlmModels, installedSttModels, installedTtsVoices } =
  useSettingsService(refreshStatus);
```

- [ ] **Step 3: Replace left-side passive items with dropdown selectors**

Use icon + active name only:

```vue
<BaseDropdown :options="llmOptions" :selected-id="activeLlmId" @select="handleSetActive('llm', $event)">
  <StatusBarItem :icon="Cpu" :value="activeModelItems.llm" clickable />
</BaseDropdown>
```

### Task 3: Tighten status-bar density and align visuals

**Files:**
- Modify: `apps/electron/src/shared/components/layout/Statusbar/StatusBarItem.vue`
- Modify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`

- [ ] **Step 1: Remove the extra label text from left-side selectors**

Status selectors should show only:

```vue
<StatusBarItem :icon="Mic" :value="activeModelItems.stt" clickable />
```

- [ ] **Step 2: Reduce item padding and gaps**

Restore a denser shell footprint:

```scss
padding: 5px;
gap: 5px;
```

- [ ] **Step 3: Keep right-side metric items readable**

Preserve the label/value layout for metrics while keeping ellipsis support for long text.

### Task 4: Verify the dropdown refactor

**Files:**
- Verify: `apps/electron/src/shared/components/Base/BaseDropdown.vue`
- Verify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`

- [ ] **Step 1: Run a package/build validation**

Run:

```bash
npx electron-forge package
```

Expected: packaging completes successfully

- [ ] **Step 2: Search for stale hardcoded status-bar padding assumptions if needed**

Run:

```bash
rg -n "padding: 5px 8px|label=\"LLM\"|label=\"STT\"|label=\"TTS\"" apps/electron/src/shared/components/layout
```

Expected: no obsolete left-side selector usage remains
