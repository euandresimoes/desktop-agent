<script setup lang="ts">
import { AudioLines, Computer, Palette, SlidersHorizontal } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BaseSelect, {
  type BaseSelectOption,
} from "../../shared/components/Base/BaseSelect.vue";
import BaseSlider from "../../shared/components/Base/BaseSlider.vue";
import BaseTextarea from "../../shared/components/Base/BaseTextarea.vue";
import BaseToggle from "../../shared/components/Base/BaseToggle.vue";
import BaseInput from "../../shared/components/Base/BaseInput.vue";
import BaseSettingsModalShell from "../../shared/components/Base/BaseSettingsModalShell.vue";
import BaseSettingsRow from "../../shared/components/Base/BaseSettingsRow.vue";
import BaseSettingsSection from "../../shared/components/Base/BaseSettingsSection.vue";
import BaseSettingsSidebarItem from "../../shared/components/Base/BaseSettingsSidebarItem.vue";
import BaseSettingsAccentRow from "../../shared/components/Base/BaseSettingsAccentRow.vue";
import { APP_ACCENT_PRESETS } from "../../shared/config/appAccents";
import BaseSettingsThemeRow from "../../shared/components/Base/BaseSettingsThemeRow.vue";
import { APP_THEMES } from "../../shared/config/appThemes";
import { listAudioDevices } from "../../shared/services/audioDevicesService";
import { useAppSettingsService } from "../../shared/services/appSettingsService";
import {
  type AppAccentMode,
  type AppSettings,
  type AppThemeId,
} from "../../shared/types/app-settings";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

type AppSettingsTab = "general" | "appearance" | "audio" | "advanced";

const LANGUAGE_OPTIONS: BaseSelectOption[] = [
  { value: "Portuguese (Brazil)", label: "Portuguese (Brazil)" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "Japanese", label: "Japanese" },
];

const activeTab = ref<AppSettingsTab>("general");
const { settings, loadSettings, updateSettings } = useAppSettingsService();
const activeTheme = computed(
  () => APP_THEMES.find((theme) => theme.id === settings.value.themeId) ?? APP_THEMES[0],
);

const inputDevices = ref<BaseSelectOption[]>([]);
const outputDevices = ref<BaseSelectOption[]>([]);
const agentNameDraft = ref("");
const responseLanguageDraft = ref("");
const customSystemPromptDraft = ref("");
let advancedSaveTimer: ReturnType<typeof setTimeout> | null = null;

const inputDeviceOptions = computed<BaseSelectOption[]>(() => [
  { value: "", label: "System default microphone" },
  ...inputDevices.value,
]);

const outputDeviceOptions = computed<BaseSelectOption[]>(() => [
  { value: "", label: "System default output" },
  ...outputDevices.value,
]);

const handleToggle =
  (key: keyof Pick<AppSettings, "launchMaximized" | "openOnStartup" | "closeToTray" | "autoWarmupLlm">) =>
  (value: boolean) => {
    void updateSettings({ [key]: value });
  };

const handleThemeChange = (themeId: string) => {
  void updateSettings({ themeId: themeId as AppThemeId });
};

const handleAccentModeChange = (accentMode: AppAccentMode) => {
  void updateSettings({ accentMode });
};

const handleAccentColorChange = (accentColor: string) => {
  void updateSettings({ accentColor });
};

const handleInputDeviceChange = (value: string) => {
  void updateSettings({ audioInputDeviceId: value });
};

const handleOutputDeviceChange = (value: string) => {
  void updateSettings({ audioOutputDeviceId: value });
};

const handleMicrophoneGainChange = (value: number) => {
  void updateSettings({ microphoneGain: value });
};

const handleOutputVolumeChange = (value: number) => {
  void updateSettings({ outputVolume: value });
};

const queueAdvancedUpdate = () => {
  if (advancedSaveTimer) {
    clearTimeout(advancedSaveTimer);
  }

  advancedSaveTimer = setTimeout(() => {
    advancedSaveTimer = null;
    void updateSettings({
      agentName: agentNameDraft.value.trim() || "Desktop Agent",
      responseLanguage: responseLanguageDraft.value.trim() || "Portuguese (Brazil)",
      customSystemPrompt: customSystemPromptDraft.value.trim(),
    });
  }, 220);
};

const syncDraftsFromSettings = () => {
  agentNameDraft.value = settings.value.agentName;
  responseLanguageDraft.value = settings.value.responseLanguage;
  customSystemPromptDraft.value = settings.value.customSystemPrompt;
};

const refreshAudioDevices = async () => {
  const devices = await listAudioDevices();

  inputDevices.value = devices.inputs.map((device) => ({
    value: device.id,
    label: device.label,
  }));

  outputDevices.value = devices.outputs.map((device) => ({
    value: device.id,
    label: device.label,
  }));
};

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      void loadSettings().then(() => {
        syncDraftsFromSettings();
      });
      void refreshAudioDevices();
      navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioDevices);
      return;
    }

    if (advancedSaveTimer) {
      clearTimeout(advancedSaveTimer);
      advancedSaveTimer = null;
      void updateSettings({
        agentName: agentNameDraft.value.trim() || "Desktop Agent",
        responseLanguage: responseLanguageDraft.value.trim() || "Portuguese (Brazil)",
        customSystemPrompt: customSystemPromptDraft.value.trim(),
      });
    }

    navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioDevices);
  },
  { immediate: true },
);

watch(
  () => [settings.value.agentName, settings.value.responseLanguage, settings.value.customSystemPrompt],
  () => {
    if (!props.isOpen || activeTab.value !== "advanced") {
      syncDraftsFromSettings();
    }
  },
);

onBeforeUnmount(() => {
  if (advancedSaveTimer) {
    clearTimeout(advancedSaveTimer);
  }

  navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioDevices);
});
</script>

<template>
  <BaseSettingsModalShell
    :is-open="isOpen"
    title="App Settings"
    width="58rem"
    height="46rem"
    @close="emit('close')"
  >
    <template #sidebar>
      <BaseSettingsSidebarItem
        :icon="Computer"
        label="General"
        :active="activeTab === 'general'"
        @click="activeTab = 'general'"
      />
      <BaseSettingsSidebarItem
        :icon="Palette"
        label="Appearance"
        :active="activeTab === 'appearance'"
        @click="activeTab = 'appearance'"
      />
      <BaseSettingsSidebarItem
        :icon="AudioLines"
        label="Audio"
        :active="activeTab === 'audio'"
        @click="activeTab = 'audio'"
      />
      <BaseSettingsSidebarItem
        :icon="SlidersHorizontal"
        label="Advanced"
        :active="activeTab === 'advanced'"
        @click="activeTab = 'advanced'"
      />
    </template>

    <BaseSettingsSection v-if="activeTab === 'general'" title="General">
      <BaseSettingsRow :first="true">
        <template #copy>
          <strong>Launch maximized</strong>
          <span>Open the app using a maximized window by default.</span>
        </template>
        <template #control>
          <BaseToggle
            :model-value="settings.launchMaximized"
            @update:modelValue="handleToggle('launchMaximized')($event)"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Open on startup</strong>
          <span>Launch Desktop Agent automatically when you sign in.</span>
        </template>
        <template #control>
          <BaseToggle
            :model-value="settings.openOnStartup"
            @update:modelValue="handleToggle('openOnStartup')($event)"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Close to tray</strong>
          <span>Hide the app to the system tray when you close the window.</span>
        </template>
        <template #control>
          <BaseToggle
            :model-value="settings.closeToTray"
            @update:modelValue="handleToggle('closeToTray')($event)"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Auto warm up LLM model</strong>
          <span>Prepare the active language model on startup for faster first replies.</span>
        </template>
        <template #control>
          <BaseToggle
            :model-value="settings.autoWarmupLlm"
            @update:modelValue="handleToggle('autoWarmupLlm')($event)"
          />
        </template>
      </BaseSettingsRow>
    </BaseSettingsSection>

    <BaseSettingsSection v-if="activeTab === 'appearance'" title="Appearance">
      <BaseSettingsThemeRow
        :first="true"
        title="Theme"
        description="Choose how the interface should look across the whole desktop app."
        :themes="APP_THEMES"
        :model-value="settings.themeId"
        @update:modelValue="handleThemeChange"
      />
      <BaseSettingsAccentRow
        title="Accent Color"
        description="Use the theme accent or pick a custom accent for themes that allow personalization."
        :presets="APP_ACCENT_PRESETS"
        :accent-mode="settings.accentMode"
        :accent-color="settings.accentColor"
        :theme-accent-color="activeTheme.accentColor"
        :supports-custom-accent="activeTheme.supportsCustomAccent"
        @update:accentMode="handleAccentModeChange"
        @update:accentColor="handleAccentColorChange"
      />
    </BaseSettingsSection>

    <BaseSettingsSection v-if="activeTab === 'audio'" title="Audio">
      <BaseSettingsRow :first="true">
        <template #copy>
          <strong>Input device</strong>
          <span>Choose which microphone the assistant should listen to.</span>
        </template>
        <template #control>
          <BaseSelect
            :model-value="settings.audioInputDeviceId"
            :options="inputDeviceOptions"
            @update:modelValue="handleInputDeviceChange"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Output device</strong>
          <span>Choose where the assistant voice should play back.</span>
        </template>
        <template #control>
          <BaseSelect
            :model-value="settings.audioOutputDeviceId"
            :options="outputDeviceOptions"
            @update:modelValue="handleOutputDeviceChange"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Microphone gain</strong>
          <span>Boost or tame the captured microphone signal before transcription.</span>
        </template>
        <template #control>
          <div class="slider-wrap">
            <BaseSlider
              :model-value="settings.microphoneGain"
              :min="0"
              :max="2"
              :step="0.05"
              :format-value="(value) => `${value.toFixed(2)}x`"
              @update:modelValue="handleMicrophoneGainChange"
            />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Output volume</strong>
          <span>Control the playback level used for spoken responses.</span>
        </template>
        <template #control>
          <div class="slider-wrap">
            <BaseSlider
              :model-value="settings.outputVolume"
              :min="0"
              :max="1"
              :step="0.01"
              :format-value="(value) => `${Math.round(value * 100)}%`"
              @update:modelValue="handleOutputVolumeChange"
            />
          </div>
        </template>
      </BaseSettingsRow>
    </BaseSettingsSection>

    <BaseSettingsSection v-if="activeTab === 'advanced'" title="Advanced">
      <BaseSettingsRow :first="true">
        <template #copy>
          <strong>Agent name</strong>
          <span>Define how the assistant should refer to itself during conversations.</span>
        </template>
        <template #control>
          <div class="narrow">
            <BaseInput v-model="agentNameDraft" placeholder="Desktop Agent" @update:modelValue="queueAdvancedUpdate" />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Reply language</strong>
          <span>Choose the language the assistant should always use when answering.</span>
        </template>
        <template #control>
          <BaseSelect
            v-model="responseLanguageDraft"
            :options="LANGUAGE_OPTIONS"
            @update:modelValue="queueAdvancedUpdate"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Custom system prompt</strong>
          <span>Add extra behavior instructions. The backend will merge them into an English system prompt automatically.</span>
        </template>
        <template #control>
          <div class="textarea-wrap">
            <BaseTextarea
              v-model="customSystemPromptDraft"
              placeholder="Optional extra instructions for the assistant..."
              :rows="7"
              @update:modelValue="queueAdvancedUpdate"
            />
          </div>
        </template>
      </BaseSettingsRow>
    </BaseSettingsSection>
  </BaseSettingsModalShell>
</template>

<style scoped lang="scss">
.narrow {
  width: 220px;
}

.slider-wrap {
  width: 240px;
}

.textarea-wrap {
  width: 320px;
}
</style>
