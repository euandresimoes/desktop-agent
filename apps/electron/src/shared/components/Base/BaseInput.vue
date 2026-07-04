<script setup lang="ts">
defineProps<{
  modelValue?: string | number;
  type?: string;
  placeholder?: string;
  readonly?: boolean;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <input
    class="base-input"
    :type="type || 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :min="min"
    :max="max"
    :step="step"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped lang="scss">
.base-input {
  @include base-input;
}
</style>
