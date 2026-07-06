<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import BaseAudioLevelBars from "../../shared/components/Base/BaseAudioLevelBars.vue";
import BaseToast from "../../shared/components/Base/BaseToast.vue";
import { useOverlayController } from "./useOverlayController";

const {
  bindAudioElement,
  handleAudioEnded,
  currentState,
  currentVolume,
  lastResponse,
  overlayVisible,
  overlayTransitionName,
  overlayPositionClass,
  overlayCardStyle,
} = useOverlayController();
const audioElementRef = ref<HTMLAudioElement | null>(null);
const displayedResponse = ref("");
const revealedWordCount = ref(0);
let responseRevealTimer: ReturnType<typeof setInterval> | null = null;

watch(
  audioElementRef,
  (element) => {
    bindAudioElement(element);
  },
  { immediate: true },
);

const clearResponseReveal = () => {
  if (responseRevealTimer !== null) {
    clearInterval(responseRevealTimer);
    responseRevealTimer = null;
  }
};

const resetDisplayedResponse = () => {
  clearResponseReveal();
  displayedResponse.value = "";
  revealedWordCount.value = 0;
};

const startWordReveal = (durationMs?: number) => {
  const words = lastResponse.value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  resetDisplayedResponse();

  if (words.length === 0) {
    return;
  }

  const resolvedDurationMs =
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? durationMs
      : Math.max(900, words.length * 170);
  const intervalMs = Math.max(
    70,
    Math.round(resolvedDurationMs / words.length),
  );

  const revealNextWord = () => {
    revealedWordCount.value = Math.min(
      words.length,
      revealedWordCount.value + 1,
    );
    displayedResponse.value = words.slice(0, revealedWordCount.value).join(" ");

    if (revealedWordCount.value >= words.length) {
      clearResponseReveal();
    }
  };

  revealNextWord();
  responseRevealTimer = setInterval(revealNextWord, intervalMs);
};

const handleOverlayAudioPlaying = () => {
  if (!lastResponse.value.trim() || displayedResponse.value.trim()) {
    return;
  }

  const audioDurationMs =
    audioElementRef.value && Number.isFinite(audioElementRef.value.duration)
      ? Math.round(audioElementRef.value.duration * 1000)
      : undefined;

  startWordReveal(audioDurationMs);
};

const displayState = computed(() => {
  if (
    overlayVisible.value &&
    (currentState.value === "ready" || currentState.value === "loading")
  ) {
    return "recording";
  }

  return currentState.value;
});
const hasResponseCaption = computed(() =>
  Boolean(displayedResponse.value.trim()),
);

watch(
  () => currentState.value,
  (value, previousValue) => {
    if (value !== "speaking") {
      if (value === "recording" || value === "thinking" || value === "ready") {
        resetDisplayedResponse();
      }
      return;
    }

    if (previousValue === "speaking" || !lastResponse.value.trim()) {
      return;
    }

    if (!audioElementRef.value?.currentSrc) {
      startWordReveal();
    }
  },
);

watch(
  () => overlayVisible.value,
  (visible) => {
    if (!visible) {
      resetDisplayedResponse();
    }
  },
);

onBeforeUnmount(() => {
  clearResponseReveal();
});
</script>

<template>
  <main class="overlay-root">
    <div class="overlay-stack">
      <Transition :name="overlayTransitionName" appear>
        <section
          v-if="overlayVisible"
          :class="['overlay-card', overlayPositionClass]"
          :style="overlayCardStyle"
        >
          <div class="overlay-status">
            <span class="status-dot" :class="displayState" />
          </div>

          <div class="overlay-bars">
            <BaseAudioLevelBars
              :is-active="
                displayState !== 'ready' &&
                displayState !== 'not_ready' &&
                displayState !== 'loading'
              "
              :current-volume="currentVolume"
              :bar-count="85"
              :bar-width="3"
              :gap="1"
              :min-height="3"
              :max-height="24"
              :height="24"
              :volume-gain="12.4"
            />
          </div>
        </section>
      </Transition>

      <Transition name="overlay-response" appear>
        <section
          v-if="overlayVisible && hasResponseCaption"
          class="overlay-response-card"
          :style="overlayCardStyle"
        >
          <div class="overlay-response-prefix" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div class="overlay-response-viewport">
            <p class="overlay-response-text">
              {{ displayedResponse }}
            </p>
          </div>
        </section>
      </Transition>
    </div>

    <audio
      ref="audioElementRef"
      class="hidden-audio"
      @playing="handleOverlayAudioPlaying"
      @ended="handleAudioEnded"
    />
    <BaseToast />
  </main>
</template>

<style scoped lang="scss">
@use "@/assets/styles/tokens.scss" as *;

.overlay-root {
  width: 100vw;
  height: 100vh;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.overlay-stack {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 5px;
  overflow: visible;
}

.overlay-card {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid $color-border-default;
  border-radius: 50px;
  background: $color-overlay-base;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(5px);
}

.overlay-bars {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  padding: 10px 12px 10px 0;
}

.overlay-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-width: 28px;
  padding-left: 18px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: $color-text-muted;
  box-shadow: 0 0 0 0 rgba($color-text-muted, 0);
  transition:
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &.recording {
    background: #ef4444;
    box-shadow: 0 0 10px 3px rgba(239, 68, 68, 0.5);
  }

  &.thinking,
  &.processing {
    background: #f5b730;
    box-shadow: 0 0 10px 3px rgba(245, 183, 48, 0.5);
  }

  &.speaking {
    background: #34d399;
    box-shadow: 0 0 10px 3px rgba(52, 211, 153, 0.5);
  }
}

.overlay-response-card {
  align-self: stretch;
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid $color-border-default;
  border-radius: 50px;
  background: $color-overlay-base;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(5px);
  padding: 0;
  overflow: hidden;
}

.overlay-response-prefix {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 12px;
  min-width: 24px;

  span {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: $color-text-muted;
    opacity: 0.8;
  }
}

.overlay-response-viewport {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: 40px;
  overflow: hidden;
  padding: 10px 12px 10px 0;
}

.overlay-response-text {
  position: absolute;
  right: 12px;
  top: 50%;
  margin: 0;
  transform: translateY(-50%);
  color: $color-text-primary;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active,
.overlay-pop-enter-active,
.overlay-pop-leave-active,
.overlay-slide-enter-active,
.overlay-slide-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-pop-enter-from,
.overlay-pop-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

.overlay-slide-enter-from,
.overlay-slide-leave-to {
  opacity: 0;
  transform: translate3d(
    var(--overlay-slide-x, 0),
    var(--overlay-slide-y, 10px),
    0
  );
}

.overlay-response-enter-active,
.overlay-response-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.overlay-response-enter-from,
.overlay-response-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.overlay-pos-top-left,
.overlay-pos-top-center,
.overlay-pos-top-right {
  --overlay-slide-x: 0;
  --overlay-slide-y: -14px;
}

.overlay-pos-bottom-left,
.overlay-pos-bottom-center,
.overlay-pos-bottom-right {
  --overlay-slide-x: 0;
  --overlay-slide-y: 14px;
}

.overlay-pos-left {
  --overlay-slide-x: -16px;
  --overlay-slide-y: 0;
}

.overlay-pos-right {
  --overlay-slide-x: 16px;
  --overlay-slide-y: 0;
}

.overlay-pos-center {
  --overlay-slide-x: 0;
  --overlay-slide-y: 10px;
}

.hidden-audio {
  display: none;
}

:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  background: transparent !important;
  overflow: hidden;
}
</style>
