<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Download, Minus, Plus, Settings, Square, X } from "@lucide/vue";
import BaseButton from "../../Base/BaseButton.vue";
import {
  closeWindow,
  maximizeWindow,
  minimizeWindow,
} from "../../../utils/electron-window.utils";
import { useHubDownloadsService } from "../../../services/hubDownloadsService";

const minimize = () => minimizeWindow();
const maximize = () => maximizeWindow();
const close = () => closeWindow();

const hubDownloads = useHubDownloadsService();
const isMenuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

onMounted(() => {
  void hubDownloads.refreshJobs().catch(() => undefined);
  hubDownloads.ensurePolling();
  document.addEventListener("mousedown", handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});

const handleClickOutside = (event: MouseEvent) => {
  if (!menuRef.value?.contains(event.target as Node)) {
    isMenuOpen.value = false;
  }
};

const formatBytes = (value: number | null) => {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatSpeed = (value: number) => {
  if (!value || value <= 0) return "-";
  return `${formatBytes(value)}/s`;
};

const activeCount = computed(() => hubDownloads.activeDownloads.value.length);
const buttonLabel = computed(() =>
  activeCount.value > 0 ? `${activeCount.value}` : ""
);

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const openSettings = () => {
  window.dispatchEvent(new Event("open-settings-modal"));
};

const openDownloader = () => {
  isMenuOpen.value = false;
  window.dispatchEvent(new CustomEvent("open-download-model-modal", { detail: { modelType: "llm" } }));
};
</script>

<template>
  <div id="main">
    <div id="action-btns">
      <div ref="menuRef" class="downloads-menu-wrap">
        <BaseButton
          variant="ghost"
          :icon-left="Download"
          :label="buttonLabel"
          class="downloads-btn"
          @click="toggleMenu"
        />

        <div v-if="isMenuOpen" class="downloads-menu">
          <div class="menu-header">
            <strong>Downloads</strong>
            <span>{{ hubDownloads.recentDownloads.value.length }} items</span>
          </div>

          <div class="menu-shortcuts">
            <BaseButton
              variant="ghost"
              label="Add AI Model"
              :icon-left="Plus"
              class="menu-shortcut-btn"
              @click="openDownloader"
            />
          </div>

          <div v-if="hubDownloads.recentDownloads.value.length === 0" class="menu-empty">
            No downloads yet.
          </div>

          <div v-else class="menu-list">
            <div v-for="job in hubDownloads.recentDownloads.value" :key="job.id" class="menu-item">
              <div class="menu-copy">
                <strong>{{ job.displayName }}</strong>
                <span>{{ job.repoId }}</span>
              </div>

              <div class="menu-status">
                <div class="menu-meta">
                  <span>{{ job.status }}</span>
                  <span>{{ job.progressPercent?.toFixed(0) ?? 0 }}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: `${job.progressPercent ?? 0}%` }" />
                </div>
                <div class="menu-meta compact">
                  <span>{{ formatBytes(job.downloadedBytes) }} / {{ formatBytes(job.totalBytes) }}</span>
                  <span>{{ formatSpeed(job.bytesPerSecond) }}</span>
                </div>
              </div>

              <div class="menu-actions">
                <BaseButton
                  v-if="job.status === 'pending' || job.status === 'downloading' || job.status === 'installing'"
                  variant="danger"
                  label="Cancel"
                  class="mini-btn"
                  @click="hubDownloads.cancelJob(job.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <BaseButton
        variant="ghost"
        :icon-left="Settings"
        class="topbar-utility-btn"
        @click="openSettings"
      />

      <button class="action-btn" @click="minimize()">
        <Minus :size="15" :stroke-width="1.5" />
      </button>
      <button class="action-btn" @click="maximize()">
        <Square :size="13" :stroke-width="2" />
      </button>
      <button class="action-btn" @click="close()">
        <X :size="18" :stroke-width="1.5" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
#main {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: flex-end;
  background: transparent;
}

#action-btns {
  width: auto;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.downloads-menu-wrap {
  position: relative;
  height: 100%;
  -webkit-app-region: no-drag;
}

.downloads-btn {
  width: auto;
  min-width: 40px;
  height: 100%;
  min-height: 100%;
  padding: 0 12px;
  border-radius: 0;
}

.topbar-utility-btn {
  width: auto;
  min-width: 40px;
  height: 100%;
  min-height: 100%;
  padding: 0 12px;
  border-radius: 0;
  -webkit-app-region: no-drag;
}

.downloads-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 420px;
  padding: 8px;
  border: 1px solid $color-downloads-menu-border;
  border-radius: 10px;
  background: $color-downloads-menu-bg;
  backdrop-filter: blur(14px);
  box-shadow: 0 16px 48px $color-downloads-menu-shadow;
  overflow: auto;
  z-index: 100;
}

.menu-shortcuts {
  display: flex;
  padding: 0 6px 8px;
}

.menu-shortcut-btn {
  width: 100%;
}

.menu-header,
.menu-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.menu-header {
  padding: 6px 6px 10px;

  strong {
    color: $color-text-primary;
    font-size: 13px;
    font-weight: 600;
  }

  span {
    color: $color-text-muted;
    font-size: 11px;
  }
}

.menu-empty {
  padding: 18px 10px;
  color: $color-text-muted;
  font-size: 12px;
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: $color-downloads-menu-item-bg;
}

.menu-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: $color-text-primary;
    font-size: 12px;
    font-weight: 600;
  }

  span {
    color: $color-text-muted;
    font-size: 11px;
  }
}

.menu-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.menu-meta {
  color: $color-text-muted;
  font-size: 11px;
}

.progress-track {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  background: $color-downloads-menu-progress-track;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: $color-downloads-menu-progress-fill;
}

.menu-actions {
  display: flex;
  justify-content: flex-end;
}

.mini-btn {
  width: auto;
  min-height: 26px;
  padding: 0 10px;
}

.action-btn {
  width: 3rem;
  height: 100%;
  -webkit-app-region: no-drag;
  display: flex;
  justify-content: center;
  align-items: center;
  background: $color-btn-ghost-bg;
  color: $color-btn-ghost-text;
  border: none;
  outline: none;
}

.action-btn:hover {
  background: $color-btn-ghost-bg-hover;
}

.action-btn:hover svg {
  color: $color-btn-ghost-text-hover;
}

.action-btn:last-child:hover {
  background-color: $color-btn-danger-bg-hover;
}

.action-btn:last-child:hover svg {
  color: $color-btn-danger-text-hover;
}
</style>
