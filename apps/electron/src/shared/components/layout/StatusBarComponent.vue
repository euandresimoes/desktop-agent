<script setup lang="ts">
import { Cpu, Gauge, Mic, Volume2 } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted } from "vue";
import BaseDropdown, {
  type BaseDropdownOption,
} from "../Base/BaseDropdown.vue";
import StatusBarItem from "./Statusbar/StatusBarItem.vue";
import StatusBarMicrophoneVisualizer from "./Statusbar/StatusBarMicrophoneVisualizer.vue";
import { useSystemStatus } from "./Statusbar/useSystemStatus";
import { useSettingsService } from "../../../views/voice-turn/services/settingsService";

const { activeModelItems, metricItems, isRecording, currentVolume } = useSystemStatus();
const refreshStatus = () => {
  window.dispatchEvent(new Event("refresh-status"));
};

const {
  fetchAll,
  handleSetActive,
  installedLlmModels,
  activeLlmId,
  installedSttModels,
  activeSttId,
  installedTtsVoices,
  activeVoiceId,
} = useSettingsService(refreshStatus);

const mapOptions = <T extends { id: string; name: string }>(
  items: T[]
): BaseDropdownOption[] =>
  items.map((item) => ({
    id: item.id,
    label: item.name,
    description: item.id,
  }));

const llmOptions = computed(() => mapOptions(installedLlmModels.value));
const sttOptions = computed(() => mapOptions(installedSttModels.value));
const ttsOptions = computed(() => mapOptions(installedTtsVoices.value));

onMounted(() => {
  fetchAll();
  window.addEventListener("models-library-updated", fetchAll);
});

onBeforeUnmount(() => {
  window.removeEventListener("models-library-updated", fetchAll);
});
</script>

<template>
  <div id="app-status-bar">
    <div class="status-section align-left">
      <BaseDropdown
        :options="llmOptions"
        :selected-id="activeLlmId"
        @select="handleSetActive('llm', $event)"
      >
        <StatusBarItem :icon="Cpu" :value="activeModelItems.llm" />
      </BaseDropdown>
      <BaseDropdown
        :options="sttOptions"
        :selected-id="activeSttId"
        @select="handleSetActive('stt', $event)"
      >
        <StatusBarItem :icon="Mic" :value="activeModelItems.stt" />
      </BaseDropdown>
      <BaseDropdown
        :options="ttsOptions"
        :selected-id="activeVoiceId"
        @select="handleSetActive('tts', $event)"
      >
        <StatusBarItem :icon="Volume2" :value="activeModelItems.tts" />
      </BaseDropdown>
    </div>

    <div class="status-section center">
      <StatusBarMicrophoneVisualizer
        :is-recording="isRecording"
        :current-volume="currentVolume"
      />
    </div>

    <div class="status-section align-right">
      <StatusBarItem :icon="Mic" label="STT" :value="metricItems.stt" />
      <StatusBarItem :icon="Cpu" label="LLM" :value="metricItems.llm" />
      <StatusBarItem :icon="Volume2" label="TTS" :value="metricItems.tts" />
      <StatusBarItem :icon="Gauge" label="Total" :value="metricItems.total" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "@/assets/styles/mixins.scss" as *;

#app-status-bar {
  @include app-statusbar-layout;
  @include app-statusbar-style;

  gap: 12px;
  padding: 0 12px;
  overflow: visible;
  position: relative;
}

.status-section {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: visible;
}

.align-left {
  justify-content: flex-start;
}

.center {
  justify-content: center;
  min-width: 360px;
  overflow: visible;
}

.align-right {
  justify-content: flex-end;
  overflow: hidden;
}
</style>
