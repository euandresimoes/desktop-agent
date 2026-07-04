# Electron Status Bar Mic Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real microphone-reactive visualizer to the center of the Electron status bar while recording.

**Architecture:** The voice-turn service will publish recording state and current microphone volume into the shared system-status event. A dedicated status-bar visualizer component will consume that state and render compact animated bars in the center section only while `recording`.

**Tech Stack:** Vue 3, TypeScript, SCSS, Electron Forge, Vite

---

### Task 1: Expose recording state and volume to shared layout consumers

**Files:**
- Modify: `apps/electron/src/views/voice-turn/services/voiceTurnService.ts`
- Modify: `apps/electron/src/shared/components/layout/Statusbar/useSystemStatus.ts`

- [ ] **Step 1: Extend the shared status payload**
- [ ] **Step 2: Dispatch updates when recording state or volume changes**
- [ ] **Step 3: Expose `isRecording` and `currentVolume` from the shared composable**

### Task 2: Create the centered microphone visualizer component

**Files:**
- Create: `apps/electron/src/shared/components/layout/Statusbar/StatusBarMicrophoneVisualizer.vue`

- [ ] **Step 1: Render multiple narrow bars**
- [ ] **Step 2: Map live volume into varied bar heights**
- [ ] **Step 3: Keep the component visually idle outside recording**

### Task 3: Integrate the visualizer into the status bar

**Files:**
- Modify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`

- [ ] **Step 1: Add the center section content**
- [ ] **Step 2: Keep left and right sections stable**
- [ ] **Step 3: Remove temporary placeholder styling**

### Task 4: Verify the status bar update

**Files:**
- Verify: `apps/electron/src/shared/components/layout/StatusBarComponent.vue`
- Verify: `apps/electron/src/shared/components/layout/Statusbar/StatusBarMicrophoneVisualizer.vue`

- [ ] **Step 1: Run packaging/build validation**

Run:

```bash
npx electron-forge package
```

Expected: packaging completes successfully
