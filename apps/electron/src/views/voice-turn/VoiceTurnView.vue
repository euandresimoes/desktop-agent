<script setup lang="ts">
import { watch, ref, onMounted, onBeforeUnmount, computed } from "vue";
import { Mic, Volume2, AlertCircle, Loader2, X } from "@lucide/vue";
import SettingsModal from "./components/SettingsModal.vue";
import CreateAiModelModal from "./components/CreateAiModelModal.vue";
import AppSettingsModal from "../app-settings/AppSettingsModal.vue";
import { useVoiceTurnService } from "./services/voiceTurnService";
import { useSettingsService } from "./services/settingsService";
import type { HubModelType } from "../../shared/services/hubDownloadsService";

const isSettingsOpen = ref(false);
const isAppSettingsOpen = ref(false);
const isCreateAiOpen = ref(false);
const thinkingStatusIndex = ref(0);
let thinkingStatusTimer: ReturnType<typeof setInterval> | null = null;

const thinkingStatuses = [
  "Thinking",
  "Generating",
  "Reasoning",
  "Analyzing",
  "Planning",
  "Synthesizing",
  "Composing",
  "Structuring",
  "Resolving",
  "Interpreting",
  "Constructing",
  "Comparing",
  "Mapping",
  "Calculating",
  "Inferring",
  "Drafting",
  "Refining",
  "Evaluating",
  "Organizing",
  "Exploring",
  "Sequencing",
  "Formulating",
  "Processing",
  "Connecting",
  "Aligning",
  "Assembling",
  "Transforming",
  "Preparing",
  "Finalizing",
  "Weighing",
];

const {
  currentState,
  statusError,
  orbStyle,
  backgroundGlowStyle,
  statusLabel,
  liveCaption,
  partialUserCaption,
  confirmedUserCaptions,
  bindAudioElement,
  checkSystemStatus,
  handleOrbClick,
  handleAudioEnded,
} = useVoiceTurnService();
const audioElementRef = ref<HTMLAudioElement | null>(null);
const displayedStatusLabel = computed(() =>
  currentState.value === "thinking"
    ? (thinkingStatuses[thinkingStatusIndex.value] ?? "Processing")
    : statusLabel.value,
);
const hasUserSpeech = computed(
  () => partialUserCaption.value || confirmedUserCaptions.value.length > 0,
);
const hasAssistantSpeech = computed(() => Boolean(liveCaption.value));

const settingsService = useSettingsService(() => checkSystemStatus());

const openSettingsModal = () => {
  isSettingsOpen.value = true;
};

const openAppSettingsModal = () => {
  isAppSettingsOpen.value = true;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

const handleGlobalSpacebar = (event: KeyboardEvent) => {
  if (
    event.code !== "Space" ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isSettingsOpen.value ||
    isAppSettingsOpen.value ||
    isCreateAiOpen.value ||
    isEditableTarget(event.target)
  ) {
    return;
  }

  event.preventDefault();
  handleOrbClick();
};

const openDownloaderModal = (event: Event) => {
  const detail =
    "detail" in event
      ? (event as CustomEvent<{ modelType?: HubModelType }>).detail
      : undefined;
  settingsService.setHubModelType(detail?.modelType ?? "llm");
  isCreateAiOpen.value = true;
};

const pickPrimaryLocalAsset = () => {
  if (settingsService.hubModelType.value === "llm") {
    return settingsService.pickFile("llm");
  }

  if (settingsService.hubModelType.value === "stt") {
    return settingsService.pickFile("stt-model");
  }

  return settingsService.pickFile("tts-model");
};

const saveCurrentLocalModel = () =>
  settingsService.handleCreate(settingsService.hubModelType.value);

const stopThinkingTicker = () => {
  if (thinkingStatusTimer !== null) {
    clearInterval(thinkingStatusTimer);
    thinkingStatusTimer = null;
  }
};

const startThinkingTicker = () => {
  stopThinkingTicker();
  thinkingStatusIndex.value = 0;
  thinkingStatusTimer = setInterval(() => {
    thinkingStatusIndex.value =
      (thinkingStatusIndex.value + 1) % thinkingStatuses.length;
  }, 1850);
};

onMounted(() => {
  window.addEventListener("open-settings-modal", openSettingsModal);
  window.addEventListener("open-app-settings-modal", openAppSettingsModal);
  window.addEventListener("open-download-model-modal", openDownloaderModal);
  window.addEventListener("keydown", handleGlobalSpacebar);
});

onBeforeUnmount(() => {
  stopThinkingTicker();
  window.removeEventListener("open-settings-modal", openSettingsModal);
  window.removeEventListener("open-app-settings-modal", openAppSettingsModal);
  window.removeEventListener("open-download-model-modal", openDownloaderModal);
  window.removeEventListener("keydown", handleGlobalSpacebar);
});

// Refresh status when settings modal closes
watch(isSettingsOpen, (isOpen) => {
  if (!isOpen) {
    checkSystemStatus();
  }
});

watch(
  audioElementRef,
  (element) => {
    bindAudioElement(element);
  },
  { immediate: true },
);

watch(
  currentState,
  (state) => {
    if (state === "thinking") {
      startThinkingTicker();
      return;
    }

    stopThinkingTicker();
    thinkingStatusIndex.value = 0;
  },
  { immediate: true },
);
</script>

<template>
  <div class="voice-turn-view" :style="backgroundGlowStyle">
    <div class="assistant-content">
      <div v-if="currentState === 'not_ready'" class="alert-box">
        <AlertCircle :size="20" class="alert-icon" />
        <div class="alert-text">
          <p>{{ statusError }}</p>
          <span>Open settings in the top bar to configure your models.</span>
        </div>
      </div>

      <div class="conversation-grid" aria-live="polite" aria-atomic="false">
        <section class="lyrics-column lyrics-column-left">
          <div class="lyrics-stack">
            <TransitionGroup name="lyric-rise" tag="div" class="lyrics-list">
              <p
                v-for="(segment, index) in confirmedUserCaptions"
                :key="`user-confirmed-${index}-${segment}`"
                class="lyric-line lyric-line-confirmed"
              >
                {{ segment }}
              </p>
            </TransitionGroup>
            <Transition name="lyric-soft">
              <p
                v-if="partialUserCaption"
                :key="`user-partial-${partialUserCaption}`"
                class="lyric-line lyric-line-partial"
              >
                {{ partialUserCaption }}
              </p>
            </Transition>
            <p v-if="!hasUserSpeech" class="lyric-placeholder"></p>
          </div>
        </section>

        <div class="orb-column">
          <div class="orb-container">
            <button
              :class="['orb-button', currentState]"
              :disabled="
                currentState === 'loading' || currentState === 'not_ready'
              "
              :style="orbStyle"
              @click="handleOrbClick"
            >
              <span
                v-if="currentState === 'recording'"
                class="orb-pulse-layer layer-1"
              />
              <span
                v-if="currentState === 'recording'"
                class="orb-pulse-layer layer-2"
              />
              <span
                v-if="currentState === 'recording'"
                class="orb-pulse-layer layer-3"
              />
              <Mic
                v-if="currentState === 'ready' || currentState === 'recording'"
                :size="36"
                class="orb-icon"
              />
              <Loader2
                v-else-if="
                  currentState === 'thinking' || currentState === 'loading'
                "
                :size="36"
                class="orb-icon spinner"
              />
              <Volume2
                v-else-if="currentState === 'speaking'"
                :size="36"
                class="orb-icon"
              />
              <X v-else :size="36" class="orb-icon" />
            </button>

            <div class="orb-status">
              <div
                :class="[
                  'status-ticker',
                  {
                    'is-thinking': currentState === 'thinking',
                  },
                ]"
              >
                <Transition name="status-slide">
                  <span
                    :key="`${currentState}-${displayedStatusLabel}`"
                    class="status-badge"
                    :class="currentState"
                  >
                    {{ displayedStatusLabel }}
                  </span>
                </Transition>
              </div>
            </div>
          </div>
        </div>

        <section class="lyrics-column lyrics-column-right">
          <div class="lyrics-stack">
            <TransitionGroup name="lyric-rise" tag="div" class="lyrics-list">
              <p
                v-for="segment in liveCaption ? [liveCaption] : []"
                :key="`assistant-${segment}`"
                class="lyric-line lyric-line-assistant"
              >
                {{ segment }}
              </p>
            </TransitionGroup>
            <p v-if="!hasAssistantSpeech" class="lyric-placeholder"></p>
          </div>
        </section>
      </div>
    </div>

    <audio
      ref="audioElementRef"
      @ended="handleAudioEnded"
      class="hidden-audio"
    ></audio>

    <SettingsModal
      :is-open="isSettingsOpen"
      @close="isSettingsOpen = false"
      @updated="checkSystemStatus"
    />

    <AppSettingsModal
      :is-open="isAppSettingsOpen"
      @close="isAppSettingsOpen = false"
    />

    <CreateAiModelModal
      :is-open="isCreateAiOpen"
      :model-type="settingsService.hubModelType.value"
      :is-saving="settingsService.isSaving.value"
      :llm-model="settingsService.newLlm.value"
      :stt-model="settingsService.newStt.value"
      :tts-model="settingsService.newVoice.value"
      :hub-search-query="settingsService.hubSearchQuery.value"
      :hub-sort="settingsService.hubSort.value"
      :is-hub-searching="settingsService.isHubSearching.value"
      :hub-results="settingsService.hubResults.value"
      :selected-hub-files="settingsService.selectedHubFiles.value"
      :active-hub-install-job="settingsService.activeHubInstallJob.value"
      :next-cursor="settingsService.nextHubCursor.value"
      @close="isCreateAiOpen = false"
      @update:model-type="settingsService.setHubModelType($event)"
      @pick-local-primary="pickPrimaryLocalAsset"
      @pick-local-secondary="settingsService.pickFile('tts-config')"
      @save-local="saveCurrentLocalModel"
      @search-hub="settingsService.searchHubModels"
      @load-more-hub="settingsService.loadMoreHubModels"
      @start-hub-install="settingsService.startHubInstall"
      @cancel-hub-install="settingsService.cancelHubInstall"
      @update:hub-search-query="settingsService.hubSearchQuery.value = $event"
      @update:hub-sort="settingsService.hubSort.value = $event"
      @update:selected-hub-file="
        settingsService.selectedHubFiles.value[$event.repoId] = $event.fileName
      "
    />
  </div>
</template>

<style lang="scss" scoped>
@use "@/assets/styles/mixins.scss" as *;

.voice-turn-view {
  @include voice-turn-view;
}

.assistant-content {
  @include voice-turn-assistant-content;
  gap: 32px;
  justify-content: center;
}

.alert-box {
  @include voice-turn-alert-box;

  .alert-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .alert-text {
    p {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }
    span {
      font-size: 11px;
      color: $color-text-muted;
    }
  }
}

.conversation-grid {
  width: 100%;
  min-height: min(520px, 72vh);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 32px;
}

.orb-column {
  display: flex;
  align-items: center;
  justify-content: center;
}

.orb-container {
  @include voice-turn-orb-container;
}

.orb-button {
  @include voice-turn-orb-button;
  position: relative;
  overflow: visible;

  .orb-icon {
    position: relative;
    z-index: 2;
    transition: all 0.3s;
  }
}

.orb-pulse-layer {
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 1.5px solid var(--color-app-accent);
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
  z-index: 1;
  animation: orb-pulse-ring 2.4s ease-out infinite;
}

.layer-2 {
  animation-delay: 0.8s;
}

.layer-3 {
  animation-delay: 1.6s;
}

.orb-status {
  text-align: center;
}

.lyrics-column {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lyrics-column-left {
  text-align: center;
}

.lyrics-column-right {
  text-align: center;
}

.lyrics-stack {
  width: min(100%, 360px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
}

.lyrics-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lyric-line {
  margin: 0;
  color: $color-text-primary;
  font-size: clamp(18px, 1.4vw, 30px);
  line-height: 1.18;
  font-weight: 600;
  letter-spacing: -0.03em;
  white-space: pre-wrap;
  word-break: break-word;
  text-wrap: balance;
  text-align: start;
}

.lyric-line-confirmed,
.lyric-line-assistant {
  color: $color-text-primary;
}

.lyric-line-confirmed:first-child {
  text-align: center;
}

.lyric-line-partial {
  color: $color-text-primary;
  font-weight: 500;
}

.lyric-placeholder {
  min-height: clamp(30px, 3vw, 42px);
  margin: 0;
  opacity: 0;
}

.status-ticker {
  position: relative;
  height: 18px;
  min-width: 240px;
  overflow: hidden;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: absolute;
  inset: 0;
  font-size: 13px;
  font-weight: 600;
  color: $color-voice-turn-status-text;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.status-ticker.is-thinking .status-badge {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.34) 0%,
    rgba(255, 255, 255, 0.98) 18%,
    rgba(255, 255, 255, 0.42) 36%,
    rgba(255, 255, 255, 0.98) 52%,
    rgba(255, 255, 255, 0.38) 70%,
    rgba(255, 255, 255, 0.98) 86%,
    rgba(255, 255, 255, 0.34) 100%
  );
  background-size: 220% 100%;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: status-shimmer 1.8s linear infinite;
}

.hidden-audio {
  display: none;
}

.spinner {
  animation: spin 0.5s linear infinite;
}

.status-slide-enter-active,
.status-slide-leave-active {
  transition:
    transform 0.34s ease,
    opacity 0.34s ease;
}

.status-slide-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.status-slide-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.status-slide-enter-to,
.status-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.lyric-rise-enter-active,
.lyric-rise-leave-active,
.lyric-soft-enter-active,
.lyric-soft-leave-active {
  transition:
    transform 0.38s ease,
    opacity 0.38s ease,
    filter 0.38s ease;
}

.lyric-rise-enter-from,
.lyric-soft-enter-from {
  opacity: 0;
  transform: translateY(18px);
  filter: blur(5px);
}

.lyric-rise-leave-to,
.lyric-soft-leave-to {
  opacity: 0;
  transform: translateY(-18px);
  filter: blur(5px);
}

.lyric-rise-move {
  transition: transform 0.38s ease;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes orb-pulse-ring {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }

  18% {
    opacity: 0.34;
  }

  100% {
    opacity: 0;
    transform: scale(1.55);
  }
}

@keyframes status-shimmer {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -20% 0;
  }
}

@media (max-width: 980px) {
  .conversation-grid {
    min-height: auto;
    grid-template-columns: 1fr;
    gap: 28px;
  }

  .lyrics-column-left,
  .lyrics-column-right {
    justify-content: center;
    text-align: center;
    min-height: 0;
  }

  .lyrics-stack {
    width: min(100%, 560px);
  }
}
</style>
