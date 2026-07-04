<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  isRecording: boolean;
  currentVolume: number;
}>();

const BAR_COUNT = 67;
const CENTER_INDEX = (BAR_COUNT - 1) / 2;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 25;
const SILENCE_THRESHOLD = 0.02;
const INPUT_GAIN = 10.5;
const phase = ref(0);

let animationTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  animationTimer = setInterval(() => {
    phase.value += 0.32;
  }, 90);
});

onBeforeUnmount(() => {
  if (animationTimer) {
    clearInterval(animationTimer);
  }
});

const bars = computed(() => {
  const normalizedVolume = Math.min(1, Math.max(0, props.currentVolume * INPUT_GAIN));
  const isSilent = !props.isRecording || normalizedVolume <= SILENCE_THRESHOLD;
  const volumeCurve = Math.pow(normalizedVolume, 0.92);
  const widthReach = 0.48 + volumeCurve * 0.52;

  return Array.from({ length: BAR_COUNT }, (_, index) => {
    if (isSilent) {
      return {
        id: index,
        height: `${MIN_HEIGHT}px`,
        opacity: 0.18,
      };
    }

    const mirroredIndex = Math.min(index, BAR_COUNT - 1 - index);
    const distanceFromCenter = Math.abs(index - CENTER_INDEX) / CENTER_INDEX;
    const reachFactor = Math.max(0, 1 - distanceFromCenter / widthReach);
    const spread = Math.pow(reachFactor, 0.82);
    const shape = 0.98 - distanceFromCenter * 0.05;
    const pairPhase = phase.value + mirroredIndex * 0.38;
    const rippleA = (Math.sin(pairPhase) + 1) / 2;
    const rippleB = (Math.sin(pairPhase * 0.72 + 1.2) + 1) / 2;
    const variation = 0.92 + rippleA * 0.12 + rippleB * 0.08;
    const centerBias = 0.97 + (1 - distanceFromCenter) * 0.04;
    const intensity = Math.min(
      1,
      volumeCurve * 1.24 * spread * shape * variation * centerBias
    );

    return {
      id: index,
      height: `${Math.max(MIN_HEIGHT, MIN_HEIGHT + intensity * (MAX_HEIGHT - MIN_HEIGHT))}px`,
      opacity: 0.18 + intensity * 0.82,
    };
  });
});
</script>

<template>
  <div :class="['mic-visualizer', { active: isRecording }]">
    <span
      v-for="bar in bars"
      :key="bar.id"
      class="bar"
      :style="{ height: bar.height, opacity: String(bar.opacity) }"
    />
  </div>
</template>

<style scoped lang="scss">
.mic-visualizer {
  height: 26px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 100%;
  max-width: 100%;
  background: transparent;
}

.bar {
  width: 3px;
  border-radius: 999px;
  background: $color-text-primary;
  transition: height 90ms ease, opacity 120ms ease;
}
</style>
