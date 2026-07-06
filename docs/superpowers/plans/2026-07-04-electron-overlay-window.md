# Electron Overlay Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact dedicated Electron overlay window that opens with `Ctrl + Space`, starts recording immediately, stops on the same hotkey, closes on `Esc`, and can be positioned from a visual settings picker.

**Architecture:** Add a secondary `BrowserWindow` managed by focused main-process controllers, persist overlay placement in shared app settings, and render a dedicated compact overlay view that reuses the existing voice engine without reusing the main app shell.

**Tech Stack:** Electron, Vue 3, TypeScript, preload IPC bridge, existing voice-turn services, existing app settings persistence.

---

## File Structure

### Create

- `apps/electron/src/main-process/services/overlayTypes.ts`
  Shared main-process overlay types and command/state definitions.

- `apps/electron/src/main-process/services/overlayPositioning.ts`
  Pure helpers to translate semantic position values into `x/y` coordinates from a display work area.

- `apps/electron/src/main-process/services/overlayWindowController.ts`
  Creates, shows, hides, focuses, repositions, and coordinates the overlay window.

- `apps/electron/src/main-process/services/overlayHotkeyController.ts`
  Registers/unregisters the global shortcut and routes the correct overlay action.

- `apps/electron/src/views/overlay/OverlayView.vue`
  Compact overlay UI.

- `apps/electron/src/views/overlay/useOverlayController.ts`
  Renderer-side controller that binds preload commands to the voice-turn service.

- `apps/electron/src/views/overlay/overlay-entry.ts`
  Renderer entry for the overlay window.

- `apps/electron/src/shared/components/Base/BaseScreenPositionPicker.vue`
  Reusable visual 3x3 position picker.

### Modify

- `apps/electron/src/main.ts`
  Wire overlay window and hotkey services into app lifecycle.

- `apps/electron/src/preload.ts`
  Expose overlay APIs and command/event listeners.

- `apps/electron/src/main-process/services/appSettingsStore.ts`
  Validate and persist `overlayPosition`.

- `apps/electron/src/shared/types/app-settings.ts`
  Add overlay settings types/defaults.

- `apps/electron/src/views/app-settings/AppSettingsModal.vue`
  Add `Overlay` tab and position picker UI.

- `apps/electron/package.json`
  If required by the Electron Forge Vite plugin config, ensure overlay renderer build target is included.

- `apps/electron/forge.config.ts` or Vite plugin config files if present
  Register a second renderer entry if the current setup requires explicit configuration.

### Test / Verify

- `apps/electron/src/main-process/services/appSettingsStore` related tests if present
- `apps/electron/src/shared/services/appSettingsService.playback-mode.test.ts` only if shared settings helpers are reused there
- package verification via `npm run package`

---

### Task 1: Add Overlay Settings Types and Persistence

**Files:**
- Create: `apps/electron/src/main-process/services/overlayTypes.ts`
- Modify: `apps/electron/src/shared/types/app-settings.ts`
- Modify: `apps/electron/src/main-process/services/appSettingsStore.ts`
- Test: settings behavior verified via package/build and manual readback through existing IPC

- [ ] **Step 1: Add overlay settings types in shared settings**

```ts
export const APP_OVERLAY_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type AppOverlayPosition = (typeof APP_OVERLAY_POSITIONS)[number];
```

Also extend `AppSettings` and `DEFAULT_APP_SETTINGS`:

```ts
overlayPosition: "bottom-center",
```

- [ ] **Step 2: Add a type guard for overlay position**

```ts
export const isAppOverlayPosition = (
  value: unknown,
): value is AppOverlayPosition =>
  typeof value === "string" &&
  APP_OVERLAY_POSITIONS.includes(value as AppOverlayPosition);
```

- [ ] **Step 3: Update main-process settings sanitization**

Add to `sanitizePatch` in `appSettingsStore.ts`:

```ts
  if (isAppOverlayPosition(patch.overlayPosition)) {
    nextPatch.overlayPosition = patch.overlayPosition;
  }
```

- [ ] **Step 4: Add overlay main-process shared types**

Create `overlayTypes.ts` with:

```ts
import type { AppOverlayPosition } from "../../shared/types/app-settings";

export type OverlayVoiceState =
  | "hidden"
  | "idle"
  | "recording"
  | "processing"
  | "speaking";

export type OverlayRendererCommand =
  | "start-recording"
  | "stop-recording"
  | "cancel-and-hide";

export type OverlayWindowContext = {
  position: AppOverlayPosition;
  visible: boolean;
  voiceState: OverlayVoiceState;
};
```

- [ ] **Step 5: Verify TypeScript compilation still passes for API and Electron package pipeline**

Run: `npm run package`
Expected: Electron packaging succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/shared/types/app-settings.ts apps/electron/src/main-process/services/appSettingsStore.ts apps/electron/src/main-process/services/overlayTypes.ts
git commit -m "feat: add overlay app settings"
```

### Task 2: Add Pure Overlay Positioning Helpers

**Files:**
- Create: `apps/electron/src/main-process/services/overlayPositioning.ts`
- Modify: `apps/electron/src/main-process/services/overlayTypes.ts`
- Test: manual verification through controller wiring

- [ ] **Step 1: Create a pure overlay position resolver**

Implement:

```ts
import type { Rectangle } from "electron";
import type { AppOverlayPosition } from "../../shared/types/app-settings";

type OverlayBoundsInput = {
  workArea: Rectangle;
  overlayWidth: number;
  overlayHeight: number;
  margin: number;
  position: AppOverlayPosition;
};
```

And export:

```ts
export function resolveOverlayBounds(input: OverlayBoundsInput) {
  // return { x, y }
}
```

- [ ] **Step 2: Use simple anchor math only**

Recommended cases:

```ts
const left = workArea.x + margin;
const centerX = workArea.x + Math.round((workArea.width - overlayWidth) / 2);
const right = workArea.x + workArea.width - overlayWidth - margin;

const top = workArea.y + margin;
const centerY = workArea.y + Math.round((workArea.height - overlayHeight) / 2);
const bottom = workArea.y + workArea.height - overlayHeight - margin;
```

- [ ] **Step 3: Clamp final coordinates to work area**

```ts
const x = Math.max(workArea.x, Math.min(resolvedX, workArea.x + workArea.width - overlayWidth));
const y = Math.max(workArea.y, Math.min(resolvedY, workArea.y + workArea.height - overlayHeight));
```

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main-process/services/overlayPositioning.ts
git commit -m "feat: add overlay positioning helpers"
```

### Task 3: Build the Overlay Window Controller

**Files:**
- Create: `apps/electron/src/main-process/services/overlayWindowController.ts`
- Modify: `apps/electron/src/main.ts`
- Modify: `apps/electron/src/main-process/services/overlayTypes.ts`
- Test: manual verification through package run

- [ ] **Step 1: Create controller skeleton**

Create a factory like:

```ts
import { BrowserWindow, screen } from "electron";
import path from "node:path";
import type { AppSettings } from "../../shared/types/app-settings";
import type { OverlayRendererCommand, OverlayVoiceState } from "./overlayTypes";
import { resolveOverlayBounds } from "./overlayPositioning";

export function createOverlayWindowController() {
  let overlayWindow: BrowserWindow | null = null;
  let voiceState: OverlayVoiceState = "hidden";

  return {
    getWindow() {},
    isVisible() {},
    getVoiceState() {},
    setVoiceState(nextState: OverlayVoiceState) {},
    show(settings: AppSettings) {},
    hide() {},
    hideAndCancel() {},
    openAndStartRecording(settings: AppSettings) {},
    stopRecording() {},
    updatePosition(settings: AppSettings) {},
    destroy() {},
  };
}
```

- [ ] **Step 2: Create the overlay window lazily**

Use a dedicated `BrowserWindow` with:

```ts
new BrowserWindow({
  width: 720,
  height: 168,
  show: false,
  frame: false,
  transparent: true,
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  hasShadow: true,
  autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
  },
});
```

- [ ] **Step 3: Load the overlay renderer entry**

Mirror the existing main window loading pattern, but target the overlay renderer entry path/url.

- [ ] **Step 4: Position using cursor display work area**

Use:

```ts
const point = screen.getCursorScreenPoint();
const display = screen.getDisplayNearestPoint(point);
const { x, y } = resolveOverlayBounds({
  workArea: display.workArea,
  overlayWidth: 720,
  overlayHeight: 168,
  margin: 24,
  position: settings.overlayPosition,
});
```

- [ ] **Step 5: Implement overlay command delivery**

Send renderer commands through:

```ts
overlayWindow?.webContents.send("overlay:command", { command: "start-recording" });
```

Commands required:

```ts
"start-recording"
"stop-recording"
"cancel-and-hide"
```

- [ ] **Step 6: Implement safe hide behavior**

`hideAndCancel()` should send cancel first, then hide. `hide()` should set main-process `voiceState` to `"hidden"` and call `overlayWindow.hide()`.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/main-process/services/overlayWindowController.ts apps/electron/src/main-process/services/overlayTypes.ts apps/electron/src/main.ts
git commit -m "feat: add overlay window controller"
```

### Task 4: Build the Global Hotkey Controller

**Files:**
- Create: `apps/electron/src/main-process/services/overlayHotkeyController.ts`
- Modify: `apps/electron/src/main.ts`
- Test: manual runtime behavior

- [ ] **Step 1: Create a focused hotkey controller**

```ts
import { globalShortcut } from "electron";
import type { AppSettings } from "../../shared/types/app-settings";

type OverlayHotkeyDeps = {
  getSettings: () => AppSettings | null;
  openAndStartRecording: () => void;
  stopRecording: () => void;
  hideAndCancel: () => void;
  isOverlayVisible: () => boolean;
  getVoiceState: () => "hidden" | "idle" | "recording" | "processing" | "speaking";
};
```

- [ ] **Step 2: Route `Ctrl + Space` by state**

Recommended logic:

```ts
if (!deps.isOverlayVisible()) {
  deps.openAndStartRecording();
  return;
}

if (deps.getVoiceState() === "recording") {
  deps.stopRecording();
  return;
}

deps.hideAndCancel();
```

- [ ] **Step 3: Register and unregister safely**

```ts
globalShortcut.register("CommandOrControl+Space", handler);
globalShortcut.unregisterAll();
```

If registration fails, log a warning instead of throwing.

- [ ] **Step 4: Wire into startup and shutdown**

Register on `app.on("ready")`, unregister on `before-quit`, and destroy controller when app exits.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main-process/services/overlayHotkeyController.ts apps/electron/src/main.ts
git commit -m "feat: add overlay hotkey controller"
```

### Task 5: Expose Overlay IPC Through Preload

**Files:**
- Modify: `apps/electron/src/preload.ts`
- Modify: `apps/electron/src/shared/utils/electron-window.utils.ts` only if typings live there
- Test: packaging verification

- [ ] **Step 1: Add typed overlay APIs to preload**

Expose:

```ts
overlay: {
  hide: () => ipcRenderer.invoke("overlay:hide"),
  setVoiceState: (state: string) => ipcRenderer.send("overlay:set-voice-state", state),
  onCommand: (listener: (payload: { command: string }) => void) => { ... },
}
```

- [ ] **Step 2: Return an unsubscribe function for listeners**

Pattern:

```ts
onCommand: (listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on("overlay:command", handler);
  return () => ipcRenderer.removeListener("overlay:command", handler);
}
```

- [ ] **Step 3: Keep existing preload APIs untouched**

Do not regress existing `window`, `dialog`, `shell`, or `appSettings` bridges.

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/preload.ts
git commit -m "feat: expose overlay preload bridge"
```

### Task 6: Create the Visual Position Picker and App Settings Tab

**Files:**
- Create: `apps/electron/src/shared/components/Base/BaseScreenPositionPicker.vue`
- Modify: `apps/electron/src/views/app-settings/AppSettingsModal.vue`
- Modify: `apps/electron/src/assets/styles/mixins.scss` if new shared styles are needed
- Test: manual UI verification

- [ ] **Step 1: Build a reusable 3x3 picker**

Component props:

```ts
type OverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
```

Props/events:

```ts
modelValue: OverlayPosition
@update:modelValue
```

- [ ] **Step 2: Render nine clickable cells**

Each cell should:

- be visually minimal
- show an active indicator
- use existing theme tokens
- feel interactive without a native `<select>`

- [ ] **Step 3: Add the `Overlay` tab in `AppSettingsModal.vue`**

Add a new tab entry and a section row describing:

- position preview
- shortcut behavior text (`Ctrl + Space` and `Esc`)

- [ ] **Step 4: Persist settings immediately**

Use existing settings update flow:

```ts
await window.electronAPI.appSettings.update({
  overlayPosition: nextPosition,
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/shared/components/Base/BaseScreenPositionPicker.vue apps/electron/src/views/app-settings/AppSettingsModal.vue apps/electron/src/assets/styles/mixins.scss
git commit -m "feat: add overlay settings UI"
```

### Task 7: Build the Overlay Renderer View and Controller

**Files:**
- Create: `apps/electron/src/views/overlay/OverlayView.vue`
- Create: `apps/electron/src/views/overlay/useOverlayController.ts`
- Create: `apps/electron/src/views/overlay/overlay-entry.ts`
- Modify: build config files if needed for a second renderer entry
- Test: manual runtime verification

- [ ] **Step 1: Create a compact overlay controller**

The composable should:

- subscribe to preload overlay commands
- call into the existing voice-turn service
- publish current overlay voice state back to main process
- close overlay on `Escape`

Recommended command handling:

```ts
if (command === "start-recording") startRecording();
if (command === "stop-recording") stopRecording();
if (command === "cancel-and-hide") {
  cancelInteraction();
  await window.electronAPI.overlay.hide();
}
```

- [ ] **Step 2: Mirror voice state back to main process**

Watch the existing voice state and map:

```ts
loading/not_ready -> "idle"
ready -> "idle"
recording -> "recording"
thinking -> "processing"
speaking -> "speaking"
```

- [ ] **Step 3: Build the compact overlay view**

The view should include:

- compact waveform / audio bars
- current status label
- shortcut hint row
- no full app shell
- no topbar
- transparent background outside the compact card

- [ ] **Step 4: Handle `Esc` inside renderer**

Bind a keydown listener:

```ts
if (event.key === "Escape") {
  cancelInteraction();
  await window.electronAPI.overlay.hide();
}
```

- [ ] **Step 5: Add overlay renderer entry**

Mount:

```ts
import { createApp } from "vue";
import OverlayView from "./OverlayView.vue";

createApp(OverlayView).mount("#app");
```

- [ ] **Step 6: Ensure Electron Forge/Vite knows about the overlay entry**

Update the current renderer config so the overlay window has its own HTML/entry target.

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/views/overlay apps/electron/package.json apps/electron/forge.config.ts
git commit -m "feat: add overlay renderer view"
```

### Task 8: Wire Main Process IPC and Overlay Lifecycle

**Files:**
- Modify: `apps/electron/src/main.ts`
- Modify: `apps/electron/src/main-process/services/overlayWindowController.ts`
- Test: manual runtime verification

- [ ] **Step 1: Instantiate overlay controllers in `main.ts`**

Create:

```ts
const overlayWindowController = createOverlayWindowController();
const overlayHotkeyController = createOverlayHotkeyController({ ...deps });
```

- [ ] **Step 2: Add IPC handlers**

Required IPC:

```ts
ipcMain.handle("overlay:hide", async () => {
  overlayWindowController.hide();
  return true;
});

ipcMain.on("overlay:set-voice-state", (_event, state) => {
  overlayWindowController.setVoiceState(state);
});
```

- [ ] **Step 3: Reposition overlay when settings change**

Inside app settings update flow:

```ts
overlayWindowController.updatePosition(nextSettings);
```

- [ ] **Step 4: Keep overlay independent from tray/main window lifecycle**

Closing or hiding the main window to tray must not destroy the overlay controller. Quitting the app must destroy it.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main.ts apps/electron/src/main-process/services/overlayWindowController.ts
git commit -m "feat: wire overlay lifecycle and ipc"
```

### Task 9: Verify Overlay End-to-End

**Files:**
- Verify existing files only

- [ ] **Step 1: Run Electron package verification**

Run: `npm run package`
Expected: packaging completes successfully.

- [ ] **Step 2: Manual verify settings flow**

Checklist:

- open `AppSettingsModal`
- switch to `Overlay`
- click each position cell
- reopen settings and verify persistence

- [ ] **Step 3: Manual verify hotkey flow**

Checklist:

- press `Ctrl + Space` with main window visible
- confirm overlay appears and recording starts
- press `Ctrl + Space` again
- confirm recording stops and processing continues
- press `Esc`
- confirm overlay closes and active interaction cancels

- [ ] **Step 4: Manual verify tray flow**

Checklist:

- hide main window to tray
- press `Ctrl + Space`
- confirm overlay still appears and functions

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add compact assistant overlay window"
```

---

## Self-Review

### Spec coverage

- dedicated overlay window: covered by Tasks 3, 4, 8
- position setting in app settings: covered by Tasks 1, 2, 6
- `Ctrl + Space` open/start and stop: covered by Tasks 4, 7, 8
- `Esc` close/cancel: covered by Task 7
- compact dedicated renderer: covered by Task 7
- tray compatibility: covered by Tasks 3, 8, 9

### Placeholder scan

No `TBD`, `TODO`, or unresolved implementation placeholders remain.

### Type consistency

Plan uses one persisted property name:

- `overlayPosition`

Plan uses one overlay voice state set:

- `hidden`
- `idle`
- `recording`
- `processing`
- `speaking`

Plan uses one renderer command set:

- `start-recording`
- `stop-recording`
- `cancel-and-hide`
