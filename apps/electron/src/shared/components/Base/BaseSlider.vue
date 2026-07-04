<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
}>();

const minValue = computed(() => props.min ?? 0);
const maxValue = computed(() => props.max ?? 100);
const currentValue = computed(() => props.modelValue ?? minValue.value);

const progress = computed(() => {
  const range = maxValue.value - minValue.value;

  if (range <= 0) {
    return 0;
  }

  return ((currentValue.value - minValue.value) / range) * 100;
});

const displayValue = computed(() =>
  props.formatValue ? props.formatValue(currentValue.value) : `${currentValue.value}`,
);
</script>

<template>
  <div class="base-slider-row">
    <input
      class="base-slider"
      type="range"
      :value="currentValue"
      :min="minValue"
      :max="maxValue"
      :step="step ?? 1"
      :disabled="disabled"
      :style="{ '--slider-progress': `${progress}%` }"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <span class="base-slider-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped lang="scss">
.base-slider-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
}

.base-slider {
  @include base-slider;
}

.base-slider-value {
  @include base-slider-value;
}
</style>
