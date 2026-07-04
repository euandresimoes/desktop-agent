<script setup lang="ts">
import BaseThemeCardItem from "./BaseThemeCardItem.vue";
import type { AppThemeDefinition } from "../../config/appThemes";

defineProps<{
  title: string;
  description: string;
  themes: AppThemeDefinition[];
  modelValue: string;
  first?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <div :class="['theme-row', { 'first-row': first }]">
    <div class="row-copy">
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
    </div>

    <div class="theme-grid">
      <BaseThemeCardItem
        v-for="theme in themes"
        :id="theme.id"
        :key="theme.id"
        :label="theme.label"
        :selected="theme.id === modelValue"
        :bg-color="theme.bgColor"
        :surface-color="theme.surfaceColor"
        :component-color="theme.componentColor"
        :border-color="theme.borderColor"
        :accent-color="theme.accentColor"
        :muted-color="theme.mutedColor"
        @select="emit('update:modelValue', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;
@use "@/assets/styles/tokens.scss" as *;

.theme-row {
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

.theme-grid {
  @include settings-theme-grid;
  justify-content: flex-start;
}
</style>
