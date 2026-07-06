<script setup lang="ts">
defineProps<{
  first?: boolean;
}>();
</script>

<template>
  <div :class="['settings-row', { 'first-row': first }]">
    <div class="row-copy">
      <slot name="copy" />
    </div>
    <div class="row-control">
      <slot name="control" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;
@use "@/assets/styles/tokens.scss" as *;

.settings-row { @include settings-row; }
.first-row { border-top: 0; }
.row-copy { @include settings-row-copy; }
.row-control { display: flex; align-items: center; justify-content: flex-end; min-width: 180px; }

.row-copy :deep(strong) {
  color: $color-text-primary;
  font-size: 13px;
  font-weight: 500;
}

.row-copy :deep(span) {
  max-width: 350px;
  
  font-size: 12px;
  line-height: 1.3;
  
  color: $color-text-muted;
}

@media (max-width: 900px) {
  .settings-row { grid-template-columns: 1fr; }
  .row-control { width: 100%; }
}
</style>
