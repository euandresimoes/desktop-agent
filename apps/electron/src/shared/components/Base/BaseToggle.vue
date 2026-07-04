<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();
</script>

<template>
  <button
    :class="['base-toggle', { 'is-active': props.modelValue }]"
    :disabled="disabled"
    type="button"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span class="thumb" />
  </button>
</template>

<style scoped lang="scss">
.base-toggle {
  @include base-toggle;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.thumb {
  @include base-toggle-thumb;
}

.is-active .thumb {
  transform: translateX(14px);
}
</style>
