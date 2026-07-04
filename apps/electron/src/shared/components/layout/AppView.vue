<script setup lang="ts">
import VoiceTurnView from "../../../views/voice-turn/VoiceTurnView.vue";

</script>

<template>
  <main id="app-view">
    <VoiceTurnView />
  </main>
</template>

<style lang="scss" scoped>
@use "@/assets/styles/mixins.scss" as *;

#app-view {
  @include app-view-layout;
  @include app-view-style;
}
</style>
