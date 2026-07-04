<script setup lang="ts">
defineProps<{
  isOpen: boolean;
  width?: string;
  height?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="modal-backdrop" @mousedown.self="emit('close')">
        <div
          class="modal-container"
          :style="{
            '--modal-width': width || '90vw',
            '--modal-height': height || '85vh',
          }"
        >
          <div class="modal-slot-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
@use "@/assets/styles/mixins.scss" as *;

.modal-backdrop {
  @include base-modal-backdrop;
}

.modal-container {
  @include base-modal-container;
}

.modal-slot-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.18s ease;
}

.modal-fade-enter-active .modal-container,
.modal-fade-leave-active .modal-container {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-container,
.modal-fade-leave-to .modal-container {
  opacity: 0;
}
</style>
