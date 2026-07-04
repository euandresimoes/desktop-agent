<template>
  <div class="base-menu-dropdown-submenu">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.base-menu-dropdown-submenu {
  @include base-menu-dropdown-panel;
  min-width: 220px;
  padding: 6px;
  position: static;
  left: auto;
  right: auto;
  top: auto;
  bottom: auto;
}
</style>
