<script setup lang="ts">
defineProps<{
  id: string;
  label: string;
  selected?: boolean;
  bgColor: string;
  surfaceColor: string;
  componentColor: string;
  borderColor: string;
  accentColor: string;
  mutedColor: string;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();
</script>

<template>
  <button
    :class="['theme-card', { selected }]"
    :style="{
      '--theme-bg': bgColor,
      '--theme-surface': surfaceColor,
      '--theme-component': componentColor,
      '--theme-border': borderColor,
      '--theme-accent': accentColor,
      '--theme-muted': mutedColor,
    }"
    type="button"
    @click="emit('select', id)"
  >
    <div class="theme-preview">
      <div class="theme-window">
        <div class="theme-toolbar">
          <div class="toolbar-group left">
            <span class="toolbar-pill small" />
            <span class="toolbar-pill small" />
          </div>

          <span class="toolbar-pill center" />

          <div class="toolbar-group right">
            <span class="toolbar-dot muted" />
            <span class="toolbar-dot accent" />
            <span class="toolbar-dot muted" />
          </div>
        </div>

        <div class="theme-body">
          <div class="body-line title" />
          <div class="body-line wide" />

          <div class="body-row">
            <span class="body-line compact accent-line" />
            <span class="body-line compact" />
            <span class="body-line compact" />
          </div>

          <div class="body-action" />
        </div>
      </div>
    </div>

    <span class="theme-label">{{ label }}</span>
  </button>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;
@use "@/assets/styles/tokens.scss" as *;

.theme-card {
  @include theme-card-item;

  &:hover .theme-preview {
    border-color: $color-theme-card-hover-border;
    transform: translateY(-1px);
  }

  &.selected .theme-preview {
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 1px $color-theme-card-selected-ring;
  }

  &.selected .theme-label {
    color: $color-text-primary;
  }
}

.theme-preview {
  @include theme-card-preview;
}

.theme-window {
  height: 100%;
  border-radius: 8px;
  border: 1px solid var(--theme-border);
  background: var(--theme-bg);
  overflow: hidden;
}

.theme-toolbar {
  height: 22px;
  padding: 0 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-border) 82%, transparent);
  background: color-mix(in srgb, var(--theme-surface) 85%, var(--theme-bg));
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-pill {
  display: inline-flex;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-muted) 58%, transparent);

  &.small {
    width: 11px;
    height: 4px;
  }

  &.center {
    width: 28px;
    height: 5px;
    justify-self: center;
  }
}

.toolbar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-muted);

  &.accent {
    background: var(--theme-accent);
  }
}

.theme-body {
  position: relative;
  height: calc(100% - 22px);
  padding: 12px 11px 10px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-surface) 28%, transparent),
      transparent 60%
    );
}

.body-line {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--theme-component);

  &.title {
    width: 27%;
    margin-bottom: 12px;
  }

  &.wide {
    width: 70%;
    margin-bottom: 10px;
  }

  &.compact {
    width: 14%;
    min-width: 14px;
  }

  &.accent-line {
    background: var(--theme-accent);
  }
}

.body-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.body-action {
  position: absolute;
  right: 11px;
  top: 35px;
  width: 17px;
  height: 12px;
  border-radius: 3px;
  background: var(--theme-accent);
}

.theme-label {
  @include theme-card-label;
  width: 100%;
  text-align: center;
}
</style>
