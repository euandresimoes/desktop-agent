<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";

export interface BaseDropdownOption {
  id: string;
  label: string;
  description?: string;
}

const props = defineProps<{
  options: BaseDropdownOption[];
  selectedId?: string | null;
  align?: "left" | "right";
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const openDirection = ref<"up" | "down">("up");

const lastOptionId = computed(
  () => props.options[props.options.length - 1]?.id
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
  const trigger = rootRef.value?.querySelector(".dropdown-trigger") as HTMLElement | null;
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
    return;
  }

  document.removeEventListener("mousedown", handleClickOutside);
};

const handleSelect = (id: string) => {
  emit("select", id);
  close();
};

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<template>
  <div ref="rootRef" :class="['base-dropdown', `align-${align || 'left'}`]">
    <button class="dropdown-trigger" type="button" @click="toggle">
      <slot />
    </button>

    <div v-if="isOpen" :class="['dropdown-panel', `open-${openDirection}`]">
      <button
        v-for="option in options"
        :key="option.id"
        :class="['dropdown-option', { active: option.id === selectedId, 'is-last': option.id === lastOptionId }]"
        type="button"
        @click="handleSelect(option.id)"
      >
        <span class="option-label">{{ option.label }}</span>
        <span v-if="option.description" class="option-description">
          {{ option.description }}
        </span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.base-dropdown {
  position: relative;
  min-width: 0;
}

.dropdown-trigger {
  @include base-dropdown-trigger;
}

.dropdown-panel {
  @include base-dropdown-panel;
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

.align-right .dropdown-panel {
  right: 0;
  left: auto;
}

.dropdown-option {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: $color-text-secondary;
  cursor: pointer;

  &.active {
    background: $color-dropdown-item-active;
    color: $color-text-primary;
  }

  &:hover {
    background: $color-dropdown-item-hover;
    color: $color-text-primary;
  }

  &.is-last {
    border-bottom: 0;
  }
}

.option-label {
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-description {
  color: $color-text-muted;
  font-size: 11px;
  text-align: left;
}
</style>
