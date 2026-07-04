<script setup lang="ts">
import { Bot, FolderOpen, Languages, Trash2, Volume2 } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import BaseButton from "../../../shared/components/Base/BaseButton.vue";
import BaseInput from "../../../shared/components/Base/BaseInput.vue";
import BaseOption from "../../../shared/components/Base/BaseOption.vue";
import BaseSelect, { type BaseSelectOption } from "../../../shared/components/Base/BaseSelect.vue";
import BaseToggle from "../../../shared/components/Base/BaseToggle.vue";
import BaseSettingsModalShell from "../../../shared/components/Base/BaseSettingsModalShell.vue";
import BaseSettingsRow from "../../../shared/components/Base/BaseSettingsRow.vue";
import BaseSettingsSection from "../../../shared/components/Base/BaseSettingsSection.vue";
import BaseSettingsSidebarItem from "../../../shared/components/Base/BaseSettingsSidebarItem.vue";
import { useSettingsService } from "../services/settingsService";

const props = defineProps<{ isOpen: boolean }>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updated"): void;
}>();

const activeTab = ref<"llm" | "stt" | "tts">("llm");

const {
  isLoading,
  llmModels,
  activeLlmId,
  sttModels,
  activeSttId,
  ttsVoices,
  activeVoiceId,
  fetchAll,
  handleSetActive,
  handleUpdateModel,
  handleDelete,
} = useSettingsService(() => emit("updated"));

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      fetchAll();
    }
  },
  { immediate: true }
);

const llmOptions = computed<BaseSelectOption[]>(() =>
  llmModels.value.filter((m) => m.installed).map((m) => ({ value: m.id, label: m.name }))
);
const sttOptions = computed<BaseSelectOption[]>(() =>
  sttModels.value.map((m) => ({ value: m.id, label: m.name }))
);
const ttsOptions = computed<BaseSelectOption[]>(() =>
  ttsVoices.value.filter((v) => v.installed).map((v) => ({ value: v.id, label: v.name }))
);

const deviceOptions: BaseSelectOption[] = [
  { value: "cpu", label: "CPU" },
  { value: "cuda", label: "CUDA" },
  { value: "auto", label: "Auto" },
];

const computeOptions: BaseSelectOption[] = [
  { value: "int8", label: "Int8" },
  { value: "int8_float16", label: "Int8 / Float16" },
  { value: "float16", label: "Float16" },
  { value: "float32", label: "Float32" },
];

const currentLlm = computed(() => llmModels.value.find((m) => m.id === activeLlmId.value) || null);
const currentStt = computed(() => sttModels.value.find((m) => m.id === activeSttId.value) || null);
const currentTts = computed(() => ttsVoices.value.find((v) => v.id === activeVoiceId.value) || null);

const openCurrentLlmFolder = async () => {
  if (!currentLlm.value?.modelPath) {
    return;
  }

  await window.electronAPI.shell.showItemInFolder(currentLlm.value.modelPath);
};

const openCurrentSttFolder = async () => {
  if (!currentStt.value?.modelPath) {
    return;
  }

  await window.electronAPI.shell.showItemInFolder(currentStt.value.modelPath);
};

const openCurrentTtsFolder = async () => {
  if (!currentTts.value?.modelPath) {
    return;
  }

  await window.electronAPI.shell.showItemInFolder(currentTts.value.modelPath);
};
</script>

<template>
  <BaseSettingsModalShell
    :is-open="isOpen"
    title="Assistant Settings"
    width="53rem"
    height="45rem"
    @close="emit('close')"
  >
    <template #sidebar>
      <BaseSettingsSidebarItem :icon="Bot" label="Language Models" :active="activeTab === 'llm'" @click="activeTab = 'llm'" />
      <BaseSettingsSidebarItem :icon="Languages" label="Speech to Text" :active="activeTab === 'stt'" @click="activeTab = 'stt'" />
      <BaseSettingsSidebarItem :icon="Volume2" label="Text to Speech" :active="activeTab === 'tts'" @click="activeTab = 'tts'" />
    </template>

    <div v-if="isLoading" class="loading-state">Loading settings...</div>

    <template v-else>
      <BaseSettingsSection v-if="activeTab === 'llm'" title="Language Models">
        <BaseSettingsRow :first="true">
          <template #copy>
            <strong>Active model</strong>
            <span>Select which installed LLM should answer new voice turns.</span>
          </template>
          <template #control>
            <BaseSelect v-model="activeLlmId" :options="llmOptions" @update:model-value="handleSetActive('llm', $event)" />
          </template>
        </BaseSettingsRow>

        <BaseSettingsRow>
          <template #copy>
            <strong>Installed models</strong>
            <span>Manage the currently registered LLM configurations.</span>
          </template>
          <template #control>
            <div class="inline-actions">
              <BaseButton
                variant="ghost"
                label="Open Folder"
                :icon-left="FolderOpen"
                :disabled="!currentLlm?.modelPath"
                @click="openCurrentLlmFolder"
              />
            </div>
          </template>
        </BaseSettingsRow>

        <template v-if="currentLlm">
          <BaseSettingsRow>
            <template #copy><strong>Name</strong><span>Display name for the selected model.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentLlm.name" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Context size</strong><span>Maximum prompt context available to the model.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentLlm.contextSize" type="number" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Max output tokens</strong><span>Upper limit for tokens generated in each answer.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentLlm.maxTokens" type="number" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Temperature</strong><span>Controls how deterministic the model output should feel.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentLlm.temperature" type="number" step="0.1" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Repeat penalty</strong><span>Discourages repetitive phrasing in generated answers.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentLlm.repeatPenalty" type="number" step="0.05" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Actions</strong><span>Save your current changes or delete this model.</span></template>
            <template #control>
              <div class="inline-actions">
                <BaseButton variant="secondary" label="Save" @click="handleUpdateModel('llm', currentLlm)" />
                <BaseButton variant="danger" label="Delete" :icon-left="Trash2" @click="handleDelete('llm', currentLlm.id)" />
              </div>
            </template>
          </BaseSettingsRow>
        </template>
      </BaseSettingsSection>

      <BaseSettingsSection v-if="activeTab === 'stt'" title="Speech to Text">
        <BaseSettingsRow :first="true">
          <template #copy>
            <strong>Active model</strong>
            <span>Choose the speech recognition model used for transcription.</span>
          </template>
          <template #control>
            <BaseSelect v-model="activeSttId" :options="sttOptions" @update:model-value="handleSetActive('stt', $event)" />
          </template>
        </BaseSettingsRow>

        <BaseSettingsRow>
          <template #copy>
            <strong>Registered models</strong>
            <span>Add or maintain the STT engines available to the assistant.</span>
          </template>
          <template #control>
            <div class="inline-actions">
              <BaseButton
                variant="ghost"
                label="Open Folder"
                :icon-left="FolderOpen"
                :disabled="!currentStt?.modelPath"
                @click="openCurrentSttFolder"
              />
            </div>
          </template>
        </BaseSettingsRow>

        <template v-if="currentStt">
          <BaseSettingsRow>
            <template #copy><strong>Name</strong><span>Friendly name shown across the app.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentStt.name" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Device</strong><span>Preferred execution target for recognition.</span></template>
            <template #control><BaseSelect v-model="currentStt.device" :options="deviceOptions" /></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Compute format</strong><span>Choose the numerical precision used by the model.</span></template>
            <template #control><BaseSelect v-model="currentStt.computeType" :options="computeOptions" /></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Language</strong><span>Default language hint for recognition.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentStt.language" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Beam size</strong><span>Higher values may improve accuracy at the cost of speed.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentStt.beamSize" type="number" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Voice activity detection</strong><span>Filter silence and non-speech more aggressively.</span></template>
            <template #control><BaseToggle v-model="currentStt.vadFilter" /></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Actions</strong><span>Save your current changes or remove this model.</span></template>
            <template #control>
              <div class="inline-actions">
                <BaseButton variant="secondary" label="Save" @click="handleUpdateModel('stt', currentStt)" />
                <BaseButton variant="danger" label="Delete" :icon-left="Trash2" @click="handleDelete('stt', currentStt.id)" />
              </div>
            </template>
          </BaseSettingsRow>
        </template>
      </BaseSettingsSection>

      <BaseSettingsSection v-if="activeTab === 'tts'" title="Text to Speech">
        <BaseSettingsRow :first="true">
          <template #copy>
            <strong>Active voice</strong>
            <span>Choose the installed voice used for spoken responses.</span>
          </template>
          <template #control>
            <BaseSelect v-model="activeVoiceId" :options="ttsOptions" @update:model-value="handleSetActive('tts', $event)" />
          </template>
        </BaseSettingsRow>

        <BaseSettingsRow>
          <template #copy>
            <strong>Configured voices</strong>
            <span>Add or maintain the voices available for playback.</span>
          </template>
          <template #control>
            <div class="inline-actions">
              <BaseButton
                variant="ghost"
                label="Open Folder"
                :icon-left="FolderOpen"
                :disabled="!currentTts?.modelPath"
                @click="openCurrentTtsFolder"
              />
            </div>
          </template>
        </BaseSettingsRow>

        <template v-if="currentTts">
          <BaseSettingsRow>
            <template #copy><strong>Name</strong><span>Friendly name shown across the app.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentTts.name" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Sample rate</strong><span>Playback frequency used by this voice profile.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentTts.sampleRate" type="number" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Voice style</strong><span>Select the most natural sounding delivery profile.</span></template>
            <template #control><div class="option-row"><BaseOption label="Natural" :checked="currentTts.lengthScale <= 1" @select="currentTts.lengthScale = 1" /><BaseOption label="Relaxed" :checked="currentTts.lengthScale > 1" @select="currentTts.lengthScale = 1.15" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Noise scale</strong><span>Fine-tune synthesis variation.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentTts.noiseScale" type="number" step="0.05" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Noise W</strong><span>Adjust the extra prosody shaping value.</span></template>
            <template #control><div class="narrow"><BaseInput v-model="currentTts.noiseW" type="number" step="0.05" /></div></template>
          </BaseSettingsRow>
          <BaseSettingsRow>
            <template #copy><strong>Actions</strong><span>Save your current changes or remove this voice.</span></template>
            <template #control>
              <div class="inline-actions">
                <BaseButton variant="secondary" label="Save" @click="handleUpdateModel('tts', currentTts)" />
                <BaseButton variant="danger" label="Delete" :icon-left="Trash2" @click="handleDelete('tts', currentTts.id)" />
              </div>
            </template>
          </BaseSettingsRow>
        </template>
      </BaseSettingsSection>
    </template>
  </BaseSettingsModalShell>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins.scss" as *;

.narrow { width: 220px; }
.inline-actions { display: flex; gap: 8px; }
.option-row { display: flex; align-items: center; justify-content: flex-end; gap: 18px; min-width: 180px; }
.loading-state { padding: 12px 24px 28px; color: $color-text-muted; }

@media (max-width: 900px) {
  .narrow { width: 100%; }
  .option-row { width: 100%; justify-content: flex-start; }
}
</style>
