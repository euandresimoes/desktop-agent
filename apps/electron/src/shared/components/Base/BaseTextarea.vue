<script setup lang="ts">
defineProps<{
  modelValue?: string;
  placeholder?: string;
  readonly?: boolean;
  disabled?: boolean;
  rows?: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <textarea
    class="base-textarea"
    :value="modelValue"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :rows="rows ?? 5"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped lang="scss">
.base-textarea {
  @include base-textarea;
}
</style>
