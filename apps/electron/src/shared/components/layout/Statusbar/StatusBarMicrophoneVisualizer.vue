<script setup lang="ts">
import BaseAudioLevelBars from "../../Base/BaseAudioLevelBars.vue";

const props = defineProps<{
  isRecording: boolean;
  currentVolume: number;
}>();
</script>

<template>
  <BaseAudioLevelBars
    :is-active="props.isRecording"
    :current-volume="props.currentVolume"
    :bar-count="67"
    :min-height="4"
    :max-height="25"
    :bar-width="3"
    :gap="2"
    :height="26"
    :volume-gain="10.5"
  />
</template>
