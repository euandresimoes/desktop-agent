import { ref } from "vue";
import { APP_THEMES } from "../config/appThemes";
import { syncAssistantPreferences } from "./assistantPreferencesService";
import {
  APP_ACCENT_MODE_STORAGE_KEY,
  APP_ACCENT_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  isAppAccentMode,
  isAppThemeId,
  isAppTtsPlaybackMode,
  type AppSettings,
  type AppSettingsPatch,
} from "../types/app-settings";

const settings = ref<AppSettings>({ ...DEFAULT_APP_SETTINGS });

let hasLoaded = false;
let pendingLoad: Promise<AppSettings> | null = null;
let lastSyncedAssistantFingerprint = "";

const dispatchAppearanceUpdated = () => {
  window.dispatchEvent(new Event("app-appearance-updated"));
};

const normalizeHexColor = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_APP_SETTINGS.accentColor;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const shortHex = trimmed.slice(1);

    return `#${shortHex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }

  return DEFAULT_APP_SETTINGS.accentColor;
};

const mixHexColor = (hex: string, amount: number) => {
  const normalizedHex = normalizeHexColor(hex).replace("#", "");
  const factor = Math.max(-1, Math.min(1, amount));
  const target = factor < 0 ? 0 : 255;
  const ratio = Math.abs(factor);
  const channels = normalizedHex.match(/.{1,2}/g) ?? ["7c", "0b", "cd"];

  return `#${channels
    .map((channel) => {
      const current = Number.parseInt(channel, 16);
      const mixed = Math.round(current + (target - current) * ratio);

      return mixed.toString(16).padStart(2, "0");
    })
    .join("")}`;
};

const getThemeDefinition = (themeId: AppSettings["themeId"]) =>
  APP_THEMES.find((theme) => theme.id === themeId) ?? APP_THEMES[0];

const getAssistantFingerprint = (currentSettings: AppSettings) =>
  JSON.stringify({
    agentName: currentSettings.agentName,
    responseLanguage: currentSettings.responseLanguage,
    customSystemPrompt: currentSettings.customSystemPrompt,
  });

const mergeSettings = (patch?: Partial<AppSettings>) => {
  let themeId = DEFAULT_APP_SETTINGS.themeId;
  let accentMode = DEFAULT_APP_SETTINGS.accentMode;
  let accentColor = DEFAULT_APP_SETTINGS.accentColor;
  let ttsPlaybackMode = DEFAULT_APP_SETTINGS.ttsPlaybackMode;

  if (isAppThemeId(patch?.themeId)) {
    themeId = patch.themeId;
  } else {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);

    if (isAppThemeId(storedTheme)) {
      themeId = storedTheme;
    }
  }

  if (isAppAccentMode(patch?.accentMode)) {
    accentMode = patch.accentMode;
  } else {
    const storedAccentMode = window.localStorage.getItem(
      APP_ACCENT_MODE_STORAGE_KEY,
    );

    if (isAppAccentMode(storedAccentMode)) {
      accentMode = storedAccentMode;
    }
  }

  if (typeof patch?.accentColor === "string") {
    accentColor = normalizeHexColor(patch.accentColor);
  } else {
    accentColor = normalizeHexColor(
      window.localStorage.getItem(APP_ACCENT_STORAGE_KEY),
    );
  }

  if (isAppTtsPlaybackMode(patch?.ttsPlaybackMode)) {
    ttsPlaybackMode = patch.ttsPlaybackMode;
  }

  return {
    ...DEFAULT_APP_SETTINGS,
    ...patch,
    themeId,
    accentMode,
    accentColor,
    ttsPlaybackMode,
  } satisfies AppSettings;
};

const applyTheme = (themeId: AppSettings["themeId"]) => {
  document.documentElement.setAttribute("data-theme", themeId);
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
};

const applyAccent = (currentSettings: AppSettings) => {
  const activeTheme = getThemeDefinition(currentSettings.themeId);
  const resolvedAccent =
    activeTheme.supportsCustomAccent && currentSettings.accentMode === "custom"
      ? normalizeHexColor(currentSettings.accentColor)
      : activeTheme.accentColor;

  document.documentElement.style.setProperty("--color-app-accent", resolvedAccent);
  document.documentElement.style.setProperty(
    "--color-app-accent-hover",
    mixHexColor(resolvedAccent, -0.28),
  );

  window.localStorage.setItem(
    APP_ACCENT_MODE_STORAGE_KEY,
    currentSettings.accentMode,
  );
  window.localStorage.setItem(APP_ACCENT_STORAGE_KEY, resolvedAccent);
  dispatchAppearanceUpdated();
};

const syncAssistantSettingsToBackend = async (currentSettings: AppSettings) => {
  const nextFingerprint = getAssistantFingerprint(currentSettings);

  if (nextFingerprint === lastSyncedAssistantFingerprint) {
    return;
  }

  try {
    await syncAssistantPreferences({
      agentName: currentSettings.agentName,
      responseLanguage: currentSettings.responseLanguage,
      customSystemPrompt: currentSettings.customSystemPrompt,
    });
    lastSyncedAssistantFingerprint = nextFingerprint;
  } catch {
    // The API may still be booting. Voice turn will retry syncing after reconnect.
  }
};

export function useAppSettingsService() {
  const loadSettings = async () => {
    if (hasLoaded) {
      applyTheme(settings.value.themeId);
      applyAccent(settings.value);
      void syncAssistantSettingsToBackend(settings.value);
      return settings.value;
    }

    if (!pendingLoad) {
      pendingLoad = (async () => {
        try {
          const remoteSettings = await window.electronAPI.appSettings.get();
          settings.value = mergeSettings(remoteSettings);
        } catch {
          settings.value = mergeSettings();
        }

        applyTheme(settings.value.themeId);
        applyAccent(settings.value);
        void syncAssistantSettingsToBackend(settings.value);
        hasLoaded = true;

        return settings.value;
      })();
    }

    const loadedSettings = await pendingLoad;
    pendingLoad = null;

    return loadedSettings;
  };

  const updateSettings = async (patch: AppSettingsPatch) => {
    const optimisticSettings = mergeSettings({
      ...settings.value,
      ...patch,
    });

    settings.value = optimisticSettings;

    if (patch.themeId) {
      applyTheme(optimisticSettings.themeId);
    }

    if (patch.themeId || patch.accentMode || patch.accentColor) {
      applyAccent(optimisticSettings);
    }

    try {
      const savedSettings = await window.electronAPI.appSettings.update(patch);
      settings.value = mergeSettings(savedSettings);
    } catch {
      settings.value = optimisticSettings;
    }

    applyTheme(settings.value.themeId);
    applyAccent(settings.value);
    void syncAssistantSettingsToBackend(settings.value);

    return settings.value;
  };

  return {
    settings,
    loadSettings,
    updateSettings,
    applyTheme,
    applyAccent,
    syncAssistantSettingsToBackend,
    normalizeHexColor,
  };
}
