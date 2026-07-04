<script setup lang="ts">
import { X } from "@lucide/vue";
import BaseModal from "./BaseModal.vue";

defineProps<{
  isOpen: boolean;
  title: string;
  width?: string;
  height?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <BaseModal :is-open="isOpen" :width="width" :height="height" @close="emit('close')">
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <slot name="sidebar" />
      </aside>

      <main class="settings-main">
        <div class="settings-header">
          <h2>{{ title }}</h2>
          <button class="close-btn" type="button" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="scroll-area">
          <slot />
        </div>
      </main>
    </div>
  </BaseModal>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.settings-shell { @include settings-shell; }
.settings-sidebar { @include settings-sidebar; }
.settings-main { @include settings-main; }
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 8px;

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: $color-settings-header-text;
  }
}
.close-btn { @include base-modal-close-btn; }
.scroll-area { @include settings-scroll-area; padding-top: 4px; }

@media (max-width: 900px) {
  .settings-shell { flex-direction: column; }
  .settings-sidebar { width: 100%; border-right: 0; border-bottom: 1px solid $color-settings-row-border; }
}
</style>
