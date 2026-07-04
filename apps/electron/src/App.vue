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
import { AppHttpError } from "./shared/utils/http";

const toast = useToast();
const { loadSettings } = useAppSettingsService();

const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
  if (e.reason instanceof AppHttpError) {
    console.error("[frontend] unhandled backend error", {
      message: e.reason.message,
      status: e.reason.status,
      source: e.reason.source,
      requestId: e.reason.requestId,
      details: e.reason.details,
      payload: e.reason.payload,
    });
    toast.error(e.reason.message, 6000);
    return;
  }

  const msg = e.reason instanceof Error
    ? e.reason.message
    : String(e.reason ?? "Unhandled error");
  console.error("[frontend] unhandled rejection", e.reason);
  toast.error(msg, 6000);
};
const handleWindowError = (e: ErrorEvent) => {
  console.error("[frontend] window error", e.error ?? e.message);
  toast.error(e.message ?? "An unexpected error occurred", 6000);
};

onMounted(() => {
  void loadSettings();

  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleWindowError);
});

onBeforeUnmount(() => {
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
