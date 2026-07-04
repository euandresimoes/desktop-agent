<script setup lang="ts">
import { computed } from "vue";
import AIModelDownloaderModal from "../../../shared/components/Downloader/AIModelDownloaderModal.vue";
import type { HubInstallJob, HubModelSearchResult, HubModelType } from "../../../shared/services/hubDownloadsService";
import type { NewLlmForm, NewSttForm, NewVoiceForm } from "../services/settingsService";

const props = defineProps<{
  isOpen: boolean;
  modelType: HubModelType;
  isSaving: boolean;
  llmModel: NewLlmForm;
  sttModel: NewSttForm;
  ttsModel: NewVoiceForm;
  hubSearchQuery: string;
  hubPipelineTag: string;
  isHubSearching: boolean;
  hubResults: HubModelSearchResult[];
  selectedHubFiles: Record<string, string>;
  activeHubInstallJob: HubInstallJob | null;
  nextCursor: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update:modelType", value: HubModelType): void;
  (e: "pick-local-primary"): void;
  (e: "pick-local-secondary"): void;
  (e: "save-local"): void;
  (e: "search-hub"): void;
  (e: "load-more-hub"): void;
  (e: "start-hub-install", result: HubModelSearchResult): void;
  (e: "cancel-hub-install"): void;
  (e: "update:hubSearchQuery", value: string): void;
  (e: "update:hubPipelineTag", value: string): void;
  (e: "update:selectedHubFile", payload: { repoId: string; fileName: string }): void;
}>();

const filters = computed(() => [
  { value: "all", label: "All types" },
  { value: "text-generation", label: "Text generation" },
  { value: "automatic-speech-recognition", label: "STT" },
  { value: "text-to-speech", label: "TTS" },
]);

const localForm = computed(() => {
  if (props.modelType === "llm") {
    return props.llmModel;
  }

  if (props.modelType === "stt") {
    return props.sttModel;
  }

  return props.ttsModel;
});

const handleStartDownload = (payload: { repoId: string; fileName: string }) => {
  const result = props.hubResults.find((item) => item.repoId === payload.repoId);
  if (!result) {
    return;
  }

  emit("update:selectedHubFile", payload);
  emit("start-hub-install", result);
};
</script>

<template>
  <AIModelDownloaderModal
    :is-open="isOpen"
    title="Add AI Model"
    :model-type="modelType"
    search-placeholder="Search repositories on Hugging Face..."
    :search-query="hubSearchQuery"
    :active-filter="hubPipelineTag"
    :filters="filters"
    :is-searching="isHubSearching"
    :results="hubResults"
    :selected-files="selectedHubFiles"
    :active-job="activeHubInstallJob"
    :next-cursor="nextCursor"
    :local-form="localForm"
    :is-saving-local="isSaving"
    @close="emit('close')"
    @update:model-type="emit('update:modelType', $event)"
    @update:search-query="emit('update:hubSearchQuery', $event)"
    @update:active-filter="emit('update:hubPipelineTag', $event)"
    @update:selected-file="emit('update:selectedHubFile', $event)"
    @search="emit('search-hub')"
    @load-more="emit('load-more-hub')"
    @start-download="handleStartDownload"
    @cancel-download="emit('cancel-hub-install')"
    @pick-local-primary="emit('pick-local-primary')"
    @pick-local-secondary="emit('pick-local-secondary')"
    @save-local="emit('save-local')"
  />
</template>
