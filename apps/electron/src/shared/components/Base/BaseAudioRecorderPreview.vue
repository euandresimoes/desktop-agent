<script setup lang="ts">
import { Mic, Pause, Play, RotateCcw, Square } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AudioPlayerVisualizer, AudioRecorder } from "../../utils/audio-recorder";
import { useToast } from "../../utils/toast";
import BaseButton from "./BaseButton.vue";
import BaseAudioLevelBars from "./BaseAudioLevelBars.vue";

const props = defineProps<{
  inputDeviceId?: string;
  outputDeviceId?: string;
  inputGain?: number;
}>();

const recorder = ref<AudioRecorder | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const audioUrl = ref<string | null>(null);
const playerVisualizer = ref<AudioPlayerVisualizer | null>(null);
const isRecording = ref(false);
const isPlaying = ref(false);
const currentVolume = ref(0);
const recordedDurationMs = ref(0);
const playbackPositionMs = ref(0);
const recordingStartedAt = ref(0);
let recordingTimer: ReturnType<typeof setInterval> | null = null;
const toast = useToast();

const hasAudio = computed(() => Boolean(audioUrl.value));
const isVisualizerActive = computed(() => isRecording.value || isPlaying.value);
const displayedDurationMs = computed(() => recordedDurationMs.value);
const primaryButtonIcon = computed(() => {
  if (isRecording.value) {
    return Square;
  }

  return hasAudio.value ? RotateCcw : Mic;
});

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const clearRecordingTimer = () => {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
};

const teardownPlayback = () => {
  playerVisualizer.value?.stop();
  playerVisualizer.value?.close();
  playerVisualizer.value = null;

  if (audioElement.value) {
    audioElement.value.pause();
    audioElement.value.currentTime = 0;
    audioElement.value.onended = null;
    audioElement.value.onpause = null;
    audioElement.value.ontimeupdate = null;
    audioElement.value.src = "";
    audioElement.value.load();
    audioElement.value = null;
  }

  isPlaying.value = false;
  playbackPositionMs.value = 0;
};

const teardownRecordingState = () => {
  recorder.value?.cancel();
  recorder.value = null;
  isRecording.value = false;
  currentVolume.value = 0;
  recordingStartedAt.value = 0;
  clearRecordingTimer();
};

const discardAudio = () => {
  teardownPlayback();

  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = null;
  }

  recordedDurationMs.value = 0;
  playbackPositionMs.value = 0;
};

const cleanup = () => {
  teardownRecordingState();
  discardAudio();
};

const createAudioElement = async () => {
  teardownPlayback();

  if (!audioUrl.value) {
    return null;
  }

  const element = new Audio(audioUrl.value);

  if (props.outputDeviceId && "setSinkId" in element) {
    try {
      await (element as HTMLAudioElement & { setSinkId(deviceId: string): Promise<void> }).setSinkId(
        props.outputDeviceId,
      );
    } catch (error) {
      console.warn("[audio-preview] failed to set sink id", error);
    }
  }

  audioElement.value = element;
  playerVisualizer.value = new AudioPlayerVisualizer(element, (rms) => {
    currentVolume.value = rms;
  });
  playerVisualizer.value.setup();

  element.ontimeupdate = () => {
    playbackPositionMs.value = Math.round(element.currentTime * 1000);
  };

  element.onpause = () => {
    playerVisualizer.value?.stop();
    isPlaying.value = false;
    currentVolume.value = 0;
  };

  element.onended = () => {
    playerVisualizer.value?.stop();
    isPlaying.value = false;
    currentVolume.value = 0;
    playbackPositionMs.value = 0;
    element.currentTime = 0;
  };

  return element;
};

const startRecording = async () => {
  teardownRecordingState();
  discardAudio();

  const nextRecorder = new AudioRecorder({
    selectedDeviceId: props.inputDeviceId,
    inputGain: props.inputGain,
    silenceDurationMs: Number.POSITIVE_INFINITY,
    onVolume: (volume) => {
      currentVolume.value = volume;
    },
  });

  await nextRecorder.start();

  recorder.value = nextRecorder;
  isRecording.value = true;
  recordingStartedAt.value = Date.now();
  recordedDurationMs.value = 0;
  playbackPositionMs.value = 0;
  recordingTimer = setInterval(() => {
    if (!recordingStartedAt.value) {
      return;
    }

    recordedDurationMs.value = Date.now() - recordingStartedAt.value;
  }, 120);
};

const stopRecording = async () => {
  if (!recorder.value) {
    return;
  }

  const activeRecorder = recorder.value;
  const finishedDuration = Math.max(0, Date.now() - recordingStartedAt.value);
  const stopResult = activeRecorder.stop();

  recorder.value = null;
  isRecording.value = false;
  currentVolume.value = 0;
  clearRecordingTimer();
  recordingStartedAt.value = 0;
  recordedDurationMs.value = finishedDuration;

  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }

  audioUrl.value = URL.createObjectURL(stopResult.audioBlob);
};

const toggleRecording = async () => {
  try {
    if (isRecording.value) {
      await stopRecording();
      return;
    }

    await startRecording();
  } catch (error) {
    cleanup();
    toast.error(error instanceof Error ? error.message : "Failed to record microphone preview.");
  }
};

const togglePlayback = async () => {
  if (!hasAudio.value) {
    return;
  }

  try {
    if (!audioElement.value) {
      await createAudioElement();
    }

    if (!audioElement.value) {
      return;
    }

    if (isPlaying.value) {
      audioElement.value.pause();
      return;
    }

    if (props.outputDeviceId && "setSinkId" in audioElement.value) {
      try {
        await (
          audioElement.value as HTMLAudioElement & { setSinkId(deviceId: string): Promise<void> }
        ).setSinkId(props.outputDeviceId);
      } catch (error) {
        console.warn("[audio-preview] failed to refresh sink id", error);
      }
    }

    await audioElement.value.play();
    isPlaying.value = true;
    playerVisualizer.value?.start();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to play microphone preview.");
  }
};

watch(
  () => props.outputDeviceId,
  async (nextDeviceId) => {
    if (!audioElement.value || !nextDeviceId || !("setSinkId" in audioElement.value)) {
      return;
    }

    try {
      await (
        audioElement.value as HTMLAudioElement & { setSinkId(deviceId: string): Promise<void> }
      ).setSinkId(nextDeviceId);
    } catch (error) {
      console.warn("[audio-preview] failed to update sink id", error);
    }
  },
);

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <div class="audio-recorder-preview">
    <div class="preview-main">
      <div class="preview-bars">
        <BaseAudioLevelBars
          :is-active="isVisualizerActive"
          :current-volume="currentVolume"
          :bar-count="48"
          :min-height="5"
          :max-height="24"
          :bar-width="3"
          :gap="2"
          :height="26"
          :volume-gain="11.5"
        />
      </div>
      <div class="preview-meta">
        <div class="preview-actions">
          <BaseButton
            variant="ghost"
            :icon-left="isPlaying ? Pause : Play"
            :disabled="!hasAudio || isRecording"
            @click="togglePlayback"
          />
          <BaseButton
            :variant="isRecording ? 'danger' : 'ghost'"
            :icon-left="primaryButtonIcon"
            @click="toggleRecording"
          />
        </div>
        <span class="preview-duration">{{ formatDuration(displayedDurationMs) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.audio-recorder-preview {
  display: flex;
  align-items: center;
}

.preview-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.preview-bars {
  width: 100%;
  max-width: 280px;
  min-height: 26px;
}

.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-duration {
  color: $color-text-primary;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .audio-recorder-preview {
    flex-direction: column;
    align-items: stretch;
  }

  .preview-actions {
    justify-content: flex-start;
  }
}
</style>
