<script setup lang="ts">
import { nextTick, onBeforeUnmount, provide, ref } from "vue";
import { baseMenuDropdownContextKey } from "./baseMenuDropdown.context";

const props = withDefaults(defineProps<{
  align?: "left" | "right";
}>(), {
  align: "left",
});

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const openDirection = ref<"down" | "up">("down");

const close = () => {
  isOpen.value = false;
  document.removeEventListener("mousedown", handleClickOutside);
};

provide(baseMenuDropdownContextKey, {
  closeAll: close,
});

const handleClickOutside = (event: MouseEvent) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    close();
  }
};

const updateDirection = () => {
  const trigger = rootRef.value?.querySelector(".menu-dropdown-trigger-host") as HTMLElement | null;
  const panel = rootRef.value?.querySelector(".menu-dropdown-panel") as HTMLElement | null;

  if (!trigger || !panel) {
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const panelHeight = Math.max(panel.offsetHeight, 120);
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow >= panelHeight + 8) {
    openDirection.value = "down";
    return;
  }

  if (spaceAbove >= panelHeight + 8) {
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

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<template>
  <div ref="rootRef" :class="['base-menu-dropdown', `align-${align}`]">
    <div class="menu-dropdown-trigger-host" @click="toggle">
      <slot name="trigger" :is-open="isOpen" />
    </div>

    <div v-if="isOpen" :class="['menu-dropdown-panel', `open-${openDirection}`]">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.base-menu-dropdown {
  position: relative;
  min-width: 0;
  height: 100%;
  -webkit-app-region: no-drag;
}

.menu-dropdown-trigger-host {
  display: flex;
  min-width: 0;
  height: 100%;
  align-items: stretch;
  cursor: pointer;
}

.menu-dropdown-panel {
  @include base-menu-dropdown-panel;
  padding: 6px;
  -webkit-app-region: no-drag;
}

.open-down {
  top: calc(100% + 6px);
  bottom: auto;
}

.open-up {
  bottom: calc(100% + 6px);
  top: auto;
}

.align-right .menu-dropdown-panel {
  right: 0;
  left: auto;
}
</style>
