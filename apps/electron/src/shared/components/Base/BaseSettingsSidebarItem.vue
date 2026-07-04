<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon?: Component;
  label: string;
  active?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <button :class="['sidebar-item', { active }]" type="button" @click="emit('click')">
    <component :is="icon" v-if="icon" :size="16" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.sidebar-item { @include settings-sidebar-item; }
</style>
