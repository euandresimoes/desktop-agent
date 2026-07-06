<script setup lang="ts">
import { AudioLines, Computer, Monitor, Palette, SlidersHorizontal } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BaseSelect, {
  type BaseSelectOption,
} from "../../shared/components/Base/BaseSelect.vue";
import BaseSlider from "../../shared/components/Base/BaseSlider.vue";
import BaseTextarea from "../../shared/components/Base/BaseTextarea.vue";
import BaseToggle from "../../shared/components/Base/BaseToggle.vue";
import BaseInput from "../../shared/components/Base/BaseInput.vue";
import BaseAudioRecorderPreview from "../../shared/components/Base/BaseAudioRecorderPreview.vue";
import BaseSettingsModalShell from "../../shared/components/Base/BaseSettingsModalShell.vue";
import BaseSettingsRow from "../../shared/components/Base/BaseSettingsRow.vue";
import BaseSettingsSection from "../../shared/components/Base/BaseSettingsSection.vue";
import BaseSettingsSidebarItem from "../../shared/components/Base/BaseSettingsSidebarItem.vue";
import BaseSettingsAccentRow from "../../shared/components/Base/BaseSettingsAccentRow.vue";
import BaseScreenPositionPicker from "../../shared/components/Base/BaseScreenPositionPicker.vue";
import { APP_ACCENT_PRESETS } from "../../shared/config/appAccents";
import BaseSettingsThemeRow from "../../shared/components/Base/BaseSettingsThemeRow.vue";
import { APP_THEMES } from "../../shared/config/appThemes";
import { listAudioDevices } from "../../shared/services/audioDevicesService";
import { useAppSettingsService } from "../../shared/services/appSettingsService";
import {
  fetchTTSCapabilities,
  mapTTSCapabilitiesToModeOptions,
  normalizePlaybackModeAgainstCapabilities,
  type TTSCapabilitiesResponse,
} from "../../shared/services/ttsCapabilitiesService";
import {
  fetchSTTStreamingCapabilities,
  type STTStreamingCapabilitiesResponse,
} from "../../shared/services/sttStreamingCapabilitiesService";
import {
  mapSTTCapabilitiesToModeOptions,
  normalizeSTTPlaybackModeAgainstCapabilities,
} from "../../shared/services/sttPlaybackModeService";
import {
  type AppOverlayAnimation,
  type AppAccentMode,
  type AppOverlayPosition,
  type AppSettings,
  type AppSttPlaybackMode,
  type AppThemeId,
} from "../../shared/types/app-settings";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

type AppSettingsTab = "general" | "appearance" | "audio" | "overlay" | "advanced";

const LANGUAGE_OPTIONS: BaseSelectOption[] = [
  { value: "Portuguese (Brazil)", label: "Portuguese (Brazil)" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "Japanese", label: "Japanese" },
];

const OVERLAY_ANIMATION_OPTIONS: BaseSelectOption[] = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "pop", label: "Pop" },
];

const activeTab = ref<AppSettingsTab>("general");
const { settings, loadSettings, updateSettings } = useAppSettingsService();
const activeTheme = computed(
  () =>
    APP_THEMES.find((theme) => theme.id === settings.value.themeId) ??
    APP_THEMES[0],
);

const inputDevices = ref<BaseSelectOption[]>([]);
const outputDevices = ref<BaseSelectOption[]>([]);
const ttsCapabilities = ref<TTSCapabilitiesResponse | null>(null);
const sttCapabilities = ref<STTStreamingCapabilitiesResponse | null>(null);
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

const ttsPlaybackModeOptions = computed<BaseSelectOption[]>(() => {
  if (!ttsCapabilities.value) {
    return [{ value: "standard", label: "Standard" }];
  }

  return mapTTSCapabilitiesToModeOptions(ttsCapabilities.value);
});

const sttPlaybackModeOptions = computed<BaseSelectOption[]>(() =>
  mapSTTCapabilitiesToModeOptions(sttCapabilities.value),
);

const handleToggle =
  (
    key: keyof Pick<
      AppSettings,
      "launchMaximized" | "openOnStartup" | "closeToTray" | "autoWarmupLlm"
    >,
  ) =>
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

const handleVoiceDetectionSensitivityChange = (value: number) => {
  void updateSettings({ voiceDetectionSensitivity: value });
};

const handleOutputVolumeChange = (value: number) => {
  void updateSettings({ outputVolume: value });
};

const handleTtsPlaybackModeChange = (value: string) => {
  void updateSettings({
    ttsPlaybackMode: value as AppSettings["ttsPlaybackMode"],
  });
};

const handleOverlayPositionChange = (value: AppOverlayPosition) => {
  void updateSettings({ overlayPosition: value });
};

const handleOverlayOpacityChange = (value: number) => {
  void updateSettings({ overlayOpacity: value });
};

const handleOverlayAnimationChange = (value: string) => {
  void updateSettings({ overlayAnimation: value as AppOverlayAnimation });
};

const handleSttPlaybackModeChange = (value: string) => {
  void updateSettings({ sttPlaybackMode: value as AppSttPlaybackMode });
};

const queueAdvancedUpdate = () => {
  if (advancedSaveTimer) {
    clearTimeout(advancedSaveTimer);
  }

  advancedSaveTimer = setTimeout(() => {
    advancedSaveTimer = null;
    void updateSettings({
      agentName: agentNameDraft.value.trim() || "Desktop Agent",
      responseLanguage:
        responseLanguageDraft.value.trim() || "Portuguese (Brazil)",
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

const refreshTTSCapabilities = async () => {
  try {
    ttsCapabilities.value = await fetchTTSCapabilities();

    const normalizedMode = normalizePlaybackModeAgainstCapabilities(
      settings.value.ttsPlaybackMode,
      ttsCapabilities.value,
    );

    if (normalizedMode !== settings.value.ttsPlaybackMode) {
      void updateSettings({ ttsPlaybackMode: normalizedMode });
    }
  } catch {
    ttsCapabilities.value = null;
  }
};

const refreshSTTCapabilities = async () => {
  try {
    sttCapabilities.value = await fetchSTTStreamingCapabilities();

    const normalizedMode = normalizeSTTPlaybackModeAgainstCapabilities(
      settings.value.sttPlaybackMode,
      sttCapabilities.value,
    );

    if (normalizedMode !== settings.value.sttPlaybackMode) {
      void updateSettings({ sttPlaybackMode: normalizedMode });
    }
  } catch {
    sttCapabilities.value = null;
  }
};

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      void loadSettings().then(() => {
        syncDraftsFromSettings();
      });
      void refreshAudioDevices();
      void refreshSTTCapabilities();
      void refreshTTSCapabilities();
      navigator.mediaDevices?.addEventListener?.(
        "devicechange",
        refreshAudioDevices,
      );
      return;
    }

    if (advancedSaveTimer) {
      clearTimeout(advancedSaveTimer);
      advancedSaveTimer = null;
      void updateSettings({
        agentName: agentNameDraft.value.trim() || "Desktop Agent",
        responseLanguage:
          responseLanguageDraft.value.trim() || "Portuguese (Brazil)",
        customSystemPrompt: customSystemPromptDraft.value.trim(),
      });
    }

    navigator.mediaDevices?.removeEventListener?.(
      "devicechange",
      refreshAudioDevices,
    );
  },
  { immediate: true },
);

watch(
  () => [
    settings.value.agentName,
    settings.value.responseLanguage,
    settings.value.customSystemPrompt,
  ],
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

  navigator.mediaDevices?.removeEventListener?.(
    "devicechange",
    refreshAudioDevices,
  );
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
        :icon="Monitor"
        label="Overlay"
        :active="activeTab === 'overlay'"
        @click="activeTab = 'overlay'"
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
          <span
            >Hide the app to the system tray when you close the window.</span
          >
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
          <span
            >Prepare the active language model on startup for faster first
            replies.</span
          >
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
          <strong>Microphone preview</strong>
          <span
            >Record and replay a short sample to test your microphone with the
            current gain.</span
          >
        </template>
        <template #control>
          <div class="preview-wrap">
            <BaseAudioRecorderPreview
              :input-device-id="settings.audioInputDeviceId"
              :output-device-id="settings.audioOutputDeviceId"
              :input-gain="settings.microphoneGain"
            />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Microphone gain</strong>
          <span
            >Boost or tame the captured microphone signal before
            transcription.</span
          >
        </template>
        <template #control>
          <div class="slider-wrap">
            <BaseSlider
              :model-value="settings.microphoneGain"
              :min="0"
              :max="5"
              :step="0.05"
              :format-value="(value) => `${value.toFixed(2)}x`"
              @update:modelValue="handleMicrophoneGainChange"
            />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Voice sensitivity</strong>
          <span
            >Control how easily very low sounds count as voice. Lower values
            ignore more background noise.</span
          >
        </template>
        <template #control>
          <div class="slider-wrap">
            <BaseSlider
              :model-value="settings.voiceDetectionSensitivity"
              :min="0"
              :max="1"
              :step="0.01"
              :format-value="(value) => value.toFixed(2)"
              @update:modelValue="handleVoiceDetectionSensitivityChange"
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

      <BaseSettingsRow>
        <template #copy>
          <strong>STT recognition mode</strong>
          <span>
            {{
              sttCapabilities?.streaming.supported
                ? "Use standard recognition for the most stable flow, or enable streaming for live transcript feedback."
                : "Use the stable final transcription flow. Streaming is unavailable for the current STT provider."
            }}
          </span>
        </template>
        <template #control>
          <BaseSelect
            :model-value="settings.sttPlaybackMode"
            :options="sttPlaybackModeOptions"
            @update:modelValue="handleSttPlaybackModeChange"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>TTS playback mode</strong>
          <span>
            {{
              ttsCapabilities?.playbackModes.stream.experimental
                ? "Choose between standard playback and an experimental streamed delivery mode."
                : "Choose whether spoken responses should play after full synthesis or as streamed chunks."
            }}
          </span>
        </template>
        <template #control>
          <BaseSelect
            :model-value="settings.ttsPlaybackMode"
            :options="ttsPlaybackModeOptions"
            @update:modelValue="handleTtsPlaybackModeChange"
          />
        </template>
      </BaseSettingsRow>
    </BaseSettingsSection>

    <BaseSettingsSection v-if="activeTab === 'overlay'" title="Overlay">
      <BaseSettingsRow :first="true">
        <template #copy>
          <strong>Screen position</strong>
          <span>Choose where the compact voice overlay should appear when opened by hotkey.</span>
        </template>
        <template #control>
          <BaseScreenPositionPicker
            :model-value="settings.overlayPosition"
            @update:modelValue="handleOverlayPositionChange"
          />
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Keyboard shortcuts</strong>
          <span>
            Press <strong>Ctrl + Space</strong> to open the overlay already listening, and press <strong>Esc</strong> to close it.
          </span>
        </template>
        <template #control>
          <div class="shortcut-pill-wrap">
            <span class="shortcut-pill">Ctrl + Space</span>
            <span class="shortcut-pill">Esc</span>
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Overlay opacity</strong>
          <span>Adjust how translucent the floating overlay card should feel.</span>
        </template>
        <template #control>
          <div class="slider-wrap">
            <BaseSlider
              :model-value="settings.overlayOpacity"
              :min="0.45"
              :max="1"
              :step="0.01"
              :format-value="(value) => `${Math.round(value * 100)}%`"
              @update:modelValue="handleOverlayOpacityChange"
            />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Overlay animation</strong>
          <span>Choose how the overlay should animate in and out on screen.</span>
        </template>
        <template #control>
          <BaseSelect
            :model-value="settings.overlayAnimation"
            :options="OVERLAY_ANIMATION_OPTIONS"
            @update:modelValue="handleOverlayAnimationChange"
          />
        </template>
      </BaseSettingsRow>
    </BaseSettingsSection>

    <BaseSettingsSection v-if="activeTab === 'advanced'" title="Advanced">
      <BaseSettingsRow :first="true">
        <template #copy>
          <strong>Agent name</strong>
          <span
            >Define how the assistant should refer to itself during
            conversations.</span
          >
        </template>
        <template #control>
          <div class="narrow">
            <BaseInput
              v-model="agentNameDraft"
              placeholder="Desktop Agent"
              @update:modelValue="queueAdvancedUpdate"
            />
          </div>
        </template>
      </BaseSettingsRow>

      <BaseSettingsRow>
        <template #copy>
          <strong>Reply language</strong>
          <span
            >Choose the language the assistant should always use when
            answering.</span
          >
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
          <span
            >Add extra behavior instructions. The backend will merge them into
            an English system prompt automatically.</span
          >
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

.preview-wrap {
  width: min(100%, 420px);
}

.textarea-wrap {
  width: 320px;
}

.shortcut-pill-wrap {
  display: flex;
  gap: 8px;
}

.shortcut-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 86px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-surface);
}
</style>
