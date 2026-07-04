<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { computed, inject, nextTick, onBeforeUnmount, ref, useSlots } from "vue";
import type { Component } from "vue";
import { baseMenuDropdownContextKey } from "./baseMenuDropdown.context";

const props = defineProps<{
  iconLeft?: Component;
  label: string;
  iconRight?: Component;
  shortcut?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
}>();

const slots = useSlots();
const menuContext = inject(baseMenuDropdownContextKey, null);
const rootRef = ref<HTMLElement | null>(null);
const isSubMenuOpen = ref(false);
const subMenuDirection = ref<"left" | "right">("right");
const hasSubMenu = computed(() => Boolean(slots.default));
let openTimer: ReturnType<typeof setTimeout> | null = null;

const clearOpenTimer = () => {
  if (openTimer !== null) {
    clearTimeout(openTimer);
    openTimer = null;
  }
};

const updateSubMenuDirection = () => {
  const item = rootRef.value;
  const panel = rootRef.value?.querySelector(".submenu-host > *") as HTMLElement | null;

  if (!item || !panel) {
    return;
  }

  const itemRect = item.getBoundingClientRect();
  const panelWidth = Math.max(panel.offsetWidth, 220);
  const spaceRight = window.innerWidth - itemRect.right;
  const spaceLeft = itemRect.left;

  if (spaceRight >= panelWidth + 8) {
    subMenuDirection.value = "right";
    return;
  }

  if (spaceLeft >= panelWidth + 8) {
    subMenuDirection.value = "left";
    return;
  }

  subMenuDirection.value = spaceRight >= spaceLeft ? "right" : "left";
};

const openSubMenu = () => {
  if (!hasSubMenu.value || props.disabled) {
    return;
  }

  clearOpenTimer();
  openTimer = setTimeout(() => {
    isSubMenuOpen.value = true;
    nextTick(() => updateSubMenuDirection());
  }, 200);
};

const closeSubMenu = () => {
  clearOpenTimer();
  isSubMenuOpen.value = false;
};

const handleClick = () => {
  if (props.disabled) {
    return;
  }

  if (hasSubMenu.value) {
    clearOpenTimer();
    isSubMenuOpen.value = !isSubMenuOpen.value;

    if (isSubMenuOpen.value) {
      nextTick(() => updateSubMenuDirection());
    }

    return;
  }

  emit("click");
  menuContext?.closeAll();
};

onBeforeUnmount(() => {
  clearOpenTimer();
});
</script>

<template>
  <div
    ref="rootRef"
    class="base-menu-dropdown-item-wrap"
    @mouseenter="openSubMenu"
    @mouseleave="closeSubMenu"
  >
    <button
      :class="['base-menu-dropdown-item', { disabled, open: isSubMenuOpen }]"
      :disabled="disabled"
      type="button"
      @click="handleClick"
    >
      <span class="item-main">
        <span v-if="iconLeft" class="item-icon item-icon-left">
          <component :is="iconLeft" />
        </span>
        <span class="item-label">{{ label }}</span>
      </span>

      <span class="item-side">
        <template v-if="hasSubMenu">
          <ChevronRight :size="14" />
        </template>
        <template v-else>
          <span v-if="shortcut" class="item-shortcut">{{ shortcut }}</span>
          <span v-else-if="iconRight" class="item-icon item-icon-right">
            <component :is="iconRight" />
          </span>
        </template>
      </span>
    </button>

    <div
      v-if="hasSubMenu && isSubMenuOpen"
      :class="['submenu-host', `submenu-${subMenuDirection}`]"
    >
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.base-menu-dropdown-item-wrap {
  position: relative;
}

.base-menu-dropdown-item {
  @include base-menu-dropdown-item;

  &.disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &.open:not(.disabled),
  &:hover:not(.disabled) {
    background: $color-dropdown-item-hover;
    color: $color-text-primary;
  }
}

.item-main,
.item-side {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.item-main {
  min-width: 0;
  flex: 1;
}

.item-label {
  @include base-menu-dropdown-item-label;
}

.item-shortcut {
  @include base-menu-dropdown-shortcut;
}

.item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon-left :deep(svg),
.item-icon-right :deep(svg),
.item-side :deep(svg) {
  width: 14px;
  height: 14px;
  stroke-width: 1.7;
}

.submenu-host {
  position: absolute;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: flex-start;
}

.submenu-right {
  left: 100%;
  padding-left: 6px;
}

.submenu-left {
  right: 100%;
  padding-right: 6px;
}
</style>
