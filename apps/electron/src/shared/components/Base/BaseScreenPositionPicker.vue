<script setup lang="ts">
import { APP_OVERLAY_POSITIONS, type AppOverlayPosition } from "../../types/app-settings";

const props = defineProps<{
  modelValue: AppOverlayPosition;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: AppOverlayPosition): void;
}>();

const POSITION_LABELS: Record<AppOverlayPosition, string> = {
  "top-left": "Top left",
  "top-center": "Top center",
  "top-right": "Top right",
  left: "Left",
  center: "Center",
  right: "Right",
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom center",
  "bottom-right": "Bottom right",
};
</script>

<template>
  <div class="screen-position-picker" role="radiogroup" aria-label="Overlay position">
    <button
      v-for="position in APP_OVERLAY_POSITIONS"
      :key="position"
      type="button"
      :class="['position-cell', { active: position === props.modelValue }]"
      :aria-pressed="position === props.modelValue"
      :title="POSITION_LABELS[position]"
      @click="emit('update:modelValue', position)"
    >
      <span class="mini-screen">
        <span :class="['overlay-dot', position]" />
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/tokens.scss" as *;

.screen-position-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  width: 240px;
}

.position-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid $color-border-default;
  border-radius: 10px;
  background: $color-surface;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;

  &:hover {
    border-color: $color-border-active;
    background: $color-base;
  }

  &.active {
    border-color: $color-app-accent;
    background: color-mix(in srgb, $color-app-accent 10%, $color-surface 90%);
  }
}

.mini-screen {
  position: relative;
  width: 52px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid $color-border-default;
  background: $color-base;
}

.overlay-dot {
  position: absolute;
  width: 12px;
  height: 8px;
  border-radius: 999px;
  background: $color-app-accent;

  &.top-left { top: 5px; left: 5px; }
  &.top-center { top: 5px; left: 50%; transform: translateX(-50%); }
  &.top-right { top: 5px; right: 5px; }
  &.left { top: 50%; left: 5px; transform: translateY(-50%); }
  &.center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
  &.right { top: 50%; right: 5px; transform: translateY(-50%); }
  &.bottom-left { bottom: 5px; left: 5px; }
  &.bottom-center { bottom: 5px; left: 50%; transform: translateX(-50%); }
  &.bottom-right { bottom: 5px; right: 5px; }
}
</style>
