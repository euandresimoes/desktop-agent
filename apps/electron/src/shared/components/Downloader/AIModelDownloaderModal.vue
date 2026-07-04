<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowLeft, Download, FileCode2, Folder, FolderOpen, Search, Volume2, Waves, X } from "@lucide/vue";
import BaseButton from "../Base/BaseButton.vue";
import BaseInput from "../Base/BaseInput.vue";
import BaseModal from "../Base/BaseModal.vue";
import BaseSelect from "../Base/BaseSelect.vue";
import type { HubFileOption, HubInstallJob, HubModelSearchResult, HubModelType } from "../../services/hubDownloadsService";

type DownloaderLocalForm = {
  id: string;
  name: string;
  modelTempPath?: string;
  modelPath?: string;
  configTempPath?: string;
};

type CompatibilityTone = "compatible" | "incompatible" | "warning" | "neutral";

type FileCompatibility = {
  typeLabel: string;
  statusLabel: string;
  statusTone: CompatibilityTone;
  isCompatible: boolean;
};

type FileTreeRow = {
  id: string;
  kind: "directory" | "file";
  name: string;
  fullPath: string;
  secondaryPath: string | null;
  depth: number;
  sizeLabel: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: CompatibilityTone;
  isCompatible: boolean;
};

const props = withDefaults(defineProps<{
  isOpen: boolean;
  title: string;
  modelType: HubModelType;
  searchPlaceholder?: string;
  searchQuery: string;
  activeFilter: string;
  filters: Array<{ value: string; label: string }>;
  isSearching: boolean;
  results: HubModelSearchResult[];
  selectedFiles: Record<string, string>;
  activeJob: HubInstallJob | null;
  nextCursor?: string | null;
  localForm: DownloaderLocalForm;
  isSavingLocal?: boolean;
}>(), {
  searchPlaceholder: "Search repositories on Hugging Face...",
  nextCursor: null,
  isSavingLocal: false,
});

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update:modelType", value: HubModelType): void;
  (e: "update:searchQuery", value: string): void;
  (e: "update:activeFilter", value: string): void;
  (e: "update:selectedFile", payload: { repoId: string; fileName: string }): void;
  (e: "search"): void;
  (e: "loadMore"): void;
  (e: "startDownload", payload: { repoId: string; fileName: string }): void;
  (e: "cancelDownload"): void;
  (e: "pickLocalPrimary"): void;
  (e: "pickLocalSecondary"): void;
  (e: "saveLocal"): void;
}>();

const activeSourceTab = ref<"online" | "local">("online");
const activeDetailTab = ref<"info" | "files">("info");
const selectedRepoId = ref<string | null>(null);

const modelTypeTabs = [
  { value: "llm" as const, label: "LLM", icon: FileCode2 },
  { value: "stt" as const, label: "STT", icon: Waves },
  { value: "tts" as const, label: "TTS", icon: Volume2 },
];

const selectedResult = computed(
  () => props.results.find((result) => result.repoId === selectedRepoId.value) ?? null
);

const currentLocalPrimaryValue = computed({
  get: () => props.modelType === "stt" ? props.localForm.modelPath ?? "" : props.localForm.modelTempPath ?? "",
  set: () => undefined,
});

const currentLocalSecondaryValue = computed({
  get: () => props.localForm.configTempPath ?? "",
  set: () => undefined,
});

const selectedFileName = computed({
  get: () => {
    if (!selectedResult.value) {
      return "";
    }

    return props.selectedFiles[selectedResult.value.repoId] ?? "";
  },
  set: (value: string) => {
    if (!selectedResult.value) {
      return;
    }

    emit("update:selectedFile", {
      repoId: selectedResult.value.repoId,
      fileName: value,
    });
  },
});

const openDetails = (repoId: string) => {
  selectedRepoId.value = repoId;
  activeDetailTab.value = "info";
};

const closeDetails = () => {
  selectedRepoId.value = null;
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

const formatEta = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return "-";

  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatDate = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
};

const getTtsCompanionConfig = (fileName: string, files: HubFileOption[]) => {
  const candidates = [
    `${fileName}.json`,
    `${fileName.replace(/\.onnx$/i, "")}.onnx.json`,
    `${fileName.replace(/\.onnx$/i, "")}.json`,
    "config.json",
  ];

  return candidates.find((candidate) => files.some((file) => file.fileName === candidate)) ?? null;
};

const getSttBundleFiles = (fileName: string, files: HubFileOption[]) => {
  const normalizedFileName = fileName.replace(/\\/g, "/");

  if (!normalizedFileName.toLowerCase().endsWith("/model.bin") && normalizedFileName.toLowerCase() !== "model.bin") {
    return null;
  }

  const directory = normalizedFileName.includes("/")
    ? normalizedFileName.slice(0, normalizedFileName.lastIndexOf("/"))
    : "";
  const prefix = directory ? `${directory}/` : "";
  const fileSet = new Set(files.map((file) => file.fileName.replace(/\\/g, "/")));
  const requiredFiles = [
    `${prefix}model.bin`,
    `${prefix}config.json`,
    `${prefix}tokenizer.json`,
    `${prefix}preprocessor_config.json`,
  ];

  return requiredFiles.every((requiredFile) => fileSet.has(requiredFile))
    ? requiredFiles
    : null;
};

const getCompatibility = (file: HubFileOption, files: HubFileOption[]): FileCompatibility => {
  const lower = file.fileName.toLowerCase();

  if (props.modelType === "llm") {
    return lower.endsWith(".gguf")
      ? { typeLabel: "GGUF", statusLabel: "Compatible", statusTone: "compatible", isCompatible: true }
      : { typeLabel: "Other", statusLabel: "Incompatible", statusTone: "incompatible", isCompatible: false };
  }

  if (props.modelType === "stt") {
    const compatibleBundle = getSttBundleFiles(file.fileName, files);

    if (compatibleBundle) {
      return {
        typeLabel: "CTranslate2",
        statusLabel: "Compatible",
        statusTone: "compatible",
        isCompatible: true,
      };
    }

    if (lower.endsWith("model.bin")) {
      return {
        typeLabel: "CTranslate2",
        statusLabel: "Missing files",
        statusTone: "warning",
        isCompatible: false,
      };
    }

    return {
      typeLabel: "Other",
      statusLabel: "Incompatible",
      statusTone: "incompatible",
      isCompatible: false,
    };
  }

  if (!lower.endsWith(".onnx")) {
    return { typeLabel: "Other", statusLabel: "Incompatible", statusTone: "incompatible", isCompatible: false };
  }

  const configFile = getTtsCompanionConfig(file.fileName, files);

  if (!configFile) {
    return { typeLabel: "ONNX", statusLabel: "Missing config", statusTone: "warning", isCompatible: false };
  }

  return { typeLabel: "ONNX", statusLabel: "Compatible", statusTone: "compatible", isCompatible: true };
};

const repositoryStatus = (result: HubModelSearchResult) => {
  const compatibleFiles = result.files.filter((file) => getCompatibility(file, result.files).isCompatible);

  if (props.modelType === "llm") {
    return compatibleFiles.length > 0
      ? { label: "GGUF available", tone: "compatible" as const }
      : { label: "No GGUF", tone: "warning" as const };
  }

  if (props.modelType === "stt") {
    return compatibleFiles.length > 0
      ? { label: "STT available", tone: "compatible" as const }
      : { label: "No CTranslate2", tone: "warning" as const };
  }

  const hasOnnxWithoutConfig = result.files.some((file) => {
    const compatibility = getCompatibility(file, result.files);
    return compatibility.typeLabel === "ONNX" && compatibility.statusTone === "warning";
  });

  if (compatibleFiles.length > 0) {
    return { label: "TTS available", tone: "compatible" as const };
  }

  return hasOnnxWithoutConfig
    ? { label: "Missing config", tone: "warning" as const }
    : { label: "No TTS file", tone: "warning" as const };
};

const fileTreeRows = computed<FileTreeRow[]>(() => {
  if (!selectedResult.value) {
    return [];
  }

  const rows: FileTreeRow[] = [];
  const seenDirectories = new Set<string>();

  for (const file of selectedResult.value.files) {
    const normalizedPath = file.fileName.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    for (let index = 0; index < segments.length - 1; index += 1) {
      const directoryPath = segments.slice(0, index + 1).join("/");

      if (seenDirectories.has(directoryPath)) {
        continue;
      }

      seenDirectories.add(directoryPath);
      rows.push({
        id: `dir:${directoryPath}`,
        kind: "directory",
        name: segments[index],
        fullPath: directoryPath,
        secondaryPath: index > 0 ? directoryPath : null,
        depth: index,
        sizeLabel: "",
        typeLabel: "Folder",
        statusLabel: "",
        statusTone: "neutral",
        isCompatible: false,
      });
    }

    const compatibility = getCompatibility(file, selectedResult.value.files);
    rows.push({
      id: `file:${normalizedPath}`,
      kind: "file",
      name: segments[segments.length - 1] ?? normalizedPath,
      fullPath: normalizedPath,
      secondaryPath: segments.length > 1 ? normalizedPath : null,
      depth: Math.max(0, segments.length - 1),
      sizeLabel: file.fileSizeBytes ? formatBytes(file.fileSizeBytes) : "",
      typeLabel: compatibility.typeLabel,
      statusLabel: compatibility.statusLabel,
      statusTone: compatibility.statusTone,
      isCompatible: compatibility.isCompatible,
    });
  }

  return rows.sort((left, right) => left.fullPath.localeCompare(right.fullPath));
});

const fileHelpText = computed(() => {
  if (props.modelType === "llm") {
    return "Download directly from the file list. GGUF files are marked as compatible.";
  }

  if (props.modelType === "stt") {
    return "Download directly from the file list. Only Faster-Whisper/CTranslate2 bundles are marked as compatible.";
  }

  return "Download directly from the file list. ONNX files with a matching config are marked as compatible.";
});

const localPrimaryLabel = computed(() => {
  if (props.modelType === "llm") return "Model File";
  if (props.modelType === "stt") return "Model Path";
  return "ONNX File";
});

const localPrimaryPlaceholder = computed(() => {
  if (props.modelType === "llm") return "Select a local model file";
  if (props.modelType === "stt") return "Select a local model file or folder";
  return "Select the .onnx file";
});

const saveButtonLabel = computed(() => {
  if (props.isSavingLocal) {
    return props.modelType === "tts" ? "Installing Voice..." : "Installing Model...";
  }

  return props.modelType === "tts" ? "Install Voice" : "Install Model";
});

const startRowDownload = (row: FileTreeRow) => {
  if (!selectedResult.value || row.kind !== "file" || !row.isCompatible) {
    return;
  }

  selectedFileName.value = row.fullPath;
  emit("startDownload", {
    repoId: selectedResult.value.repoId,
    fileName: row.fullPath,
  });
};

watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      selectedRepoId.value = null;
      activeSourceTab.value = "online";
      activeDetailTab.value = "info";
    }
  }
);
</script>

<template>
  <BaseModal :is-open="isOpen" :width="'58rem'" :height="'43rem'" @close="emit('close')">
    <div class="downloader-shell">
      <div class="downloader-header">
        <h2>{{ title }}</h2>
        <button class="close-btn" type="button" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>

      <div class="model-type-tabs">
        <button
          v-for="tab in modelTypeTabs"
          :key="tab.value"
          :class="['model-type-tab', { active: modelType === tab.value }]"
          type="button"
          @click="emit('update:modelType', tab.value)"
        >
          <component :is="tab.icon" :size="14" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <div class="downloader-tabs">
        <button
          :class="['source-tab', { active: activeSourceTab === 'online' }]"
          type="button"
          @click="activeSourceTab = 'online'"
        >
          Online
        </button>
        <button
          :class="['source-tab', { active: activeSourceTab === 'local' }]"
          type="button"
          @click="activeSourceTab = 'local'"
        >
          Local
        </button>
      </div>

      <div class="downloader-stage">
        <div v-if="activeSourceTab === 'online'" class="online-pane">
          <div class="search-row">
            <BaseInput
              :model-value="searchQuery"
              :placeholder="searchPlaceholder"
              @update:model-value="emit('update:searchQuery', String($event))"
              @keydown.enter="emit('search')"
            />

            <BaseSelect
              :model-value="activeFilter"
              :options="filters"
              class="filter-select"
              @update:model-value="emit('update:activeFilter', $event)"
            />

            <BaseButton
              variant="secondary"
              label="Search"
              :icon-left="Search"
              @click="emit('search')"
            />
          </div>

          <div v-if="activeJob" class="download-banner">
            <div class="download-banner-copy">
              <strong>{{ activeJob.displayName }}</strong>
              <span>{{ activeJob.status }} · {{ activeJob.progressPercent?.toFixed(1) ?? 0 }}%</span>
            </div>
            <div class="download-banner-track">
              <div class="download-banner-fill" :style="{ width: `${activeJob.progressPercent ?? 0}%` }" />
            </div>
            <div class="download-banner-meta">
              <span>{{ formatBytes(activeJob.downloadedBytes) }} / {{ formatBytes(activeJob.totalBytes) }}</span>
              <span>{{ formatSpeed(activeJob.bytesPerSecond) }}</span>
              <span>ETA {{ formatEta(activeJob.etaSeconds) }}</span>
            </div>
          </div>

          <div class="results-pane">
            <div v-if="isSearching" class="empty-state">Searching repositories...</div>
            <div v-else-if="results.length === 0" class="empty-state">
              Search any Hugging Face repository and inspect the available files.
            </div>

            <template v-else>
              <button
                v-for="result in results"
                :key="result.repoId"
                :class="['result-row', { active: selectedRepoId === result.repoId }]"
                type="button"
                @click="openDetails(result.repoId)"
              >
                <div class="result-row-main">
                  <div class="result-row-copy">
                    <strong>{{ result.repoId }}</strong>
                    <span>{{ result.author }} · {{ result.pipelineTag || "unknown" }}</span>
                  </div>

                  <div class="result-row-side">
                    <div class="result-row-meta">
                      <span class="compatibility-badge tone-files">{{ result.files.length }} files</span>
                      <span class="compatibility-badge tone-downloads">{{ result.downloads }} downloads</span>
                      <span class="compatibility-badge tone-likes">{{ result.likes }} likes</span>
                    </div>

                    <div class="result-row-status">
                      <span :class="['compatibility-badge', `tone-${repositoryStatus(result).tone}`]">
                        {{ repositoryStatus(result).label }}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              <BaseButton
                v-if="nextCursor"
                variant="ghost"
                label="Load More"
                class="load-more-btn"
                @click="emit('loadMore')"
              />
            </template>
          </div>

          <Transition name="detail-slide">
            <div v-if="selectedResult" class="detail-overlay">
              <div class="detail-header">
                <button class="back-button" type="button" @click="closeDetails">
                  <ArrowLeft :size="15" />
                  <span>Back</span>
                </button>
              </div>

              <div class="detail-hero">
                <strong>{{ selectedResult.repoId }}</strong>
                <span>{{ selectedResult.author }} · {{ selectedResult.pipelineTag || "unknown" }}</span>
              </div>

              <div class="detail-tabs">
                <button
                  :class="['detail-tab', { active: activeDetailTab === 'info' }]"
                  type="button"
                  @click="activeDetailTab = 'info'"
                >
                  Info
                </button>
                <button
                  :class="['detail-tab', { active: activeDetailTab === 'files' }]"
                  type="button"
                  @click="activeDetailTab = 'files'"
                >
                  Files
                </button>
              </div>

              <div v-if="activeDetailTab === 'info'" class="detail-body">
                <div class="detail-grid">
                  <div class="detail-card">
                    <span class="detail-label">Pipeline</span>
                    <strong>{{ selectedResult.pipelineTag || "-" }}</strong>
                  </div>
                  <div class="detail-card">
                    <span class="detail-label">Last update</span>
                    <strong>{{ formatDate(selectedResult.lastModified) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span class="detail-label">Downloads</span>
                    <strong>{{ selectedResult.downloads }}</strong>
                  </div>
                  <div class="detail-card">
                    <span class="detail-label">Likes</span>
                    <strong>{{ selectedResult.likes }}</strong>
                  </div>
                </div>
              </div>

              <div v-else class="detail-body">
                <div class="file-toolbar-copy">
                  <label>Repository files</label>
                  <span>{{ fileHelpText }}</span>
                </div>

                <div class="file-list">
                  <div
                    v-for="row in fileTreeRows"
                    :key="row.id"
                    :class="['file-row-item', { directory: row.kind === 'directory' }]"
                    :style="{ '--tree-depth': row.depth }"
                  >
                    <div class="file-row-main">
                      <div class="file-row-name">
                        <span class="file-row-icon">
                          <Folder v-if="row.kind === 'directory'" :size="14" />
                          <FileCode2 v-else :size="14" />
                        </span>
                        <div class="file-row-copy">
                          <div class="file-row-title">
                            <strong>{{ row.name }}</strong>
                            <span v-if="row.kind === 'file'" class="compatibility-badge tone-neutral file-name-badge">
                              {{ row.typeLabel }}
                            </span>
                            <span v-if="row.kind === 'file'" :class="['compatibility-badge', `tone-${row.statusTone}`, 'file-name-badge']">
                              {{ row.statusLabel }}
                            </span>
                          </div>
                          <span v-if="row.secondaryPath">{{ row.secondaryPath }}</span>
                        </div>
                      </div>

                      <div class="file-row-meta">
                        <span v-if="row.sizeLabel" class="file-size">{{ row.sizeLabel }}</span>
                        <BaseButton
                          v-if="row.kind === 'file' && row.isCompatible"
                          variant="ghost"
                          label="Download"
                          :icon-left="Download"
                          class="file-download-btn"
                          @click.stop="startRowDownload(row)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="activeJob" class="detail-actions">
                  <BaseButton
                    variant="danger"
                    label="Cancel"
                    @click="emit('cancelDownload')"
                  />
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <div v-else class="local-pane">
          <div class="form-grid">
            <div class="field">
              <label>Identifier</label>
              <BaseInput v-model="localForm.id" placeholder="e.g. qwen2.5-3b" />
            </div>

            <div class="field">
              <label>Display Name</label>
              <BaseInput v-model="localForm.name" placeholder="e.g. Qwen 2.5 3B" />
            </div>

            <div class="field full-width">
              <label>{{ localPrimaryLabel }}</label>
              <div class="file-row">
                <BaseInput :model-value="currentLocalPrimaryValue" readonly :placeholder="localPrimaryPlaceholder" />
                <button class="file-button" type="button" @click="emit('pickLocalPrimary')">
                  <FolderOpen :size="16" />
                </button>
              </div>
            </div>

            <div v-if="modelType === 'tts'" class="field full-width">
              <label>JSON Config</label>
              <div class="file-row">
                <BaseInput :model-value="currentLocalSecondaryValue" readonly placeholder="Select the .json config" />
                <button class="file-button" type="button" @click="emit('pickLocalSecondary')">
                  <FolderOpen :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div class="detail-actions local-actions">
            <BaseButton variant="ghost" label="Cancel" @click="emit('close')" />
            <BaseButton
              variant="primary"
              :label="saveButtonLabel"
              :disabled="isSavingLocal"
              @click="emit('saveLocal')"
            />
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.downloader-shell {
  @include settings-shell;
  flex-direction: column;
  min-height: 0;
}

.downloader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 10px;

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: $color-text-primary;
  }
}

.close-btn {
  @include base-modal-close-btn;
}

.model-type-tabs,
.downloader-tabs {
  display: flex;
  gap: 8px;
  padding: 0 20px 12px;
}

.model-type-tab,
.source-tab,
.detail-tab {
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid $color-border-default;
  border-radius: 999px;
  background: transparent;
  color: $color-text-muted;
  font-size: 12px;
  cursor: pointer;
}

.model-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.model-type-tab.active,
.source-tab.active,
.detail-tab.active {
  background: $color-surface;
  color: $color-text-primary;
}

.downloader-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid $color-border-default;
}

.online-pane,
.local-pane {
  height: 100%;
  min-height: 0;
}

.online-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 20px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px auto;
  gap: 8px;
  overflow: visible;
}

.filter-select {
  min-width: 0;
}

.download-banner,
.detail-card {
  background: $color-downloader-surface;
}

.download-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid $color-border-default;
  border-radius: 8px;
}

.download-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.download-banner-copy strong,
.detail-hero strong {
  color: $color-text-primary;
  font-size: 13px;
  font-weight: 600;
}

.download-banner-copy span,
.download-banner-meta span,
.detail-hero span,
.empty-state,
.detail-label {
  color: $color-text-muted;
  font-size: 12px;
}

.download-banner-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: $color-downloader-progress-track;
  overflow: hidden;
}

.download-banner-fill {
  height: 100%;
  border-radius: inherit;
  background: $color-downloader-progress-fill;
}

.download-banner-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.results-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.result-row {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid $color-settings-row-border;
  outline: none;
  box-shadow: none;
  color: $color-text-primary;
  cursor: pointer;
  text-align: left;
  background: transparent;
  transition: color 0.14s ease;
  appearance: none;
  -webkit-appearance: none;
}

.result-row-main {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
}

.result-row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: $color-text-primary;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
  }

  span {
    color: $color-text-muted;
    font-size: 13px;
    line-height: 1.35;
  }
}

.result-row-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 280px;
}

.result-row-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.result-row-status {
  flex-shrink: 0;
}

.compatibility-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: $color-downloader-badge-neutral-bg;
  color: $color-downloader-badge-neutral-text;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.tone-compatible {
  background: $color-downloader-badge-compatible-bg;
  border-color: $color-downloader-badge-compatible-border;
  color: $color-downloader-badge-compatible-text;
}

.tone-incompatible {
  background: $color-downloader-badge-incompatible-bg;
  border-color: $color-downloader-badge-incompatible-border;
  color: $color-downloader-badge-incompatible-text;
}

.tone-warning {
  background: $color-downloader-badge-warning-bg;
  border-color: $color-downloader-badge-warning-border;
  color: $color-downloader-badge-warning-text;
}

.tone-neutral {
  background: $color-downloader-badge-neutral-bg;
  border-color: $color-downloader-badge-neutral-border;
  color: $color-downloader-badge-neutral-text;
}

.tone-files {
  background: $color-downloader-badge-files-bg;
  border-color: $color-downloader-badge-files-border;
  color: $color-downloader-badge-files-text;
}

.tone-downloads {
  background: $color-downloader-badge-downloads-bg;
  border-color: $color-downloader-badge-downloads-border;
  color: $color-downloader-badge-downloads-text;
}

.tone-likes {
  background: $color-downloader-badge-likes-bg;
  border-color: $color-downloader-badge-likes-border;
  color: $color-downloader-badge-likes-text;
}

.load-more-btn {
  width: 100%;
  margin-top: 4px;
}

.detail-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 20px;
  border-left: 1px solid $color-border-default;
  background: $color-base;
}

.detail-header,
.detail-tabs {
  display: flex;
  align-items: center;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: $color-text-muted;
  cursor: pointer;
}

.detail-hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid $color-border-default;
  border-radius: 8px;

  strong {
    color: $color-text-primary;
    font-size: 13px;
    font-weight: 500;
  }
}

.file-toolbar-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;

  span {
    color: $color-text-muted;
    font-size: 12px;
    line-height: 1.3;
  }

  label {
    color: $color-text-secondary;
    font-size: 12px;
  }
}

.file-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid $color-settings-row-border;
}

.file-row-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid $color-settings-row-border;
  background: transparent;
}

.file-row-main {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.file-row-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-left: calc(var(--tree-depth) * 16px);
}

.file-row-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $color-text-secondary;
}

.file-row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  > span {
    color: $color-text-muted;
    font-size: 11px;
    line-height: 1.2;
  }
}

.file-row-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  strong {
    color: $color-text-primary;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
  }
}

.file-name-badge {
  flex-shrink: 0;
}

.file-row-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.file-size {
  color: $color-text-secondary;
  font-size: 11px;
}

.file-download-btn {
  width: auto;
  min-width: 88px;
  min-height: 28px;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.local-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.form-grid {
  @include settings-form-grid;
}

.field {
  @include settings-form-field;
}

.full-width {
  grid-column: span 2;
}

.file-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
}

.file-button {
  @include base-select-trigger;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.local-actions {
  margin-top: auto;
}

@media (max-width: 900px) {
  .result-row {
    padding: 12px 0;
  }

  .result-row-main,
  .file-row-main {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .result-row-side {
    min-width: 0;
    justify-content: flex-start;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .result-row-meta,
  .file-row-meta {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .file-row-meta {
    padding-left: calc(var(--tree-depth) * 16px + 26px);
  }
}

.detail-slide-enter-active,
.detail-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.detail-slide-enter-from,
.detail-slide-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
</style>
