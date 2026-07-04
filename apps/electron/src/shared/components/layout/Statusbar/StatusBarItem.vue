<script setup lang="ts">
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
  icon?: Component;
  label?: string;
  value?: string;
  clickable?: boolean;
}>(),
  {
    value: "",
    clickable: false,
  }
);

const emit = defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <div
    :class="['item', { clickable: props.clickable }]"
    @click="props.clickable && emit('click')"
  >
    <component :is="props.icon" v-if="props.icon" />
    <span v-if="props.label" class="item-label">{{ props.label }}</span>
    <span v-if="props.value" class="item-value">{{ props.value }}</span>
  </div>
</template>

<style lang="scss" scoped>
.item {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 5px;

  background: $color-btn-ghost-bg;
  border: 1px solid $color-btn-ghost-border;
  color: $color-btn-ghost-text;
  user-select: none;

  font-size: 11px;
  line-height: 1;

  svg {
    width: 14px;
    height: 14px;
    stroke-width: 2;
  }

  &.clickable {
    cursor: pointer;
  }

  &.clickable:hover {
    background: $color-btn-ghost-bg-hover;
    border: 1px solid $color-btn-ghost-border-hover;
    color: $color-btn-ghost-text-hover;
  }
}

.item-label {
  color: $color-text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.item-value {
  min-width: 0;
  max-width: 160px;
  overflow: hidden;
  color: $color-text-primary;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
