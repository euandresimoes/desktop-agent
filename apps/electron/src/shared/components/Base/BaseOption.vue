<script setup lang="ts">
const props = defineProps<{
  label: string;
  checked: boolean;
}>();

const emit = defineEmits<{
  (e: "select"): void;
}>();
</script>

<template>
  <button class="base-option" type="button" @click="emit('select')">
    <span :class="['marker', { checked: props.checked }]" />
    <span class="label">{{ props.label }}</span>
  </button>
</template>

<style scoped lang="scss">
.base-option {
  @include base-option;
  background: transparent;
  border: 0;
  padding: 0;
}

.marker {
  @include base-option-marker;

  &.checked {
    border-color: $color-app-accent;

    &::after {
      content: "";
      position: absolute;
      inset: 3px;
      border-radius: 50%;
      background: $color-app-accent;
    }
  }
}

.label {
  color: $color-option-text;
}
</style>
