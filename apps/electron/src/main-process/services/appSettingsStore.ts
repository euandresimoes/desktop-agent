import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_APP_SETTINGS,
  isAppAccentMode,
  isAppOverlayAnimation,
  isAppOverlayPosition,
  isAppSttPlaybackMode,
  isAppThemeId,
  isAppTtsPlaybackMode,
  type AppSettings,
  type AppSettingsPatch,
} from "../../shared/types/app-settings";
import { normalizeVoiceDetectionSensitivity } from "../../shared/services/voiceDetectionSensitivityService";

const SETTINGS_FILE_NAME = "app-settings.json";

let cachedSettings: AppSettings | null = null;

const getSettingsFilePath = () =>
  path.join(app.getPath("userData"), SETTINGS_FILE_NAME);

const sanitizePatch = (patch: AppSettingsPatch): AppSettingsPatch => {
  const nextPatch: AppSettingsPatch = {};
  const normalizeTrimmedString = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, value));
  };

  if (typeof patch.launchMaximized === "boolean") {
    nextPatch.launchMaximized = patch.launchMaximized;
  }

  if (typeof patch.openOnStartup === "boolean") {
    nextPatch.openOnStartup = patch.openOnStartup;
  }

  if (typeof patch.closeToTray === "boolean") {
    nextPatch.closeToTray = patch.closeToTray;
  }

  if (typeof patch.autoWarmupLlm === "boolean") {
    nextPatch.autoWarmupLlm = patch.autoWarmupLlm;
  }

  if (typeof patch.audioInputDeviceId === "string") {
    nextPatch.audioInputDeviceId = normalizeTrimmedString(patch.audioInputDeviceId);
  }

  if (typeof patch.audioOutputDeviceId === "string") {
    nextPatch.audioOutputDeviceId = normalizeTrimmedString(patch.audioOutputDeviceId);
  }

  if (typeof patch.microphoneGain === "number") {
    nextPatch.microphoneGain = normalizeNumber(
      patch.microphoneGain,
      DEFAULT_APP_SETTINGS.microphoneGain,
      0,
      5,
    );
  }

  if (typeof patch.voiceDetectionSensitivity === "number") {
    nextPatch.voiceDetectionSensitivity = normalizeVoiceDetectionSensitivity(
      patch.voiceDetectionSensitivity,
    );
  }

  if (typeof patch.outputVolume === "number") {
    nextPatch.outputVolume = normalizeNumber(
      patch.outputVolume,
      DEFAULT_APP_SETTINGS.outputVolume,
      0,
      1,
    );
  }

  if (typeof patch.agentName === "string") {
    nextPatch.agentName =
      normalizeTrimmedString(patch.agentName) || DEFAULT_APP_SETTINGS.agentName;
  }

  if (typeof patch.responseLanguage === "string") {
    nextPatch.responseLanguage =
      normalizeTrimmedString(patch.responseLanguage) ||
      DEFAULT_APP_SETTINGS.responseLanguage;
  }

  if (typeof patch.customSystemPrompt === "string") {
    nextPatch.customSystemPrompt = patch.customSystemPrompt.trim();
  }

  if (isAppThemeId(patch.themeId)) {
    nextPatch.themeId = patch.themeId;
  }

  if (isAppAccentMode(patch.accentMode)) {
    nextPatch.accentMode = patch.accentMode;
  }

  if (typeof patch.accentColor === "string" && patch.accentColor.trim()) {
    nextPatch.accentColor = patch.accentColor.trim();
  }

  if (isAppSttPlaybackMode(patch.sttPlaybackMode)) {
    nextPatch.sttPlaybackMode = patch.sttPlaybackMode;
  }

  if (isAppTtsPlaybackMode(patch.ttsPlaybackMode)) {
    nextPatch.ttsPlaybackMode = patch.ttsPlaybackMode;
  }

  if (typeof patch.overlayOpacity === "number") {
    nextPatch.overlayOpacity = normalizeNumber(
      patch.overlayOpacity,
      DEFAULT_APP_SETTINGS.overlayOpacity,
      0.45,
      1,
    );
  }

  if (isAppOverlayAnimation(patch.overlayAnimation)) {
    nextPatch.overlayAnimation = patch.overlayAnimation;
  }

  if (isAppOverlayPosition(patch.overlayPosition)) {
    nextPatch.overlayPosition = patch.overlayPosition;
  }

  return nextPatch;
};

const persistSettings = async (settings: AppSettings) => {
  const settingsFilePath = getSettingsFilePath();

  await mkdir(path.dirname(settingsFilePath), { recursive: true });
  await writeFile(settingsFilePath, JSON.stringify(settings, null, 2), "utf8");
};

export async function getAppSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const raw = await readFile(getSettingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as AppSettingsPatch;

    cachedSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...sanitizePatch(parsed),
    };
  } catch {
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
  }

  return cachedSettings;
}

export async function updateAppSettings(patch: AppSettingsPatch) {
  const currentSettings = await getAppSettings();
  const nextSettings: AppSettings = {
    ...currentSettings,
    ...sanitizePatch(patch),
  };

  cachedSettings = nextSettings;
  await persistSettings(nextSettings);

  return nextSettings;
}
