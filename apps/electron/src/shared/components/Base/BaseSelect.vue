<script setup lang="ts">
import { ChevronDown, Check } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, ref } from "vue";

export interface BaseSelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue?: string;
  options: BaseSelectOption[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const openDirection = ref<"up" | "down">("up");

const selectedOption = () =>
  props.options.find((option) => option.value === props.modelValue);

const lastOptionValue = computed(
  () => props.options[props.options.length - 1]?.value
);

const getScrollContainer = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflow = style.overflow;
    const overflowX = style.overflowX;

    if (
      overflowY !== "visible" ||
      overflow !== "visible" ||
      overflowX !== "visible"
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

const close = () => {
  isOpen.value = false;
  document.removeEventListener("mousedown", handleClickOutside);
};

const handleClickOutside = (event: MouseEvent) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    close();
  }
};

const updateDirection = () => {
  const trigger = rootRef.value?.querySelector(".select-trigger") as HTMLElement | null;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const estimatedPanelHeight = Math.min(props.options.length, 6) * 40 + 16;
  const boundsContainer = getScrollContainer(rootRef.value);

  if (boundsContainer) {
    const containerRect = boundsContainer.getBoundingClientRect();
    const spaceAbove = rect.top - containerRect.top;
    const spaceBelow = containerRect.bottom - rect.bottom;

    if (spaceBelow >= estimatedPanelHeight) {
      openDirection.value = "down";
      return;
    }

    if (spaceAbove >= estimatedPanelHeight) {
      openDirection.value = "up";
      return;
    }

    openDirection.value = spaceBelow >= spaceAbove ? "down" : "up";
    return;
  }

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow >= estimatedPanelHeight) {
    openDirection.value = "down";
    return;
  }

  if (spaceAbove >= estimatedPanelHeight) {
    openDirection.value = "up";
    return;
  }

  openDirection.value = spaceBelow >= spaceAbove ? "down" : "up";
};

const toggle = () => {
  isOpen.value = !isOpen.value;

  if (isOpen.value) {
    document.addEventListener("mousedown", handleClickOutside);
    nextTick(() => updateDirection());
  } else {
    document.removeEventListener("mousedown", handleClickOutside);
  }
};

const select = (value: string) => {
  emit("update:modelValue", value);
  close();
};

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<template>
  <div ref="rootRef" class="base-select">
    <button class="select-trigger" type="button" @click="toggle">
      <span class="select-trigger-label">{{ selectedOption()?.label || placeholder || "Select" }}</span>
      <ChevronDown :size="14" />
    </button>

    <div v-if="isOpen" :class="['select-panel', `open-${openDirection}`]">
      <button
        v-for="option in options"
        :key="option.value"
        :class="['select-option', { active: option.value === modelValue, 'is-last': option.value === lastOptionValue }]"
        type="button"
        @click="select(option.value)"
      >
        <Check v-if="option.value === modelValue" :size="14" />
        <span>{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.base-select {
  position: relative;
  min-width: 180px;
}

.select-trigger {
  @include base-select-trigger;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.select-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-panel {
  @include base-dropdown-panel;
  min-width: 100%;
  z-index: 1200;
  padding: 6px;
  gap: 4px;
  border: 1px solid $color-dropdown-border;
  overflow: visible;
}

.open-up {
  bottom: calc(100% + 6px);
  top: auto;
}

.open-down {
  top: calc(100% + 6px);
  bottom: auto;
}

.select-option {
  width: 100%;
  flex-direction: row;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: $color-text-secondary;
  cursor: pointer;

  text-align: start;

  &.active {
    background: $color-dropdown-item-active;
    color: $color-text-primary;
  }

  &:hover {
    background: $color-dropdown-item-hover;
    color: $color-text-primary;
  }
}
</style>
