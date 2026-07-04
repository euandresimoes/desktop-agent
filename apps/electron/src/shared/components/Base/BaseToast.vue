<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "@lucide/vue";
import { useToast, type Toast, type ToastType } from "../../utils/toast";

const { toasts, dismiss } = useToast();

// Map toast type → icon component and CSS class
const iconMap: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

function iconFor(type: ToastType) {
  return iconMap[type];
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-wrapper" aria-live="polite">
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast-item', toast.type]"
          role="alert"
        >
          <!-- Icon -->
          <component :is="iconFor(toast.type)" class="toast-icon" :size="18" />

          <!-- Message -->
          <p class="toast-message">{{ toast.message }}</p>

          <!-- Dismiss button -->
          <button class="toast-close" @click="dismiss(toast.id)" :aria-label="'Dismiss notification'">
            <X :size="14" />
          </button>

          <!-- Progress bar -->
          <div
            class="toast-progress"
            :style="{ '--duration': `${toast.duration}ms` }"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style lang="scss">
@use "@/assets/styles/tokens.scss" as *;

// Global (not scoped) so Teleport works correctly
.toast-wrapper {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  pointer-events: none;
  max-width: 420px;
  width: calc(100vw - 48px);
}

.toast-list {
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
}

.toast-item {
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: 1fr auto;
  align-items: center;
  gap: 10px 12px;
  padding: 14px 16px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: $color-toast-bg;
  box-shadow: 0 8px 24px $color-toast-shadow, 0 0 0 1px $color-toast-outline;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(12px);

  &.success {
    border-color: $color-toast-success-border;
    .toast-icon { color: $color-toast-success; }
    .toast-progress { background: $color-toast-success; }
  }
  &.error {
    border-color: $color-toast-error-border;
    .toast-icon { color: $color-toast-error; }
    .toast-progress { background: $color-toast-error; }
  }
  &.warning {
    border-color: $color-toast-warning-border;
    .toast-icon { color: $color-toast-warning; }
    .toast-progress { background: $color-toast-warning; }
  }
  &.info {
    border-color: $color-toast-info-border;
    .toast-icon { color: $color-toast-info; }
    .toast-progress { background: $color-toast-info; }
  }
}

.toast-icon {
  grid-column: 1;
  grid-row: 1;
  flex-shrink: 0;
}

.toast-message {
  grid-column: 2;
  grid-row: 1;
  font-size: 13px;
  line-height: 1.45;
  color: $color-toast-text;
  margin: 0;
  word-break: break-word;
}

.toast-close {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: $color-toast-close-text;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;

  &:hover {
    color: $color-toast-close-text-hover;
    background: $color-toast-close-bg-hover;
  }
}

.toast-progress {
  grid-column: 1 / -1;
  grid-row: 2;
  height: 2px;
  border-radius: 99px;
  animation: toast-shrink var(--duration, 4500ms) linear forwards;
  transform-origin: left;
}

@keyframes toast-shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

// TransitionGroup animations
.toast-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(32px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(32px) scale(0.95);
}
.toast-move {
  transition: transform 0.25s ease;
}
</style>
