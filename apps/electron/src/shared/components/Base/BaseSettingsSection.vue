<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="settings-section">
    <h3 class="section-title">{{ title }}</h3>
    <div class="settings-panel">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.section-title { @include settings-section-title; }
.settings-panel { @include settings-compact-panel; }
</style>
