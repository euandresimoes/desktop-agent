<script setup lang="ts"></script>

<template>
  <header id="app-topbar">

    <div class="topbar-left">
      <slot name="topbar-left"/>
    </div>

    <div class="topbar-middle">
      <slot name="topbar-middle"/>
    </div>

    <div class="topbar-right">
      <slot name="topbar-right"/>
    </div>

  </header>
</template>

<style scoped lang="scss">
#app-topbar {
  @include app-topbar-layout;
  @include app-topbar-style;
}

.topbar-left,
.topbar-middle,
.topbar-right {
  width: 100%;
  height: 100%;

  display: flex;
}
</style>
