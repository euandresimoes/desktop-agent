# Electron Status Bar Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the shell sidebar from the Electron frontend and consolidate active model plus latency status into the bottom status bar.

**Architecture:** The app shell will become a top bar, full-width main view, and bottom status bar. Shared `system-config-updated` payload handling will move into a focused composable so `StatusBarComponent.vue` remains a presentation component built from `StatusBarItem.vue`.

**Tech Stack:** Vue 3, TypeScript, SCSS, Electron Forge, Vite, ESLint

---

### Task 1: Document the shared status boundary

**Files:**
- Create: `apps/electron/src/shared/components/layout/Statusbar/useSystemStatus.ts`
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`

- [ ] **Step 1: Define the shared status types and event listener API**

Create a composable that owns the UI-facing status payload:

```ts
import { onBeforeUnmount, onMounted, ref } from "vue";

export interface ActiveConfig {
  llmModel?: string;
  sttModel?: string;
  voice?: string;
}

export interface VoiceTurnMetrics {
  stt?: number;
  llm?: number;
  tts?: number;
  total?: number;
}
```

- [ ] **Step 2: Keep the voice-turn service event contract compatible**

Retain the existing browser event name and payload shape so the new composable can subscribe without backend or feature-flow changes:

```ts
window.dispatchEvent(
  new CustomEvent("system-config-updated", {
    detail: { activeConfig: activeConfig.value, metrics: metrics.value },
  })
);
```

- [ ] **Step 3: Add status formatting helpers inside the composable**

Expose compact status bar values from the listener layer:

```ts
const formatMetric = (value?: number) => (typeof value === "number" ? `${value}ms` : "-");
const getConfigValue = (value?: string) => value || "Pendente";
```

### Task 2: Remove the shell sidebar from the app layout

**Files:**
- Modify: `apps/electron/src/App.vue`
- Delete: `apps/electron/src/shared/components/layout/SidebarComponent.vue`
- Delete: `apps/electron/src/shared/components/layout/Sidebar/SidebarHeaderComponent.vue`
- Delete: `apps/electron/src/shared/components/layout/Sidebar/SidebarMainComponent.vue`
- Delete: `apps/electron/src/shared/components/layout/Sidebar/SidebarFooterComponent.vue`

- [ ] **Step 1: Remove sidebar imports and slots from the app shell**

Reduce the shell to top bar, content view, and status bar:

```vue
<div id="main__content">
  <AppView />
</div>
```

- [ ] **Step 2: Delete unused shell sidebar files**

Remove the shell sidebar component and its header/main/footer files once no remaining imports exist.

### Task 3: Rebuild the status bar around passive information items

**Files:**
- Modify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- Modify: `apps/electron/src/shared/components/layout/Statusbar/StatusBarItem.vue`

- [ ] **Step 1: Make `StatusBarItem.vue` work for passive status entries**

Adjust props so the item can render an informational label/value without always behaving like a button:

```ts
const props = withDefaults(defineProps<{
  icon?: Component;
  label: string;
  value?: string;
  clickable?: boolean;
}>(), {
  value: "",
  clickable: false,
});
```

- [ ] **Step 2: Render compact status label/value pairs**

Use a layout that supports longer values:

```vue
<span class="item-label">{{ props.label }}</span>
<span v-if="props.value" class="item-value">{{ props.value }}</span>
```

- [ ] **Step 3: Compose the footer from active config and latency items**

Populate `StatusBarComponent.vue` from the composable:

```vue
<StatusBarItem :icon="Cpu" label="LLM" :value="activeModelItems.llm" />
<StatusBarItem :icon="Mic" label="STT" :value="activeModelItems.stt" />
<StatusBarItem :icon="Volume2" label="TTS" :value="activeModelItems.tts" />
<StatusBarItem :icon="Gauge" label="Total" :value="metricItems.total" />
```

### Task 4: Remove shell-sidebar SCSS surface

**Files:**
- Modify: `apps/electron/src/assets/styles/tokens.scss`
- Modify: `apps/electron/src/assets/styles/themes.scss`
- Modify: `apps/electron/src/assets/styles/mixins.scss`

- [ ] **Step 1: Remove the shell sidebar color token**

Delete:

```scss
$color-sidebar-bg: var(--color-sidebar-bg);
```

- [ ] **Step 2: Remove the shell sidebar theme variable**

Delete:

```scss
--color-sidebar-bg: var(--color-surface);
```

- [ ] **Step 3: Remove the shell sidebar layout and style mixins**

Delete:

```scss
@mixin app-sidebar-layout { ... }
@mixin app-sidebar-style { ... }
```

Keep the settings modal sidebar mixins because they belong to a separate feature and remain used.

### Task 5: Verify the refactor

**Files:**
- Verify: `apps/electron/package.json`

- [ ] **Step 1: Run static validation**

Run:

```bash
npm run lint
```

Expected: exit code `0`

- [ ] **Step 2: Run a production-oriented frontend build**

Run:

```bash
npx electron-forge package
```

Expected: packaging completes without Vue/TypeScript/SCSS compile errors

- [ ] **Step 3: Search for stale sidebar shell references**

Run:

```bash
rg -n "SidebarComponent|SidebarHeaderComponent|SidebarMainComponent|SidebarFooterComponent|color-sidebar-bg|app-sidebar-layout|app-sidebar-style" apps/electron/src
```

Expected: no matches
