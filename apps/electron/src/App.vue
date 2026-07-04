<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import AppView from "./shared/components/layout/AppView.vue";
import TopbarComponent from "./shared/components/layout/TopbarComponent.vue";
import TopbarLeftComponent from "./shared/components/layout/Topbar/TopbarLeftComponent.vue";
import TopbarMiddleComponent from "./shared/components/layout/Topbar/TopbarMiddleComponent.vue";
import TopbarRightComponent from "./shared/components/layout/Topbar/TopbarRightComponent.vue";
import BaseToast from "./shared/components/Base/BaseToast.vue";
import { useToast } from "./shared/utils/toast";
import StatusBarComponent from "./shared/components/layout/StatusBarComponent.vue";
import { useAppSettingsService } from "./shared/services/appSettingsService";

const toast = useToast();
const { loadSettings } = useAppSettingsService();

// Intercept browser console errors and unhandled promise rejections
// so they appear as toast notifications instead of being silent
const originalConsoleError = console.error;
const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
  const msg =
    e.reason instanceof Error
      ? e.reason.message
      : String(e.reason ?? "Unhandled error");
  toast.error(msg, 6000);
};
const handleWindowError = (e: ErrorEvent) => {
  toast.error(e.message ?? "An unexpected error occurred", 6000);
};

onMounted(() => {
  void loadSettings();

  // Patch console.error to also show a toast
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    const msg = args
      .map((a) => (a instanceof Error ? a.message : String(a)))
      .join(" ");
    toast.error(msg, 6000);
  };

  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleWindowError);
});

onBeforeUnmount(() => {
  console.error = originalConsoleError;
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  window.removeEventListener("error", handleWindowError);
});
</script>

<template>
  <main id="app-layout">
    <TopbarComponent>
      <template #topbar-left><TopbarLeftComponent /></template>
      <template #topbar-middle><TopbarMiddleComponent /></template>
      <template #topbar-right><TopbarRightComponent /></template>
    </TopbarComponent>

    <div id="main__content">
      <AppView />
    </div>

    <StatusBarComponent />

    <!-- Global toast overlay -->
    <BaseToast />
  </main>
</template>

<style scoped lang="scss">
#app-layout {
  @include app-layout;
}

#main__content {
  @include app-main-content-layout;
  @include app-main-content-style;
}
</style>
