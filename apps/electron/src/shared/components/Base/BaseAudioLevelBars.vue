<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    isActive: boolean;
    currentVolume: number;
    barCount?: number;
    minHeight?: number;
    maxHeight?: number;
    barWidth?: number;
    gap?: number;
    passiveOpacity?: number;
    volumeGain?: number;
    silenceThreshold?: number;
    height?: number;
  }>(),
  {
    barCount: 67,
    minHeight: 4,
    maxHeight: 25,
    barWidth: 3,
    gap: 2,
    passiveOpacity: 0.18,
    volumeGain: 10.5,
    silenceThreshold: 0.02,
    height: 26,
  },
);

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
  const centerIndex = (props.barCount - 1) / 2;
  const normalizedVolume = Math.min(1, Math.max(0, props.currentVolume * props.volumeGain));
  const isSilent = !props.isActive || normalizedVolume <= props.silenceThreshold;
  const volumeCurve = Math.pow(normalizedVolume, 0.92);
  const widthReach = 0.48 + volumeCurve * 0.52;

  return Array.from({ length: props.barCount }, (_, index) => {
    if (isSilent) {
      return {
        id: index,
        height: `${props.minHeight}px`,
        opacity: props.passiveOpacity,
      };
    }

    const mirroredIndex = Math.min(index, props.barCount - 1 - index);
    const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex;
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
      volumeCurve * 1.24 * spread * shape * variation * centerBias,
    );

    return {
      id: index,
      height: `${Math.max(
        props.minHeight,
        props.minHeight + intensity * (props.maxHeight - props.minHeight),
      )}px`,
      opacity: props.passiveOpacity + intensity * (1 - props.passiveOpacity),
    };
  });
});
</script>

<template>
  <div
    class="audio-level-bars"
    :style="{
      '--bars-height': `${height}px`,
      '--bar-width': `${barWidth}px`,
      '--bar-gap': `${gap}px`,
    }"
  >
    <span
      v-for="bar in bars"
      :key="bar.id"
      class="bar"
      :style="{ height: bar.height, opacity: String(bar.opacity) }"
    />
  </div>
</template>

<style scoped lang="scss">
.audio-level-bars {
  height: var(--bars-height);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--bar-gap);
  width: 100%;
  max-width: 100%;
  background: transparent;
}

.bar {
  width: var(--bar-width);
  border-radius: 999px;
  background: $color-text-primary;
  transition: height 90ms ease, opacity 120ms ease;
}
</style>
