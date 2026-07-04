<script setup lang="ts">
import { Pipette, Sparkles } from "@lucide/vue";
import { computed } from "vue";
import BaseOption from "./BaseOption.vue";
import type { AppAccentDefinition } from "../../config/appAccents";
import type { AppAccentMode } from "../../types/app-settings";

const props = defineProps<{
  title: string;
  description: string;
  presets: AppAccentDefinition[];
  accentMode: AppAccentMode;
  accentColor: string;
  themeAccentColor: string;
  supportsCustomAccent: boolean;
  first?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:accentMode", value: AppAccentMode): void;
  (e: "update:accentColor", value: string): void;
}>();

const normalizedAccentColor = computed(() => props.accentColor.toLowerCase());
const selectedPresetId = computed(
  () =>
    props.presets.find(
      (preset) => preset.hex.toLowerCase() === normalizedAccentColor.value,
    )?.id ?? "custom",
);

const useThemeAccent = () => {
  emit("update:accentMode", "theme");
};

const usePresetAccent = (hex: string) => {
  emit("update:accentMode", "custom");
  emit("update:accentColor", hex);
};

const useCustomAccent = (value: string) => {
  emit("update:accentMode", "custom");
  emit("update:accentColor", value);
};
</script>

<template>
  <div :class="['accent-row', { 'first-row': first }]">
    <div class="row-copy">
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
    </div>

    <div class="accent-content">
      <div class="accent-mode-row">
        <BaseOption
          label="Use theme accent"
          :checked="accentMode === 'theme'"
          @select="useThemeAccent"
        />
        <span class="theme-accent-hint">
          Current theme accent
          <strong>{{ themeAccentColor }}</strong>
        </span>
      </div>

      <div :class="['accent-grid', { disabled: !supportsCustomAccent }]">
        <button
          v-for="preset in presets"
          :key="preset.id"
          :class="['accent-swatch', { selected: accentMode === 'custom' && selectedPresetId === preset.id }]"
          type="button"
          :disabled="!supportsCustomAccent"
          @click="usePresetAccent(preset.hex)"
        >
          <span class="accent-chip">
            <span class="accent-dot" :style="{ background: preset.hex }" />
          </span>
        </button>

        <div
          :class="[
            'accent-swatch',
            'custom-swatch',
            {
              selected: accentMode === 'custom' && selectedPresetId === 'custom',
              disabled: !supportsCustomAccent,
            },
          ]"
        >
          <label class="accent-chip custom-chip">
            <span class="custom-chip-inner">
              <Pipette :size="16" />
              <input
                class="native-color-input"
                type="color"
                :value="accentColor"
                :disabled="!supportsCustomAccent"
                @input="useCustomAccent(($event.target as HTMLInputElement).value)"
              />
            </span>
          </label>
        </div>
      </div>

      <div v-if="!supportsCustomAccent" class="accent-disabled-note">
        <Sparkles :size="14" />
        <span>This theme uses its own accent palette.</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;
@use "@/assets/styles/tokens.scss" as *;

.accent-row {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 0;
  border-top: 1px solid $color-settings-row-border;
}

.first-row {
  border-top: 0;
}

.row-copy {
  @include settings-row-copy;
}

.accent-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.accent-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.theme-accent-hint {
  color: $color-text-muted;
  font-size: 12px;

  strong {
    color: $color-text-primary;
    font-weight: 500;
    margin-left: 6px;
  }
}

.accent-grid {
  @include accent-swatch-grid;
  grid-template-columns: repeat(auto-fit, minmax(34px, 34px));
  gap: 10px;

  &.disabled {
    opacity: 0.58;
  }
}

.accent-swatch {
  @include accent-swatch-button;
  gap: 0;

  &:not(.disabled):hover:not(:disabled) .accent-chip {
    border-color: $color-accent-swatch-hover-border;
  }

  &.selected .accent-chip {
    border-color: $color-app-accent;
    box-shadow: 0 0 0 1px $color-accent-swatch-selected-ring;
  }

  &.disabled {
    cursor: default;
  }
}

.accent-chip {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.accent-dot {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 0;
  box-shadow: none;
}

.custom-swatch {
  align-items: center;
}

.custom-chip {
  position: relative;
  cursor: pointer;
  border-color: $color-accent-custom-border;
  background: $color-accent-custom-bg;
}

.custom-chip-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $color-accent-custom-icon;
}

.custom-swatch.selected .custom-chip {
  border-color: v-bind(accentColor);
}

.native-color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.accent-disabled-note {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: $color-text-muted;
  font-size: 12px;
}
</style>
