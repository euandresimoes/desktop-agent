export const APP_THEME_STORAGE_KEY = "desktop-agent-theme";
export const APP_ACCENT_STORAGE_KEY = "desktop-agent-accent";
export const APP_ACCENT_MODE_STORAGE_KEY = "desktop-agent-accent-mode";

export const APP_THEME_IDS = ["dark"] as const;
export const APP_ACCENT_MODES = ["theme", "custom"] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];
export type AppAccentMode = (typeof APP_ACCENT_MODES)[number];

export interface AppSettings {
  launchMaximized: boolean;
  openOnStartup: boolean;
  closeToTray: boolean;
  autoWarmupLlm: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  microphoneGain: number;
  outputVolume: number;
  agentName: string;
  responseLanguage: string;
  customSystemPrompt: string;
  themeId: AppThemeId;
  accentMode: AppAccentMode;
  accentColor: string;
}

export type AppSettingsPatch = Partial<AppSettings>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  launchMaximized: false,
  openOnStartup: false,
  closeToTray: true,
  autoWarmupLlm: true,
  audioInputDeviceId: "",
  audioOutputDeviceId: "",
  microphoneGain: 1,
  outputVolume: 1,
  agentName: "Desktop Agent",
  responseLanguage: "Portuguese (Brazil)",
  customSystemPrompt: "",
  themeId: "dark",
  accentMode: "theme",
  accentColor: "#7c0bcd",
};

export const isAppThemeId = (value: unknown): value is AppThemeId =>
  typeof value === "string" && APP_THEME_IDS.includes(value as AppThemeId);

export const isAppAccentMode = (value: unknown): value is AppAccentMode =>
  typeof value === "string" &&
  APP_ACCENT_MODES.includes(value as AppAccentMode);
