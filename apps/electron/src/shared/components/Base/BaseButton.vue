<script setup lang="ts">
import type { Component } from 'vue';

const props = defineProps<{
  iconLeft?: Component;
  label?: string;
  iconRight?: Component;
  variant: "primary" | "secondary" | "ghost" | "danger";
  isLoading?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <button :class="['base-button', variant]" :disabled="disabled || isLoading">
    <span v-if="iconLeft" class="icon-left">
      <component :is="iconLeft" />
    </span>
    <span v-if="label">{{ label }}</span>
    <span v-if="iconRight" class="icon-right">
      <component :is="iconRight" />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.base-button {
  @include base-button;
  min-height: 32px;
  padding: 0 12px;
  white-space: nowrap;

  &.primary {
    @include button-primary;
  }
  &.secondary {
    @include button-secondary;
  }
  &.ghost {
    @include button-ghost;
  }
  &.danger {
    @include button-danger;
  }

  .icon-left,
  .icon-right {
    display: flex;
    align-items: center;
  }
}
</style>
